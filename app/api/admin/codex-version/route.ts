import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import {
  readCodexUiVersion,
  fetchLatestCodexVersion,
  isNewerVersion,
} from "@/lib/codexVersion";

// Dynamic + no-store: this is a live "installed vs available" check.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated codex version status for the admin "Update Codex" panel.
 *
 * GET → `{ installed, available, updateAvailable }`:
 *   - `installed`  — the `@ancientpantheon/codex` version in node_modules now.
 *   - `available`  — the latest version published on npm (null if unreachable).
 *   - `updateAvailable` — true when `available` is strictly newer than `installed`.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const installed = readCodexUiVersion();
  const available = await fetchLatestCodexVersion();
  const updateAvailable =
    available !== null && installed !== "unknown"
      ? isNewerVersion(available, installed)
      : false;

  return Response.json(
    { installed, available, updateAvailable },
    { headers: NO_STORE },
  );
}
