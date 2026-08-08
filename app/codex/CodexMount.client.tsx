"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

// The codex tree pulls Buffer/window/browser-crypto and MUST NOT execute during
// SSR (REVIEW H2). `ssr: false` is the load-bearing guard; it is only honored in
// a Client Component (App Router forbids ssr:false in a Server Component), which
// is why this wrapper carries the 'use client' directive. The loader is a lazy
// `() => import(...)`, so importing THIS module never pulls the codex tree — the
// heavy chunk is fetched and hydrated client-side, and the initial HTML is the
// loading fallback below.
//
// SELF-HEALING LOAD: a `next/dynamic` lazy import has NO built-in recovery — if
// the chunk fails to load (overwhelmingly a STALE chunk after a deploy: an open
// tab references hashes the new build removed, so the request 404s), the mount
// hangs on the "Loading Codex…" fallback forever and the user has to refresh by
// hand. Mnemosyne self-deploys from the admin panel, so this is a recurring
// reality. We recover automatically: on a chunk-load failure, reload ONCE to
// fetch fresh HTML + current chunk hashes. A sessionStorage latch prevents a
// reload loop if the failure is genuine (not staleness); it is cleared the moment
// the chunk loads, so a later stale-deploy failure can self-heal again.
const RELOAD_LATCH = "mnemo:codex-chunk-reloaded";

async function loadCodexApp(): Promise<{ default: (p: { codexVersion: string }) => ReactElement }> {
  try {
    const mod = await import("./CodexApp");
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(RELOAD_LATCH);
      } catch {
        /* storage unavailable — ignore */
      }
    }
    return mod as { default: (p: { codexVersion: string }) => ReactElement };
  } catch (err) {
    if (typeof window !== "undefined") {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = window.sessionStorage.getItem(RELOAD_LATCH) === "1";
        if (!alreadyReloaded) window.sessionStorage.setItem(RELOAD_LATCH, "1");
      } catch {
        /* storage unavailable — fall through and rethrow */
      }
      if (!alreadyReloaded) {
        // Fresh HTML carries the current chunk manifest — the stale reference is gone.
        window.location.reload();
      }
    }
    throw err;
  }
}

const CodexApp = dynamic(loadCodexApp, {
  ssr: false,
  loading: () => (
    <div className="cxpg-app cxpg-landing">
      <div className="cxpg-card cxpg-card--status">
        <p className="cxpg-status">Loading Codex…</p>
      </div>
    </div>
  ),
});

export function CodexMount({ codexVersion }: { codexVersion: string }): ReactElement {
  return <CodexApp codexVersion={codexVersion} />;
}
