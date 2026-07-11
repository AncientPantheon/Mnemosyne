import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { getOrCreateCodexPassword } from "@/lib/mnemosyneCodexStore";

// Dynamic so the gate reads the live session on every request (never cached).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated fetch of Mnemosyne's machine codex password — the master-key
 * unlock. Mirrors the hub's `/api/admin/codex/unlock`: it hands the
 * machine-generated (never operator-typed) codex password to the ancient
 * admin's browser so the codex-ui auto-unlocks and self-execution flows resolve
 * `requestPassword()` on their own. Provisions the password on first call.
 *
 * A lean sibling of `GET /api/admin/codex` (which also returns the whole sealed
 * snapshot): the PasswordAutoResolver + lock control poll THIS on demand so they
 * never drag the backup blob across the wire just to unlock.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const password = await getOrCreateCodexPassword();
  return Response.json({ ok: true, password }, { headers: NO_STORE });
}
