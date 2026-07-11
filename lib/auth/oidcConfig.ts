/**
 * Deploy-time configuration for Mnemosyne's operator-login gate.
 *
 * Mnemosyne's admin surface is gated on the AncientHoldings hub's OpenID Connect
 * IdP (`ancientholdings.eu`). Every value here is read from the environment (the
 * server-only `.env.local` / deploy secrets) — never a checked-in public config.
 * The client is CONFIDENTIAL: `clientSecret` lives only on this server and is
 * never sent to a browser.
 *
 * The whole surface is OPTIONAL: when the required env is absent OR still carries
 * the shipped `REPLACE_ME_*` placeholders (the state before the hub registers the
 * client), the loader returns `null`. The login routes then boot dark — `/admin/login`
 * bounces home, `/api/me` reports `{authenticated:false}` — instead of crashing.
 */
export interface OidcConfig {
  /** The IdP issuer — pinned as the `iss` claim and the discovery base. */
  issuer: string;
  /** Mnemosyne's registered confidential client id (also the pinned `aud`). */
  clientId: string;
  /** The one-time confidential client secret. Server-side only. */
  clientSecret: string;
  /** The exact redirect URI registered with the hub (byte-for-byte match). */
  redirectUri: string;
  /** Secret used to sign Mnemosyne's own session + transient login-state cookies. */
  sessionSecret: string;
  /**
   * Whether cookies must carry the `Secure` attribute. TRUE for an https
   * deployment (or any production run); FALSE for http://localhost dev — a
   * `Secure` cookie over plain http is dropped by the browser, which would make
   * local login impossible.
   */
  secureCookies: boolean;
}

const DEFAULT_ISSUER = "https://ancientholdings.eu";
const DEFAULT_REDIRECT_URI = "http://localhost:3005/admin/callback";

/** The client id/secret ship as `REPLACE_ME_*` until the hub issues real creds. */
function isPlaceholder(value: string): boolean {
  return value.startsWith("REPLACE_ME");
}

/**
 * Build the OIDC config from the environment, or return `null` when the login
 * surface is not configured. Required: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
 * `SESSION_SECRET` — all present AND not the `REPLACE_ME_*` placeholders. Issuer
 * and redirect URI fall back to the known local/production values.
 *
 * @param env - the environment bag (injectable for tests); defaults to
 *   `process.env`.
 */
export function loadOidcConfig(
  env: NodeJS.ProcessEnv = process.env,
): OidcConfig | null {
  const clientId = env.OIDC_CLIENT_ID?.trim();
  const clientSecret = env.OIDC_CLIENT_SECRET?.trim();
  const sessionSecret = env.SESSION_SECRET?.trim();

  // All three secrets must be present AND real for the gate to function. Absent
  // or still placeholder ⇒ the surface stays off rather than half-wired.
  if (!clientId || !clientSecret || !sessionSecret) return null;
  if (isPlaceholder(clientId) || isPlaceholder(clientSecret)) return null;

  // A short session secret would weaken the HS256 cookie signature; require a
  // meaningful length so a misconfigured deploy fails loudly rather than quietly
  // signing forgeable cookies.
  if (sessionSecret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be at least 32 characters for a safe cookie signature",
    );
  }

  const redirectUri = env.OIDC_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;

  return {
    issuer: (env.OIDC_ISSUER?.trim() || DEFAULT_ISSUER).replace(/\/+$/, ""),
    clientId,
    clientSecret,
    redirectUri,
    sessionSecret,
    // Secure over https or any production run; plain over http://localhost dev.
    secureCookies:
      redirectUri.startsWith("https:") || env.NODE_ENV === "production",
  };
}
