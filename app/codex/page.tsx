import type { ReactElement } from "react";

import { CodexMount } from "./CodexMount.client";
import { readCodexUiVersion } from "@/lib/codexVersion";

// force-dynamic so the engine-version badge always reflects the CURRENTLY installed
// codex package version (read from node_modules per request via readCodexUiVersion)
// — never a stale build-time literal. The page renders nothing from the codex tree.
export const dynamic = "force-dynamic";

// The /codex product surface. This server page renders nothing from the codex
// packages itself — it delegates to the client wrapper, which mounts the codex
// tree via dynamic(import, { ssr: false }). Keeping the server page codex-free
// guarantees the browser-only codex tree never enters the SSR render. It DOES read
// the installed codex engine version server-side and hand it down as a badge.
export default function CodexPage(): ReactElement {
  return <CodexMount codexVersion={readCodexUiVersion()} />;
}
