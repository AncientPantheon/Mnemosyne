import { loadOidcConfig } from "./oidcConfig";
import { hasAncientRole } from "./idToken";
import { readSessionTolerant, type SessionState } from "./session";

/**
 * The outcome of the ancient-only gate. On success the verified session is handed
 * to the handler; on failure a ready-to-return JSON `Response` (401 or 403) is
 * carried so the route handler can `return gate.response` verbatim.
 */
export type AncientGateResult =
  | { ok: true; session: SessionState }
  | { ok: false; response: Response };

function deny(status: 401 | 403, error: string): AncientGateResult {
  return {
    ok: false,
    response: Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } }),
  };
}

/**
 * The reusable gate every admin route uses. Reads the session from the request's
 * Cookie header, then:
 *
 * - `401` when unconfigured (no secret ⇒ no session can exist), when no session
 *   cookie is present, or when every candidate cookie fails to verify;
 * - `403` when a valid session lacks the `ancient` role;
 * - `{ ok: true, session }` for an authenticated ancient operator.
 *
 * `secretOverride` lets tests inject the signing secret without a configured env;
 * production reads it from {@link loadOidcConfig}.
 */
export async function requireAncient(
  request: Request,
  secretOverride?: string,
): Promise<AncientGateResult> {
  const secret = secretOverride ?? loadOidcConfig()?.sessionSecret;
  if (!secret) {
    // Login is not configured — there is no way to hold a valid session, so the
    // gate is closed rather than crashing.
    return deny(401, "authentication required");
  }

  const { session } = await readSessionTolerant(request.headers.get("cookie"), secret);
  if (!session) return deny(401, "authentication required");
  if (!hasAncientRole(session.roles)) return deny(403, "the ancient role is required");

  return { ok: true, session };
}
