"use client";

import type { ReactElement } from "react";

import { AdminGate } from "./AdminGate.client";

/** One admin entry tile: icon, title, one-line description, and its sub-page href. */
interface AdminEntry {
  href: string;
  icon: string;
  title: string;
  description: string;
}

const ENTRIES: AdminEntry[] = [
  {
    href: "/admin/codex",
    icon: "🔑",
    title: "Mnemosyne Codex",
    description:
      "Mnemosyne's own sealed operator codex — populate seeds & accounts; auto-unlocked.",
  },
  {
    href: "/admin/update-deploy",
    icon: "⬇️",
    title: "Update & Deploy",
    description:
      "Version status for Mnemosyne and its constructors, and the one-click Deploy.",
  },
  {
    href: "/admin/khronoton",
    icon: "🕰️",
    title: "Mnemosyne Khronoton",
    description:
      "Schedule codex-signed autonomous transactions — the automaton's heartbeat.",
  },
  {
    href: "/admin/pythia",
    icon: "🔮",
    title: "Pythia Connector",
    description: "The global Pythia gateway injected into every user's Codex.",
  },
  {
    href: "/admin/security",
    icon: "🔐",
    title: "Codex Security",
    description: "Master-key status + rotation (re-seals the codex safely).",
  },
  {
    href: "/admin/network",
    icon: "🛰️",
    title: "Network Status",
    description: "Per-chain connection status.",
  },
];

/**
 * The admin landing — a Hub-style list of entry tiles, each linking to its own
 * dedicated sub-page. Ancient-gated via {@link AdminGate}; its back link returns to
 * the Mnemosyne home (sub-pages return here to `/admin`).
 */
export function AdminLanding(): ReactElement {
  return (
    <AdminGate title="Mnemosyne Admin" backHref="/" backLabel="← Back to Mnemosyne">
      <div className="mnemo-admin-tilelist">
        {ENTRIES.map((entry) => (
          <a key={entry.href} className="mnemo-admin-tile" href={entry.href}>
            <span className="mnemo-admin-tile-icon" aria-hidden="true">
              {entry.icon}
            </span>
            <span className="mnemo-admin-tile-body">
              <span className="mnemo-admin-tile-title">{entry.title}</span>
              <span className="mnemo-admin-tile-desc">{entry.description}</span>
            </span>
          </a>
        ))}
      </div>
    </AdminGate>
  );
}

export default AdminLanding;
