import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * §7e consumer-side self-heal (`organs/06` §7) — Mnemosyne PROXIES gated calls, so
 * a dead ephemeral key arrives as a returned BODY or a re-thrown error, not a
 * clean transport 401. These cover the four helpers + the invariant that a
 * key-miss (thrown OR in the body) heals once and retries once.
 */
const { readAdminSettingsMock, readConnectorStateMock, DualLinkConnectorMock, keyProviderInner } =
  vi.hoisted(() => {
    const keyProviderInner = vi.fn(async () => "fresh-secret");
    return {
      readAdminSettingsMock: vi.fn(() => ({ pythiaUrl: "http://pythia.test" })),
      readConnectorStateMock: vi.fn(() => ({
        dualLinkKey: "STD|SMT",
        standardApollo: "STD",
        smartApollo: "SMT",
        linkedAt: "2026-08-08T00:00:00.000Z",
      })),
      DualLinkConnectorMock: vi.fn().mockImplementation(() => ({
        keyProvider: () => keyProviderInner,
        asKeySource: () => ({ get: vi.fn(), invalidate: vi.fn(async () => {}) }),
        invalidate: vi.fn(async () => {}),
      })),
      keyProviderInner,
    };
  });

vi.mock("../lib/adminSettings", () => ({ readAdminSettings: readAdminSettingsMock }));
vi.mock("../lib/pythia/connectorStatus", () => ({ readConnectorState: readConnectorStateMock }));
vi.mock("../lib/pythia/apolloSigner", () => ({
  createMnemosyneApolloSigner: (a: string) => ({ __a: a }),
}));
vi.mock("@ancientpantheon/pythia-client", () => ({
  PythiaClient: vi.fn(),
  DualLinkConnector: DualLinkConnectorMock,
  splitDualLinkKey: () => ({ standardApollo: "STD", smartApollo: "SMT" }),
}));

const KEY_MISS = "invalid or expired connector key";

beforeEach(() => {
  vi.resetModules();
  DualLinkConnectorMock.mockClear();
  keyProviderInner.mockClear();
});

async function load() {
  return import("../lib/pythia/connectorClient");
}

describe("isConnectorKeyMiss", () => {
  it("matches the key-miss message in a thrown Error, a string, or a returned body", async () => {
    const { isConnectorKeyMiss } = await load();
    expect(isConnectorKeyMiss(new Error(`Signing failed: ${KEY_MISS}`))).toBe(true);
    expect(isConnectorKeyMiss(KEY_MISS)).toBe(true);
    expect(isConnectorKeyMiss({ error: KEY_MISS })).toBe(true);
    expect(isConnectorKeyMiss({ nested: { error: KEY_MISS } })).toBe(true);
  });
  it("is false for unrelated errors/bodies", async () => {
    const { isConnectorKeyMiss } = await load();
    expect(isConnectorKeyMiss(null)).toBe(false);
    expect(isConnectorKeyMiss(new Error("pool exhausted"))).toBe(false);
    expect(isConnectorKeyMiss({ requestKeys: ["rk"] })).toBe(false);
  });
});

describe("withConnectorSelfHeal", () => {
  it("returns the result unchanged when there is no key-miss (no heal)", async () => {
    const { withConnectorSelfHeal } = await load();
    const fn = vi.fn(async () => ({ requestKeys: ["rk"] }));
    const out = await withConnectorSelfHeal(fn);
    expect(out).toEqual({ requestKeys: ["rk"] });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(keyProviderInner).not.toHaveBeenCalled(); // no re-mint
  });

  it("heals + retries ONCE when the key-miss is a THROWN error", async () => {
    const { withConnectorSelfHeal } = await load();
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error(`Signing failed: ${KEY_MISS}`))
      .mockResolvedValueOnce({ requestKeys: ["rk-after-heal"] });

    const out = await withConnectorSelfHeal(fn);

    expect(out).toEqual({ requestKeys: ["rk-after-heal"] });
    expect(fn).toHaveBeenCalledTimes(2); // original + one retry
    expect(keyProviderInner).toHaveBeenCalledTimes(1); // forced re-mint during heal
  });

  it("heals + retries ONCE when the key-miss comes back in the BODY (no throw)", async () => {
    const { withConnectorSelfHeal } = await load();
    const fn = vi
      .fn()
      .mockResolvedValueOnce({ error: KEY_MISS })
      .mockResolvedValueOnce({ requestKeys: ["rk2"] });

    const out = await withConnectorSelfHeal(fn);

    expect(out).toEqual({ requestKeys: ["rk2"] });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(keyProviderInner).toHaveBeenCalledTimes(1);
  });

  it("does NOT loop — a second key-miss surfaces after the single retry", async () => {
    const { withConnectorSelfHeal } = await load();
    const fn = vi.fn(async () => ({ error: KEY_MISS })); // always a miss
    const out = await withConnectorSelfHeal(fn);
    // The retry's still-a-miss result is returned as-is (surfaced), not retried again.
    expect(out).toEqual({ error: KEY_MISS });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-key-miss error without healing", async () => {
    const { withConnectorSelfHeal } = await load();
    const fn = vi.fn().mockRejectedValue(new Error("pool exhausted"));
    await expect(withConnectorSelfHeal(fn)).rejects.toThrow(/pool exhausted/);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(keyProviderInner).not.toHaveBeenCalled();
  });
});

describe("healGatedConnector", () => {
  it("drops the memo, rebuilds, and forces a re-mint", async () => {
    const { getDualLinkConnector, healGatedConnector } = await load();
    getDualLinkConnector(); // build + memoize
    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(1);

    await healGatedConnector();

    // Rebuilt (memo dropped) and a fresh secret pulled now.
    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(2);
    expect(keyProviderInner).toHaveBeenCalledTimes(1);
  });
});

describe("resetGatedConnector", () => {
  it("forces the next getDualLinkConnector() to rebuild", async () => {
    const { getDualLinkConnector, resetGatedConnector } = await load();
    getDualLinkConnector();
    getDualLinkConnector();
    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(1); // memoized

    resetGatedConnector();
    getDualLinkConnector();
    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(2); // rebuilt after reset
  });
});
