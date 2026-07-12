import { NextResponse, type NextRequest } from "next/server";

import { loadOidcConfig, resolveRedirect } from "@/lib/auth/oidcConfig";
import { getDiscovery } from "@/lib/auth/discovery";
import { verifyIdToken } from "@/lib/auth/idToken";
import { postForm } from "@/lib/auth/postForm";
import {
  LOGIN_COOKIE,
  SESSION_COOKIE,
  readLoginState,
  signSession,
  sessionCookieOptions,
  loginCookieOptions,
} from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Bounce home with a failure flag; the login-state cookie is always cleared. */
function fail(request: NextRequest, reason: string, secure: boolean): NextResponse {
  const res = NextResponse.redirect(
    new URL(`/?auth_error=${encodeURIComponent(reason)}`, request.url),
    302,
  );
  res.cookies.set(LOGIN_COOKIE, "", { ...loginCookieOptions(secure), maxAge: 0 });
  return res;
}

/**
 * Complete the login: verify `state` against the login-state cookie, exchange the
 * `code` server-to-server (`client_secret_basic` + PKCE `code_verifier`, via the
 * redirect-preserving {@link postForm}), verify the `id_token` against every pin,
 * then set the site-wide session cookie and redirect to `/admin`.
 */
export async function GET(request: NextRequest) {
  const cfg = loadOidcConfig();
  if (!cfg) {
    return NextResponse.redirect(new URL("/?auth_error=unconfigured", request.url), 302);
  }
  // Same host-derived redirect the login route used — the token exchange's
  // redirect_uri MUST byte-match the authorize request's (OAuth requirement).
  const { redirectUri, secureCookies: secure } = resolveRedirect(request, cfg);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const login = await readLoginState(
    request.cookies.get(LOGIN_COOKIE)?.value,
    cfg.sessionSecret,
  );

  if (!code || !returnedState || !login) return fail(request, "missing_request", secure);
  if (returnedState !== login.state) return fail(request, "state_mismatch", secure);

  const { discovery, jwks } = await getDiscovery(cfg.issuer);

  // Confidential token exchange. client_secret_basic auth; the PKCE code_verifier
  // proves this is the same agent that began the login.
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const tokenRes = await postForm(
    discovery.token_endpoint,
    {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${basic}`,
      accept: "application/json",
    },
    new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: login.codeVerifier,
    }).toString(),
  );
  if (!tokenRes.ok) return fail(request, "token_exchange", secure);

  const tokens = (await tokenRes.json().catch(() => null)) as { id_token?: string } | null;
  if (!tokens?.id_token) return fail(request, "no_id_token", secure);

  let identity;
  try {
    identity = await verifyIdToken(tokens.id_token, {
      jwks,
      issuer: cfg.issuer,
      clientId: cfg.clientId,
      expectedNonce: login.nonce,
    });
  } catch {
    return fail(request, "verify_failed", secure);
  }

  // Return to the MAIN page after login — the header then shows the operator
  // identity + the (ancient-gated) Admin Dashboard button. Not the bare panel.
  const res = NextResponse.redirect(new URL("/", request.url), 302);
  res.cookies.set(
    SESSION_COOKIE,
    await signSession(
      { sub: identity.sub, roles: identity.roles, name: identity.displayName },
      cfg.sessionSecret,
    ),
    sessionCookieOptions(secure),
  );
  // The login-state cookie has served its purpose — clear it.
  res.cookies.set(LOGIN_COOKIE, "", { ...loginCookieOptions(secure), maxAge: 0 });
  return res;
}
