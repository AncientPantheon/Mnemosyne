import type { ReactElement } from "react";

import { readCodexUiVersion } from "@/lib/codexVersion";

import { UpdateConstructorsPage } from "./UpdateConstructorsPage.client";

// Ancient-gated Update Constructors page. Reads the installed codex-ui version
// server-side (a server-only fs read) and hands it to the client control, which does
// the live /api/me gate + the interactive version check / pull. Groups the codex
// updater with the (scaffolded) Khronoton engine updater.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Update Constructors",
};

export default function Page(): ReactElement {
  return <UpdateConstructorsPage codexVersion={readCodexUiVersion()} />;
}
