"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

import "../admin.css";

// The codex tree is browser-only (the package's store/init run client-side), so
// load it with ssr:false — must be done from a client component.
const MnemosyneCodex = dynamic(() => import("./MnemosyneCodex"), {
  ssr: false,
  loading: () => <p className="mnemo-admin-muted">Opening the Mnemosyne Codex…</p>,
});

/**
 * The Mnemosyne Codex admin surface, as a gate-free PANE body. The ancient gate +
 * header + "back to admin" navigation are owned by the surrounding admin shell
 * (the shell mounts one shared gate) — this component is only the codex mount, rendered
 * in the content pane. The real security boundary remains the ancient-gated
 * `/api/admin/codex[/unlock]` routes the codex adapter calls.
 */
export function MnemosyneCodexPage(): ReactElement {
  return <MnemosyneCodex />;
}

export default MnemosyneCodexPage;
