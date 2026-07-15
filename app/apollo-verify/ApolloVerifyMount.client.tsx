"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

// Same SSR guard as /codex CodexMount: the codex tree pulls Buffer/window/
// browser-crypto and MUST NOT run during SSR. `ssr: false` is only honored in a
// Client Component, hence the 'use client' + lazy loader here.
const ApolloVerifyApp = dynamic(() => import("./ApolloVerifyApp"), {
  ssr: false,
  loading: () => (
    <div className="cxpg-app cxpg-landing">
      <div className="cxpg-card cxpg-card--status">
        <p className="cxpg-status">Loading…</p>
      </div>
    </div>
  ),
});

export function ApolloVerifyMount(): ReactElement {
  return <ApolloVerifyApp />;
}
