"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";

import { AdminGate } from "../AdminGate.client";

/**
 * Mnemosyne Khronoton — the ancient admin's autonomous-transaction scheduler,
 * WIRED TO THE LIVE ENGINE (`@ancientpantheon/khronoton-core`): the sealed
 * operator codex signs scheduled transactions with no human in the loop, making
 * Mnemosyne a full Pantheonic Automaton (Codex + Pythia + Khronoton).
 *
 * The real package UI (List / Detail-Observe / Builder) mounts here over the
 * ancient-gated `/api/admin/khronoton` route surface; the tick loop runs in the
 * server (instrumentation.ts). This replaced the static mockup iframe the page
 * framed before the engine wire-in (handoff 05).
 *
 * `ssr: false` — the screens poll and read browser state; same SSR guard as the
 * codex mount (only honored in a Client Component, hence this wrapper file).
 */
const KhronotonApp = dynamic(() => import("./KhronotonApp"), {
  ssr: false,
  loading: () => <p className="mnemo-admin-muted">Loading the Khronoton console…</p>,
});

export function KhronotonPage(): ReactElement {
  return (
    <AdminGate title="Mnemosyne Khronoton">
      <KhronotonApp />
    </AdminGate>
  );
}

export default KhronotonPage;
