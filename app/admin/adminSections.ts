import type { ComponentType } from "react";

import { MnemosyneCodexPage } from "./codex/MnemosyneCodexPage.client";
import { KhronotonPage } from "./khronoton/KhronotonPage.client";
import { NetworkPage } from "./network/NetworkPage.client";
import { PythiaPage } from "./pythia/PythiaPage.client";
import { SecurityPage } from "./security/SecurityPage.client";
import { UpdateDeployPage } from "./update-deploy/UpdateDeployPage.client";

/**
 * One admin section for the sidebar + content-pane shell. `hash` is the URL fragment
 * that selects it (`/admin#<hash>`); `Pane` is its gate-free body component (the
 * shell mounts exactly one at a time inside the single AdminGate). `enabled: false`
 * renders the item greyed + inert (a planned section) — never a broken view.
 */
export interface AdminSection {
  id: string;
  icon: string;
  label: string;
  hash: string;
  enabled: boolean;
  Pane: ComponentType;
}

/** The single source of the admin menu — order here is the sidebar order. */
export const ADMIN_SECTIONS: AdminSection[] = [
  { id: "codex", icon: "🔑", label: "Mnemosyne Codex", hash: "codex", enabled: true, Pane: MnemosyneCodexPage },
  { id: "update-deploy", icon: "⬇️", label: "Update & Deploy", hash: "update-deploy", enabled: true, Pane: UpdateDeployPage },
  { id: "khronoton", icon: "🕰️", label: "Mnemosyne Khronoton", hash: "khronoton", enabled: true, Pane: KhronotonPage },
  { id: "pythia", icon: "🔮", label: "Pythia Connector", hash: "pythia", enabled: true, Pane: PythiaPage },
  { id: "security", icon: "🔒", label: "Codex Security", hash: "security", enabled: true, Pane: SecurityPage },
  { id: "network", icon: "🌐", label: "Network", hash: "network", enabled: true, Pane: NetworkPage },
];
