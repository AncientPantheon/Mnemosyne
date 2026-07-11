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
const CodexApp = dynamic(() => import("./CodexApp"), {
  ssr: false,
  loading: () => (
    <div className="cxpg-app cxpg-landing">
      <div className="cxpg-card cxpg-card--status">
        <p className="cxpg-status">Loading Codex…</p>
      </div>
    </div>
  ),
});

export function CodexMount(): ReactElement {
  return <CodexApp />;
}
