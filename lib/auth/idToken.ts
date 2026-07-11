import { jwtVerify, type JWTVerifyGetKey } from "jose";

/** The verified operator identity Mnemosyne keeps from an `id_token`. */
export interface OperatorIdentity {
  /** Opaque stable subject — the ONLY safe local user key. */
  sub: string;
  /** Role set from the token — treated as a set, unknown entries ignored. */
  roles: string[];
  /** Display-only, mutable — never a user key. */
  email?: string;
  /** Best available human-readable label (display_name → preferred_username →
   * name → a short sub fallback). Display-only, mutable. */
  displayName: string;
}

/** Pick the friendliest display label the token offers, falling back to sub. */
function pickDisplayName(payload: Record<string, unknown>, sub: string): string {
  for (const claim of ["display_name", "preferred_username", "name"] as const) {
    const v = payload[claim];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return sub.length > 10 ? `${sub.slice(0, 10)}…` : sub;
}

/** The top admin tier. The gate on admin mutations requires exactly this. */
export const ANCIENT_ROLE = "ancient";

/**
 * Verify a hub `id_token` against EVERY pin the integration contract mandates,
 * then return the identity. Non-negotiable and all enforced here:
 *
 * - `algorithms: ['RS256']` — never trusts the token's own `alg`; this alone
 *   excludes `alg:none` and an HS256 token forged on the published RSA public key.
 * - pinned `issuer` + pinned `audience` (our `clientId`) — rejects a token minted
 *   for a different client.
 * - `nonce` equals the exact value we sent on `/authorize` — bound via the signed
 *   login-state cookie; `jwtVerify` does NOT check this itself.
 * - `clockTolerance: 60s` leeway for skew.
 *
 * @throws if any pin fails — the caller treats a throw as an auth denial.
 */
export async function verifyIdToken(
  idToken: string,
  opts: {
    jwks: JWTVerifyGetKey;
    issuer: string;
    clientId: string;
    expectedNonce: string;
  },
): Promise<OperatorIdentity> {
  const { payload } = await jwtVerify(idToken, opts.jwks, {
    issuer: opts.issuer,
    audience: opts.clientId,
    algorithms: ["RS256"],
    clockTolerance: 60,
  });

  if (typeof payload.nonce !== "string" || payload.nonce !== opts.expectedNonce) {
    throw new Error("id_token nonce mismatch");
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("id_token missing sub");
  }

  // `roles` is an ARRAY. Keep only string entries; ignore anything unrecognized
  // rather than switch-exhaustively on it. A missing/non-array claim fails closed
  // to no roles (⇒ no admin).
  const roles = Array.isArray(payload.roles)
    ? payload.roles.filter((r): r is string => typeof r === "string")
    : [];

  const identity: OperatorIdentity = {
    sub: payload.sub,
    roles,
    displayName: pickDisplayName(payload as Record<string, unknown>, payload.sub),
  };
  if (typeof payload.email === "string") identity.email = payload.email;
  return identity;
}

/**
 * The ancient-admin gate expression: admin mutations admit ONLY the top
 * `ancient` tier. `operator` (the display rewrite of the hub's internal `client`
 * role) and every lower tier are NOT admins and must not pass.
 */
export function hasAncientRole(roles: readonly string[]): boolean {
  return roles.includes(ANCIENT_ROLE);
}
