import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { fetchLatestKhronotonVersion } from "@/lib/codexVersion";

// Dynamic + no-store: this is a live "is the Khronoton package published yet?" check.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated Khronoton version status for the admin "Update Constructors" panel.
 *
 * The Khronoton automaton engine (`@ancientpantheon/khronoton-core`) is NOT yet a
 * Mnemosyne dependency — it is being built into a plug-and-play package (see
 * `docs/handoffs/03-khronoton-automaton-package.md`). So there is no installed version
 * to read: `installed` is the sentinel `"not wired"` and `wired` is `false`. We still
 * surface `available` — the latest version published on npm — so the operator can see
 * the package exists and is progressing before it is wired in.
 *
 * GET → `{ installed: "not wired", available, updateAvailable: false, wired: false }`:
 *   - `available` — the latest version published on npm (null if unreachable).
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const available = await fetchLatestKhronotonVersion();

  return Response.json(
    { installed: "not wired", available, updateAvailable: false, wired: false },
    { headers: NO_STORE },
  );
}
