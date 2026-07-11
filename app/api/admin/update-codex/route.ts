import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { runCodexRebuild } from "@/lib/updateCodex";

// Dynamic so the gate reads the live session on every request (never cached).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated "Update Codex" action. `401` unauthenticated, `403` non-ancient.
 * For an ancient it runs the bounded local rebuild (re-links the `file:` codex
 * packages) and returns the exit code + captured output. It never restarts the
 * running server (that would end this admin session). The version-advance/redeploy
 * behavior is Phase 6 — see {@link runCodexRebuild}.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const result = await runCodexRebuild();
  return Response.json(result, {
    status: result.ok ? 200 : 500,
    headers: NO_STORE,
  });
}
