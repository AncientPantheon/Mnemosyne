"use client";

import { useEffect, useState, type ReactElement } from "react";

import { ADMIN_SECTIONS } from "./adminSections";

/** The URL fragment (minus the leading `#`), or "" at bare `/admin`. */
function readHash(): string {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "");
}

/**
 * The admin as a two-column master–detail: a fixed sidebar menu + a content pane, the
 * Pantheonic admin shape. Routing is by URL hash so every section is deep-linkable and
 * back-navigable:
 *  - `/admin` (no hash) → the unselected empty prompt;
 *  - `/admin#<section>` → that section's pane, its sidebar item highlighted.
 * The whole shell sits inside ONE AdminGate (the ancient gate); a disabled/planned
 * section is greyed + inert and posts a short "coming later" note instead of a broken
 * view. Driven entirely by the static {@link ADMIN_SECTIONS} config.
 */
export function AdminShell(): ReactElement {
  // Start "" for a deterministic SSR/first paint, then sync to the real hash on mount.
  const [hash, setHash] = useState<string>("");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const sync = (): void => {
      setHash(readHash());
      setNote(null); // a real navigation clears any "coming later" note
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const active = ADMIN_SECTIONS.find((s) => s.hash === hash && s.enabled) ?? null;

  return (
    <div className="mnemo-admin-shell">
      <nav className="mnemo-admin-sidebar" aria-label="Admin sections">
        {ADMIN_SECTIONS.map((s) => {
          const isActive = active?.id === s.id;
          const cls =
            "mnemo-admin-navitem" +
            (isActive ? " mnemo-admin-navitem--active" : "") +
            (s.enabled ? "" : " mnemo-admin-navitem--disabled");
          return s.enabled ? (
            <a
              key={s.id}
              className={cls}
              href={`#${s.hash}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="mnemo-admin-navicon" aria-hidden="true">
                {s.icon}
              </span>
              <span>{s.label}</span>
            </a>
          ) : (
            <button
              key={s.id}
              type="button"
              className={cls}
              aria-disabled="true"
              onClick={() => setNote(`${s.label} is coming later.`)}
            >
              <span className="mnemo-admin-navicon" aria-hidden="true">
                {s.icon}
              </span>
              <span>{s.label}</span>
              <span className="mnemo-admin-navbadge">soon</span>
            </button>
          );
        })}
      </nav>

      <div className="mnemo-admin-pane">
        {active ? (
          <>
            <h1 className="mnemo-admin-pagetitle">{active.label}</h1>
            <active.Pane />
          </>
        ) : note ? (
          <p className="mnemo-admin-muted mnemo-admin-emptyprompt">{note}</p>
        ) : (
          <p className="mnemo-admin-muted mnemo-admin-emptyprompt">
            Select a section from the left to begin.
          </p>
        )}
      </div>
    </div>
  );
}

export default AdminShell;
