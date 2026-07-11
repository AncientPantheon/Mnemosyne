"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactElement } from "react";

import "../admin.css";

// The codex tree is browser-only (the package's store/init run client-side), so
// load it with ssr:false — must be done from a client component.
const MnemosyneCodex = dynamic(() => import("./MnemosyneCodex"), {
  ssr: false,
  loading: () => (
    <div className="mnemo-admin">
      <p className="mnemo-admin-muted">Opening the Mnemosyne Codex…</p>
    </div>
  ),
});

/** The `/api/me` shape (mirrors the route handler payload). */
interface MeResponse {
  authenticated: boolean;
  name?: string;
  roles?: string[];
}

function isAncient(me: MeResponse | null): boolean {
  return Boolean(me?.authenticated && me.roles?.includes("ancient"));
}

/**
 * Ancient-only gate for the Mnemosyne Codex surface. Client-gates off `/api/me`
 * for UX; the real boundary is the ancient-gated `/api/admin/codex[/unlock]`
 * routes the codex adapter + auto-resolver call. A slim bar returns to /admin.
 */
export function MnemosyneCodexPage(): ReactElement {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: MeResponse) => {
        if (active) setMe(data);
      })
      .catch(() => {
        if (active) setMe({ authenticated: false });
      });
    return () => {
      active = false;
    };
  }, []);

  if (me === null) {
    return (
      <main className="mnemo-admin">
        <p className="mnemo-admin-muted">Checking your session…</p>
      </main>
    );
  }

  if (!me.authenticated) {
    return (
      <main className="mnemo-admin">
        <section className="mnemo-admin-gate">
          <p className="mnemo-admin-muted">
            Sign in with your AncientHub account to open the Mnemosyne Codex.
          </p>
          <a className="mnemo-admin-btn mnemo-admin-btn--primary" href="/admin/login">
            Login with AncientHub
          </a>
        </section>
      </main>
    );
  }

  if (!isAncient(me)) {
    return (
      <main className="mnemo-admin">
        <section className="mnemo-admin-gate">
          <p className="mnemo-admin-notice" role="alert">
            Not authorized — the Mnemosyne Codex requires the{" "}
            <strong>ancient</strong> role. You are signed in as{" "}
            {me.name ?? "an operator"}
            {me.roles?.length ? ` (${me.roles.join(", ")})` : ""}.
          </p>
          <a className="mnemo-admin-btn mnemo-admin-btn--ghost" href="/admin">
            ← Back to Admin
          </a>
        </section>
      </main>
    );
  }

  return (
    <>
      <div className="mnemo-bar">
        <span className="mnemo-bar-brand">
          <span className="mnemo-lambda" aria-hidden="true">
            ΛΛ
          </span>
          nemosyne · Codex
        </span>
        <div className="mnemo-bar-actions">
          <a className="mnemo-btn mnemo-btn--ghost" href="/admin">
            ← Back to Admin
          </a>
        </div>
      </div>
      <MnemosyneCodex />
    </>
  );
}

export default MnemosyneCodexPage;
