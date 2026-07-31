import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import {
  fetchLatestPythiaClientVersion,
  isNewerVersion,
  readPythiaClientVersion,
} from "@/lib/codexVersion";

// Dynamic + no-store: this is a live "is a newer Pythia-client published?" check.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated Pythia-client version status for the admin "Update & Deploy" panel.
 *
 * `@ancientpantheon/pythia-client` is now a Mnemosyne dependency — the package is wired in
 * and installed, so we read the real installed version from `node_modules` (mirrors the
 * codex-version/khronoton-version routes). `wired` is therefore `true`; it means "is a
 * dependency", NOT "the connector-auth capability is switched on" (that wire-in is a
 * separate, later follow-up — see `docs/work/pythia-connector-auth/design.md`).
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

  const installed = readPythiaClientVersion();
  const available = await fetchLatestPythiaClientVersion();
  const updateAvailable =
    available !== null && installed !== "unknown"
      ? isNewerVersion(available, installed)
      : false;

  return Response.json(
    { installed, available, updateAvailable, wired: true },
    { headers: NO_STORE },
  );
}
