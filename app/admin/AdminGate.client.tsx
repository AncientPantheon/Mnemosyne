"use client";

import { type ReactElement, type ReactNode } from "react";

import pkg from "@/package.json";
import { PantheonHeader } from "@/components/PantheonHeader";
import { useMe, type MeResponse } from "@/lib/useMe";

import "./admin.css";

function isAncient(me: MeResponse | null): boolean {
  return Boolean(me?.authenticated && me.roles?.includes("ancient"));
}

/**
 * The shared ancient-only gate for every admin page. The chrome is the shared
 * {@link PantheonHeader} (admin variant — L1 only; navigation is the sidebar), full
 * width with its own separator, sitting ABOVE the width-capped content column. Session
 * comes from the single {@link useMe} source (no bespoke fetch here). Four states:
 *  - loading (`me === null`) → "Checking your session…";
 *  - not authenticated → a "Login with AncientHub" prompt;
 *  - authenticated, not ancient → a "Not authorized" notice;
 *  - ancient → the page body ({@link children}) inside `.mnemo-admin-sections`.
 *
 * Client gating is UX only — every admin route re-gates server-side.
 */
export function AdminGate({
  title,
  children,
  backHref = "/admin",
  backLabel = "← Back to Admin",
}: {
  title?: string;
  children: ReactNode;
  backHref?: string;
  backLabel?: string;
}): ReactElement {
  const { me } = useMe();

  return (
    <>
      <PantheonHeader
        variant="admin"
        version={pkg.version}
        backHref={backHref}
        backLabel={backLabel}
      />
      <main className="mnemo-admin">
        {title ? <h1 className="mnemo-admin-title mnemo-admin-pagetitle">{title}</h1> : null}

        {me === null ? (
          <p className="mnemo-admin-muted">Checking your session…</p>
        ) : !me.authenticated ? (
          <section className="mnemo-admin-gate">
            <p className="mnemo-admin-muted">
              Sign in with your AncientHub account to manage Mnemosyne.
            </p>
            <a className="mnemo-admin-btn mnemo-admin-btn--primary" href="/admin/login">
              Login with AncientHub
            </a>
          </section>
        ) : !isAncient(me) ? (
          <section className="mnemo-admin-gate">
            <p className="mnemo-admin-notice" role="alert">
              Not authorized — the admin panel requires the <strong>ancient</strong>{" "}
              role. You are signed in as {me.name ?? "an operator"}
              {me.roles?.length ? ` (${me.roles.join(", ")})` : ""}.
            </p>
          </section>
        ) : (
          <div className="mnemo-admin-sections">{children}</div>
        )}
      </main>
    </>
  );
}

export default AdminGate;
