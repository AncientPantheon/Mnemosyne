import { NextResponse, type NextRequest } from "next/server";

import { loadOidcConfig, resolveRedirect, siteUrl } from "@/lib/auth/oidcConfig";
import { getDiscovery } from "@/lib/auth/discovery";
import { createLoginChallenge } from "@/lib/auth/pkce";
import {
  LOGIN_COOKIE,
  signLoginState,
  loginCookieOptions,
} from "@/lib/auth/session";

// Never cached — each visit mints fresh state/nonce/PKCE and redirects to the hub.
export const dynamic = "force-dynamic";

/**
 * Begin the operator login: mint `state`/`nonce`/PKCE, stash them in a signed
 * login-state cookie, and 302 to the hub's `authorization_endpoint`. When login
 * is unconfigured (placeholder creds), bounce home with an error flag instead of
 * crashing — the surface stays inert until the hub registers the client.
 */
export async function GET(request: NextRequest) {
  const cfg = loadOidcConfig();
  if (!cfg) {
    return NextResponse.redirect(siteUrl(request, "/?auth_error=unconfigured"), 302);
  }

  // Derive the redirect URI (+ secure flag) from the request host, so the hub
  // returns to whatever origin this login began on — never a hard-coded localhost.
  const { redirectUri, secureCookies } = resolveRedirect(request, cfg);

  const { discovery } = await getDiscovery(cfg.issuer);
  const challenge = createLoginChallenge();

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    // `roles` is required — omitting it locks admin out (no role claim to gate on).
    scope: "openid profile email roles",
    state: challenge.state,
    nonce: challenge.nonce,
    code_challenge: challenge.codeChallenge,
    code_challenge_method: "S256",
  });

  const res = NextResponse.redirect(
    `${discovery.authorization_endpoint}?${params}`,
    302,
  );
  res.cookies.set(
    LOGIN_COOKIE,
    await signLoginState(
      {
        state: challenge.state,
        nonce: challenge.nonce,
        codeVerifier: challenge.codeVerifier,
      },
      cfg.sessionSecret,
    ),
    loginCookieOptions(secureCookies),
  );
  return res;
}
