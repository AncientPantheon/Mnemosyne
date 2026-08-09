import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Compliance guard for the rule (`organs/06` §6 + `HANDOFF-mnemosyne-network-fallback.md`):
 * Mnemosyne routes ALL on-chain traffic — reads, simulations, sends, and the
 * autonomous Khronoton fires — through Pythia BY DEFAULT. A direct-to-node path
 * exists ONLY behind the admin-gated Network Fallback (`transportFallback:
 * "direct-node"`), never as a silent/default/per-user fallback.
 *
 * Source-contract assertions pin the invariant so a future edit that reintroduces
 * an UNGATED direct-node path fails here.
 */
const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("direct-node exists only behind the admin Network Fallback", () => {
  it("the codex network model builds a node connection ONLY in the direct-node branch (default = Pythia/none)", () => {
    const src = read("app", "codex", "networkSettings.ts");
    // The default branch has no local StoaChain node connection.
    expect(src).toMatch(/\[STOACHAIN_CHAIN_ID\]:\s*undefined/);
    // A direct node connection is built only when the admin fallback mode is on.
    expect(src).toMatch(/mode === "direct-node"/);
    expect(src).toMatch(/createStoaChainConnection/);
  });

  it("the codex clients route SEND + DISPLAY reads through Pythia; only the signed simulate is node-direct", () => {
    const src = read("app", "codex", "codexRelaySigningClient.ts");
    // Metered SEND through Pythia (default) — node only under the fallback.
    expect(src).toMatch(/stoachain\/send/);
    expect(src).toMatch(/mode === "direct-node"/);
    // DISPLAY reads (no signers) route through Pythia's KEYED /read (organs/06 §6a).
    expect(src).toMatch(/stoachain\/read/);
    // The lane split: only a signed-tx SIMULATE (declares signers) stays node-direct /local.
    expect(src).toMatch(/commandHasSigners/);
    expect(src).toMatch(/api\/v1\/local/);
  });

  it("the Khronoton runtime routes through Pythia and branches to a node only on the fallback mode", () => {
    const runtime = read("lib", "khronoton", "runtime.ts");
    expect(runtime).toMatch(/routeChainRuntimeThroughPythia/);
    const wrapper = read("lib", "khronoton", "pythiaRoutedRuntime.ts");
    expect(wrapper).toMatch(/mode === "direct-node"/);
    expect(wrapper).toMatch(/resolveServerTransport|resolveTransport/);
  });

  it("the direct-node toggle is admin-gated (requireAncient on the write route)", () => {
    const route = read("app", "api", "admin", "network-fallback", "route.ts");
    expect(route).toMatch(/requireAncient/);
  });
});
