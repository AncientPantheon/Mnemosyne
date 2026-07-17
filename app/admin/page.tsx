import type { ReactElement } from "react";

import { AdminLanding } from "./AdminLanding.client";

// The ancient-only admin landing. A Hub-style host: an ancient-gated list of entry
// tiles, each linking to its own dedicated sub-page (/admin/pythia,
// /admin/update-deploy, /admin/khronoton, /admin/security, /admin/network,
// /admin/codex). The gate + interactivity live in the
// client component; this server page is a thin delegator.
export default function AdminPage(): ReactElement {
  return <AdminLanding />;
}
