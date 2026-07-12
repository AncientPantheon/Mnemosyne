import type { ReactElement } from "react";

import { KhronotonPage } from "./KhronotonPage.client";

// Ancient-gated Mnemosyne Khronoton scaffold. A placeholder for the autonomous-
// transaction scheduler that turns Mnemosyne into a full Pantheonic Automaton once the
// Khronoton engine package is wired in (see docs/handoffs/03-khronoton-automaton-package.md).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Mnemosyne Khronoton",
};

export default function Page(): ReactElement {
  return <KhronotonPage />;
}
