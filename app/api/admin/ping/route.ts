import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";

// Dynamic so the gate reads the live session on every request (never cached).
export const dynamic = "force-dynamic";

/**
 * An ancient-gated placeholder that makes the 401/403/200-by-role gate testable
 * before the real admin mutations exist. `401` unauthenticated, `403` when not
 * `ancient`, `200 {ok:true}` for an ancient operator. Future admin routes reuse
 * the same {@link requireAncient} guard.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;
  return Response.json(
    { ok: true, operator: gate.session.name },
    { headers: { "Cache-Control": "no-store" } },
  );
}
