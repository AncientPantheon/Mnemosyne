"use client";

import type { ReactElement } from "react";

import { AdminGate } from "../AdminGate.client";

/**
 * Mnemosyne Khronoton (SCAFFOLD): the future home of the ancient admin's autonomous-
 * transaction scheduler. Once the Khronoton engine package is wired in, Mnemosyne's
 * sealed operator codex will sign scheduled transactions with no human in the loop —
 * making Mnemosyne a full Pantheonic Automaton (Codex + Pythia + Khronoton). Until
 * then this is a clean, on-brand placeholder: no real builder logic, the "New
 * scheduled transaction" action disabled.
 */
function KhronotonSection(): ReactElement {
  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Autonomous transactions</h2>
      <p className="mnemo-admin-muted">
        This is where the ancient admin will schedule codex-signed transactions that
        Mnemosyne fires on its own — no human in the loop. Wiring the Khronoton engine
        onto the existing Codex (signing) and Pythia (network) makes Mnemosyne a full{" "}
        <strong>Pantheonic Automaton</strong>: Codex + Pythia + Khronoton.
      </p>
      <p className="mnemo-admin-muted">
        It depends on the Khronoton engine package being built (see{" "}
        <code>docs/handoffs/03-khronoton-automaton-package.md</code>). Once wired, the
        sealed operator codex signs each scheduled transaction with no human — the same
        auto-unlocked master-key seal Mnemosyne already uses for manual operations.
      </p>
      <p className="mnemo-admin-status">Coming soon</p>
      <button
        type="button"
        className="mnemo-admin-btn mnemo-admin-btn--primary"
        disabled
        title="Available once the Khronoton package is wired"
      >
        New scheduled transaction
      </button>
    </section>
  );
}

export function KhronotonPage(): ReactElement {
  return (
    <AdminGate title="Mnemosyne Khronoton">
      <KhronotonSection />
    </AdminGate>
  );
}

export default KhronotonPage;
