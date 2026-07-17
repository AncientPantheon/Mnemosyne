import type { ReactElement } from "react";

import { UpdateDeployPage } from "./UpdateDeployPage.client";

// Ancient-gated Update & Deploy page. The client control does the live /api/me
// gate and reads the app + all constructor versions (installed vs latest) from
// /api/admin/deploy, so nothing is read server-side here. The single Deploy button
// rebuilds the automaton (on-box blue-green on live; npm pull on dev).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Update & Deploy",
};

export default function Page(): ReactElement {
  return <UpdateDeployPage />;
}
