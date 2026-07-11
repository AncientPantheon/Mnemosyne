import type { ReactElement } from "react";

import { CodexMount } from "./CodexMount.client";

// The /codex product surface. This server page renders nothing from the codex
// packages itself — it delegates to the client wrapper, which mounts the codex
// tree via dynamic(import, { ssr: false }). Keeping the server page codex-free
// guarantees the browser-only codex tree never enters the SSR render.
export default function CodexPage(): ReactElement {
  return <CodexMount />;
}
