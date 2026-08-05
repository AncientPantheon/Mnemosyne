import { describe, it, expect, vi } from "vitest";

import { routeChainRuntimeThroughPythia } from "../lib/khronoton/pythiaRoutedRuntime";

/**
 * `routeChainRuntimeThroughPythia` — routes a Khronoton ChainRuntime's chain
 * client (dirtyRead / submit / listen) through Pythia's gateway instead of a
 * direct node, so Mnemosyne's AUTONOMOUS fires (and their pre-flight reads +
 * confirmations) flow through Pythia like everything else.
 */

const SIGNED = {
  cmd: JSON.stringify({ payload: { exec: { code: "(free.mod.fire)", data: { a: 1 } } } }),
  hash: "reqkey-123",
  sigs: [{ sig: "s" }],
};

function fakeBase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    // A node-dialing client that MUST NOT be used once wrapped.
    createClient: vi.fn(() => ({
      dirtyRead: vi.fn(async () => ({ result: { status: "success" }, gas: 999 })),
      submit: vi.fn(async () => ({ requestKey: "NODE-should-not-be-used" })),
      listen: vi.fn(async () => ({ result: { status: "success" }, reqKey: "NODE" })),
    })),
    getPactUrl: (c: string) => `https://node.example/chain/${c}/pact`,
    networkId: "stoa",
    namespace: "ns",
    gasStationAccount: "gas",
    ...overrides,
  } as never;
}

const immediateSleep = async () => {};

describe("routeChainRuntimeThroughPythia", () => {
  it("preserves the base runtime's non-client fields", () => {
    const rt = routeChainRuntimeThroughPythia(fakeBase(), { getGateway: () => ({} as never) });
    expect(rt.networkId).toBe("stoa");
    expect(rt.gasStationAccount).toBe("gas");
  });

  const PYTHIA_MODE = () => ({ mode: "pythia" as const, nodeUrl: "https://n", pythiaUrl: "https://p" });

  it("pre-fire dirtyRead PASSES THROUGH to the node client (Pythia can't simulate a signed tx); gateway.read untouched", async () => {
    const gateway = { read: vi.fn(), send: vi.fn(), poll: vi.fn() };
    const base = fakeBase(); // its node client's dirtyRead returns gas:999
    const rt = routeChainRuntimeThroughPythia(base, { getGateway: () => gateway, resolveTransport: PYTHIA_MODE });

    const out = await rt.createClient("node-url").dirtyRead(SIGNED);

    // The simulate goes to the node (full command, signer-aware), NOT Pythia /read.
    expect(out).toEqual({ result: { status: "success" }, gas: 999 });
    expect(gateway.read).not.toHaveBeenCalled();
    expect(base.createClient).toHaveBeenCalledWith("node-url");
  });

  it("submit broadcasts through Pythia /send and returns the request key", async () => {
    const gateway = { read: vi.fn(), send: vi.fn(async () => ({ requestKeys: ["rk-fire"] })), poll: vi.fn() };
    const rt = routeChainRuntimeThroughPythia(fakeBase(), { getGateway: () => gateway, resolveTransport: PYTHIA_MODE });

    const out = await rt.createClient("x").submit(SIGNED);

    expect(gateway.send).toHaveBeenCalledWith({ cmds: [SIGNED] });
    expect(out).toEqual({ requestKey: "rk-fire" });
  });

  it("submit throws if Pythia returns no request key (never silently succeeds)", async () => {
    const gateway = { read: vi.fn(), send: vi.fn(async () => ({ requestKeys: [] })), poll: vi.fn() };
    const rt = routeChainRuntimeThroughPythia(fakeBase(), { getGateway: () => gateway, resolveTransport: PYTHIA_MODE });
    await expect(rt.createClient("x").submit(SIGNED)).rejects.toThrow(/no requestKey/i);
  });

  it("listen polls Pythia until the tx is FINAL, then resolves success with the key", async () => {
    const poll = vi
      .fn()
      .mockResolvedValueOnce({ results: { rk1: { status: "pending", depth: 0 } } })
      .mockResolvedValueOnce({ results: { rk1: { status: "final", depth: 2, blockHeight: 10 } } });
    const gateway = { read: vi.fn(), send: vi.fn(), poll };
    const rt = routeChainRuntimeThroughPythia(fakeBase(), {
      getGateway: () => gateway,
      resolveTransport: PYTHIA_MODE,
      sleep: immediateSleep,
    });

    const out = await rt.createClient("x").listen({ requestKey: "rk1", chainId: "0" });

    expect(poll).toHaveBeenCalledTimes(2);
    expect(poll.mock.calls[0][0]).toEqual({ requestKeys: ["rk1"] });
    expect(out).toEqual({ result: { status: "success" }, reqKey: "rk1" });
  });

  it("listen throws (preserving the key for recovery) if finality is not reached before the deadline", async () => {
    // Never final; a monotonic clock crosses the deadline on the 2nd check.
    let t = 0;
    const gateway = {
      read: vi.fn(),
      send: vi.fn(),
      poll: vi.fn(async () => ({ results: { rk1: { status: "pending", depth: 0 } } })),
    };
    const rt = routeChainRuntimeThroughPythia(fakeBase(), {
      getGateway: () => gateway,
      resolveTransport: PYTHIA_MODE,
      sleep: immediateSleep,
      maxListenMs: 5,
      now: () => (t += 10),
    });

    await expect(rt.createClient("x").listen({ requestKey: "rk1" })).rejects.toThrow(/finality/i);
  });
});
