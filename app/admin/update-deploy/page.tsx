import type { ReactElement } from "react";

import { UpdateConstructorsPage } from "./UpdateConstructorsPage.client";

// Ancient-gated Update Constructors page. The client control does the live /api/me
// gate and reads all constructor versions (installed vs npm-latest) from
// /api/admin/deploy, so nothing is read server-side here. The single Deploy button
// rebuilds the automaton (on-box blue-green on live; npm pull on dev).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Update Constructors",
};

export default function Page(): ReactElement {
  return <UpdateConstructorsPage />;
}
