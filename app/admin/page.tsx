import type { ReactElement } from "react";

import { readCodexUiVersion } from "@/lib/codexVersion";

import { AdminPanel } from "./AdminPanel.client";

// The ancient-only admin panel host. This server page reads the installed codex-ui
// version (a server-side fs read) and hands it to the client panel, which does the
// live /api/me gate + the interactive controls. The panel is a SHELL: later phases
// (the Automaton operator-identity section) contribute additional sections into it
// without re-scaffolding the host.
export default function AdminPage(): ReactElement {
  return <AdminPanel codexVersion={readCodexUiVersion()} />;
}
