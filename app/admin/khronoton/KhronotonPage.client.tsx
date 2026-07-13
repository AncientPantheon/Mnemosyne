"use client";

import type { ReactElement } from "react";

import { AdminGate } from "../AdminGate.client";

/**
 * Mnemosyne Khronoton — the ancient admin's autonomous-transaction scheduler. Once
 * wired to the live engine (`@ancientpantheon/khronoton-core/server`), Mnemosyne's
 * sealed operator codex signs scheduled transactions with no human in the loop —
 * making Mnemosyne a full Pantheonic Automaton (Codex + Pythia + Khronoton).
 *
 * RIGHT NOW this frames the package's static UI **mockup** for visual review (per
 * docs/handoffs/04-khronoton-ui-mockup-embed.md): the 4 views (Cronotons list, the
 * two-pane Pact builder, Observe fire-history, Public read-only) + the consumer-theme
 * recolor switcher. It is NOT wired to any engine or store — the live engine wire-in
 * (docs/handoffs/05-khronoton-engine-wire-in.md) is gated behind the ancient admin's
 * standing "finalize all three Constructors first" decision. The mockup is served raw
 * from `public/khronoton-mockup.html`; replacing this iframe with the real
 * `<KhronotonProvider>` mount (like app/admin/codex/MnemosyneCodex.tsx) is the 0.3.0
 * `/ui` follow-up.
 */
function KhronotonSection(): ReactElement {
  return (
    <section
      className="mnemo-admin-card"
      style={{ padding: 0, overflow: "hidden" }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid var(--admin-border, #2a241c)",
        }}
      >
        <h2 className="mnemo-admin-h2" style={{ margin: 0 }}>
          Autonomous transactions
        </h2>
        <p className="mnemo-admin-muted" style={{ margin: "4px 0 0" }}>
          Mockup preview of the planned Khronoton UI (
          <code>@ancientpantheon/khronoton-core/ui</code>). Explore the four views and
          the <em>consumer theme</em> switcher inside the frame. Not yet wired to the
          live engine — that&apos;s gated behind finalizing all three Constructors (see{" "}
          <code>docs/handoffs/05-khronoton-engine-wire-in.md</code>).
        </p>
      </div>
      <iframe
        title="Khronoton UI mockup"
        src="/khronoton-mockup.html"
        style={{
          width: "100%",
          height: "82vh",
          border: "none",
          display: "block",
          background: "#0a0a0f",
        }}
      />
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
