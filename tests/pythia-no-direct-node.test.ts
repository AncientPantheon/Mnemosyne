import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Compliance guard for the load-bearing rule (`organs/06` §6): Mnemosyne routes
 * ALL on-chain traffic — reads, simulations, sends, AND autonomous Khronoton
 * fires — through Pythia. A direct-to-node connection is permitted ONLY via
 * admin-gated settings, never a per-user field or a silent fallback.
 *
 * These are source-contract assertions (the network/runtime wiring can't be
 * exercised without a browser mount / live chain), pinning the invariant so a
 * future edit that reintroduces a non-admin direct-node path fails here.
 */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("no non-admin direct-node path remains", () => {
  it("the codex network model builds NO per-user StoaChain node connection", () => {
    const src = read("app", "codex", "networkSettings.ts");
    // The direct-node local connection factory is gone; StoaChain resolves through
    // the global Pythia connection or not at all.
    expect(src).not.toMatch(/createStoaChainConnection\(/);
    expect(src).toMatch(/\[STOACHAIN_CHAIN_ID\]:\s*undefined/);
  });

  it("the codex signing clients route reads AND sends through Pythia, never a node /local or /send", () => {
    const src = read("app", "codex", "codexRelaySigningClient.ts");
    // No chainweb node pact endpoints are constructed anywhere in the signing path.
    expect(src).not.toMatch(/pact\/api\/v1\/(local|send|poll)/);
    expect(src).toMatch(/stoachain\/read/);
    expect(src).toMatch(/stoachain\/send/);
  });

  it("the Khronoton runtime routes through Pythia unless the admin-gated env opt-out is set", () => {
    const src = read("lib", "khronoton", "runtime.ts");
    expect(src).toMatch(/routeChainRuntimeThroughPythia/);
    // The ONLY way to get a direct-node runtime is the admin-gated env flag.
    expect(src).toMatch(/MNEMOSYNE_KHRONOTON_DIRECT_NODE/);
  });
});
