import type { ReactElement } from "react";

import { AdminGate } from "./AdminGate.client";
import { AdminShell } from "./AdminShell.client";

// The ancient-only admin: a single sidebar + content-pane shell behind ONE shared
// AdminGate. Sections are selected by URL hash (/admin#codex, /admin#khronoton, …) —
// see AdminShell + adminSections.ts. Deep-linkable and back-navigable.
export const metadata = {
  title: "Mnemosyne Admin",
};

export default function AdminPage(): ReactElement {
  return (
    <AdminGate backHref="/" backLabel="← Back to Mnemosyne">
      <AdminShell />
    </AdminGate>
  );
}
