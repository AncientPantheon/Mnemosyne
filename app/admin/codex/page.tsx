import type { ReactElement } from "react";

import { MnemosyneCodexPage } from "./MnemosyneCodexPage.client";

// Force-dynamic: the gate + codex custody read the live session; nothing here is
// safe to statically cache.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mnemosyne Codex",
};

export default function Page(): ReactElement {
  return <MnemosyneCodexPage />;
}
