import { SignJWT, jwtVerify } from "jose";

/**
 * Mnemosyne's OWN cookie signing — HS256 over `SESSION_SECRET`. This is unrelated
 * to the hub's RS256 id_token; it protects two first-party cookies:
 *
 * - the TRANSIENT login-state (`purpose: "login"`) carrying `state` + `nonce` +
 *   PKCE `codeVerifier` across the `/authorize` round-trip, and
 * - the post-login SESSION (`purpose: "session"`) carrying `sub` + `roles` + name.
 *
 * Both are signed so a tampered/forged cookie is rejected, and both carry an `exp`
 * so they self-expire. The `purpose` claim keeps the two from being interchanged.
 */
export const LOGIN_COOKIE = "mnemosyne_login";
export const SESSION_COOKIE = "mnemosyne_session";

/** Transient state persisted across the redirect to the hub and back. */
export interface LoginState {
  purpose: "login";
  state: string;
  nonce: string;
  codeVerifier: string;
}

/** The authenticated session Mnemosyne keeps after a successful login. */
export interface SessionState {
  purpose: "session";
  sub: string;
  roles: string[];
  /** Human-readable label for the header (display_name/username/…). */
  name: string;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

/** Sign an arbitrary cookie payload with an absolute `exp` `ttlSeconds` out. */
async function signCookie(
  payload: Record<string, unknown>,
  secret: string,
  ttlSeconds: number,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key(secret));
}

/** Verify + decode a cookie; returns `null` on any signature/expiry failure. */
async function verifyCookie<T>(
  token: string | undefined,
  secret: string,
): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
    });
    return payload as T;
  } catch {
    return null;
  }
}

// Login round-trips are short; 10 minutes is ample and bounds how long a stale
// challenge cookie is accepted.
const LOGIN_TTL_SECONDS = 10 * 60;
// The operator session; re-login is cheap (Mnemosyne holds its own session, so an
// expiry just re-bounces through `/authorize`).
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export function signLoginState(
  state: Omit<LoginState, "purpose">,
  secret: string,
): Promise<string> {
  return signCookie({ ...state, purpose: "login" }, secret, LOGIN_TTL_SECONDS);
}

export async function readLoginState(
  token: string | undefined,
  secret: string,
): Promise<LoginState | null> {
  const payload = await verifyCookie<LoginState>(token, secret);
  return payload?.purpose === "login" ? payload : null;
}

export function signSession(
  session: Omit<SessionState, "purpose">,
  secret: string,
): Promise<string> {
  return signCookie(
    { ...session, purpose: "session" },
    secret,
    SESSION_TTL_SECONDS,
  );
}

export async function readSession(
  token: string | undefined,
  secret: string,
): Promise<SessionState | null> {
  const payload = await verifyCookie<SessionState>(token, secret);
  return payload?.purpose === "session" ? payload : null;
}

/** The attributes shared by both first-party cookies. */
export interface CookieOptions {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
}

/**
 * Options for the transient login-state cookie.
 *
 * Path-scoped to `/admin` — the login/callback routes live under `/admin/*`
 * (`/admin/login` sets it, `/admin/callback` reads it), so the cookie MUST be
 * sent to `/admin/callback`; a narrower path would never reach the callback and
 * every login would silently fail (the classic OIDC cookie-path trap).
 * SameSite=Lax so the top-level navigation BACK from the hub still carries it.
 * `secure` is caller-derived (see {@link OidcConfig.secureCookies}) — a Secure
 * cookie over http://localhost is dropped by the browser, which would break
 * local login.
 */
export function loginCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/admin",
    maxAge: LOGIN_TTL_SECONDS,
  };
}

/**
 * Options for the site-wide session cookie. Path `/` so the whole site — the
 * header and every gated API — sees the login. HttpOnly + SameSite=Lax (Lax also
 * gives CSRF protection: cross-site POSTs won't send it). `secure` is caller-derived.
 */
export function sessionCookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

/**
 * Read the operator session tolerant of DUPLICATE cookies of the same name.
 *
 * A browser may hold more than one `mnemosyne_session` (e.g. a path-scoped stale
 * one from a prior build) and per RFC 6265 sends the longer-path cookie FIRST. A
 * naive single-value read would pick the stale one and 401 even though a valid
 * session sits right behind it. We scan EVERY `mnemosyne_session` value in the raw
 * Cookie header and admit if ANY verifies. Each candidate still passes `jwtVerify`
 * (signature + exp + purpose), so trying several is safe — a forged or stale
 * cookie can never be admitted, it is just skipped.
 */
export async function readSessionTolerant(
  cookieHeader: string | null | undefined,
  secret: string,
): Promise<{ session: SessionState | null; sawCookie: boolean }> {
  if (!cookieHeader) return { session: null, sawCookie: false };
  let sawCookie = false;
  for (const pair of cookieHeader.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    sawCookie = true;
    const raw = pair.slice(eq + 1).trim();
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      /* not percent-encoded — use as-is */
    }
    const session = await readSession(value, secret);
    if (session) return { session, sawCookie: true };
  }
  return { session: null, sawCookie };
}
