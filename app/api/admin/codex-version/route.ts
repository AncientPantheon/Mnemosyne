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

  // "bundle" = the built standalone (prod) — codex is compiled in, so an in-app
  // npm pull can't change the running app; the update path is a redeploy. "dev" =
  // localhost, where the pull re-installs node_modules and a reload picks it up.
  const deployMode = process.env.NODE_ENV === "production" ? "bundle" : "dev";

  return Response.json(
    { installed, available, updateAvailable, deployMode },
    { headers: NO_STORE },
  );
}
