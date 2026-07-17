import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import {
  fetchLatestKhronotonVersion,
  isNewerVersion,
  readKhronotonUiVersion,
} from "@/lib/codexVersion";

// Dynamic + no-store: this is a live "is a newer Khronoton published?" check.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated Khronoton version status for the admin "Update & Deploy" panel.
 *
 * The Khronoton automaton engine (`@ancientpantheon/khronoton-core`) is now a Mnemosyne
 * dependency — the package is wired in and installed, so we read the real installed
 * version from `node_modules` (mirrors the codex-version route). `wired` is therefore
 * `true`; it means "is a dependency", NOT "the autonomous engine is switched on" (that
 * signing wire-in is a separate, Pythia-gated follow-up — see
 * `docs/handoffs/05-khronoton-engine-wire-in.md`).
 *
 * GET → `{ installed, available, updateAvailable, wired: true }`:
 *   - `installed`   — the version installed in this build (`"unknown"` if unreadable).
 *   - `available`   — the latest version published on npm (null if unreachable).
 *   - `updateAvailable` — true when npm is strictly newer than installed.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const installed = readKhronotonUiVersion();
  const available = await fetchLatestKhronotonVersion();
  const updateAvailable =
    available !== null && installed !== "unknown"
      ? isNewerVersion(available, installed)
      : false;

  return Response.json(
    { installed, available, updateAvailable, wired: true },
    { headers: NO_STORE },
  );
}
