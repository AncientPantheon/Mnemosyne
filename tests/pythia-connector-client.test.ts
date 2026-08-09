import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `lib/pythia/connectorClient.ts` — ongoing gated Pythia access, reworked
 * around ONE `DualLinkConnector` (pythia-client 2.7.x) driven by the
 * operator-pasted dual-link-key. What's under test is the WIRING contract:
 *  - With no stored dual-link-key, `getGatedPythiaClient()` degrades to a
 *    plain, unattributed `PythiaClient` (no `pythiaKey`) — the "strictly
 *    additive, never throws, behaves exactly as before nothing was linked"
 *    guarantee. Same when the gateway URL is unset.
 *  - With a stored valid dual-link-key AND a configured gateway URL, it builds
 *    a `DualLinkConnector` over the two split Apollo halves (each half's own
 *    `createMnemosyneApolloSigner` signer) and wires the client's `pythiaKey`
 *    from that connector's `keyProvider()`.
 *  - The connector is memoized but rebuilt when the stored key OR the gateway
 *    URL changes.
 * Every dependency that would hit disk/network/codex is mocked. `vi.mock`
 * factories are hoisted, so any function they close over is created via
 * `vi.hoisted` (see `tests/pythia-onboarding-job.test.ts`'s idiom).
 */

const {
  readAdminSettingsMock,
  readConnectorStateMock,
  createSignerMock,
  splitDualLinkKeyMock,
  PythiaClientMock,
  DualLinkConnectorMock,
  keyProviderFn,
  asKeySourceFn,
  keySource,
} = vi.hoisted(() => {
  const keyProviderFn = vi.fn(() => "mock-key-provider-closure");
  const keySource = { get: vi.fn(), invalidate: vi.fn(async () => {}) };
  const asKeySourceFn = vi.fn(() => keySource);
  return {
    readAdminSettingsMock: vi.fn(() => ({ pythiaUrl: "http://pythia.test" })),
    readConnectorStateMock: vi.fn(),
    // Tags the returned signer with the account it was scoped to, so a test can
    // prove each half's signer was built from the corresponding split account.
    createSignerMock: vi.fn((apolloAccount: string) => ({ __apolloAccount: apolloAccount })),
    splitDualLinkKeyMock: vi.fn(),
    DualLinkConnectorMock: vi.fn().mockImplementation((options: unknown) => ({
      __options: options,
      keyProvider: keyProviderFn,
      asKeySource: asKeySourceFn,
      invalidate: vi.fn(async () => {}),
    })),
    PythiaClientMock: vi.fn().mockImplementation((options: unknown) => ({ __options: options })),
    keyProviderFn,
    asKeySourceFn,
    keySource,
  };
});

vi.mock("../lib/adminSettings", () => ({
  readAdminSettings: readAdminSettingsMock,
}));

vi.mock("../lib/pythia/connectorStatus", () => ({
  readConnectorState: readConnectorStateMock,
}));

vi.mock("../lib/pythia/apolloSigner", () => ({
  createMnemosyneApolloSigner: createSignerMock,
}));

vi.mock("@ancientpantheon/pythia-client", () => ({
  PythiaClient: PythiaClientMock,
  DualLinkConnector: DualLinkConnectorMock,
  splitDualLinkKey: splitDualLinkKeyMock,
}));

const DUAL_LINK_KEY = "STD_APOLLO_ACCOUNT|SMT_APOLLO_ACCOUNT";
const HALVES = { standardApollo: "STD_APOLLO_ACCOUNT", smartApollo: "SMT_APOLLO_ACCOUNT" };

const EMPTY_STATE = {
  dualLinkKey: null,
  standardApollo: null,
  smartApollo: null,
  linkedAt: null,
};

const LINKED_STATE = {
  dualLinkKey: DUAL_LINK_KEY,
  standardApollo: HALVES.standardApollo,
  smartApollo: HALVES.smartApollo,
  linkedAt: "2026-08-03T00:00:00.000Z",
};

// The connector is memoized at module scope; reset the module between tests so
// each starts with a clean memo, while the hoisted mocks (registered by
// `vi.mock`) survive `resetModules` and stay the same spy instances.
beforeEach(() => {
  vi.resetModules();
  readAdminSettingsMock.mockReset();
  readAdminSettingsMock.mockReturnValue({ pythiaUrl: "http://pythia.test" });
  readConnectorStateMock.mockReset();
  createSignerMock.mockClear();
  splitDualLinkKeyMock.mockReset();
  splitDualLinkKeyMock.mockReturnValue(HALVES);
  DualLinkConnectorMock.mockClear();
  PythiaClientMock.mockClear();
  keyProviderFn.mockClear();
  asKeySourceFn.mockClear();
});

async function loadModule() {
  return import("../lib/pythia/connectorClient");
}

describe("getGatedPythiaClient", () => {
  it("returns an unattributed PythiaClient (no pythiaKey) when no dual-link-key is stored", async () => {
    readConnectorStateMock.mockReturnValue({ ...EMPTY_STATE });
    const { getGatedPythiaClient } = await loadModule();

    expect(() => getGatedPythiaClient()).not.toThrow();
    expect(DualLinkConnectorMock).not.toHaveBeenCalled();
    expect(PythiaClientMock).toHaveBeenCalledTimes(1);
    const options = PythiaClientMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.baseUrl).toBe("http://pythia.test");
    expect(options.pythiaKey).toBeUndefined();
  });

  it("returns an unattributed client when the gateway URL is empty even though a key is stored", async () => {
    readAdminSettingsMock.mockReturnValue({ pythiaUrl: "" });
    readConnectorStateMock.mockReturnValue({ ...LINKED_STATE });
    const { getGatedPythiaClient } = await loadModule();

    getGatedPythiaClient();
    expect(DualLinkConnectorMock).not.toHaveBeenCalled();
    expect(PythiaClientMock).toHaveBeenCalledTimes(1);
    const options = PythiaClientMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.baseUrl).toBe("");
    expect(options.pythiaKey).toBeUndefined();
  });

  it("builds a DualLinkConnector-backed gated client from the two split halves when a key + URL are present", async () => {
    readConnectorStateMock.mockReturnValue({ ...LINKED_STATE });
    const { getGatedPythiaClient } = await loadModule();

    getGatedPythiaClient();

    // The composite key was split, and each half fed its own scoped signer.
    expect(splitDualLinkKeyMock).toHaveBeenCalledWith(DUAL_LINK_KEY);
    expect(createSignerMock).toHaveBeenCalledWith(HALVES.standardApollo);
    expect(createSignerMock).toHaveBeenCalledWith(HALVES.smartApollo);

    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(1);
    const connectorOpts = DualLinkConnectorMock.mock.calls[0][0] as Record<string, unknown>;
    expect(connectorOpts.dualLinkKey).toBe(DUAL_LINK_KEY);
    expect(connectorOpts.baseUrl).toBe("http://pythia.test");
    expect((connectorOpts.standardSigner as Record<string, unknown>).__apolloAccount).toBe(
      HALVES.standardApollo,
    );
    expect((connectorOpts.smartSigner as Record<string, unknown>).__apolloAccount).toBe(
      HALVES.smartApollo,
    );
    // Mnemosyne dials the real gateway — it must NOT inject an in-process fetch.
    expect(connectorOpts.fetchImpl).toBeUndefined();

    // The client is wired with the connector's REFRESHABLE key source
    // (asKeySource, not a pre-called keyProvider) so PythiaClient can self-heal a
    // dead ephemeral key on a 401 (organs/06 §7c).
    expect(asKeySourceFn).toHaveBeenCalledTimes(1);
    const clientOpts = PythiaClientMock.mock.calls[0][0] as Record<string, unknown>;
    expect(clientOpts.baseUrl).toBe("http://pythia.test");
    expect(clientOpts.pythiaKey).toBe(keySource);
  });
});

describe("getDualLinkConnector memoization", () => {
  it("reuses one connector across calls when the stored key and URL are unchanged", async () => {
    readConnectorStateMock.mockReturnValue({ ...LINKED_STATE });
    const { getDualLinkConnector } = await loadModule();

    const first = getDualLinkConnector();
    const second = getDualLinkConnector();

    expect(first).toBe(second);
    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(1);
  });

  it("returns null (and builds nothing) when no dual-link-key is stored", async () => {
    readConnectorStateMock.mockReturnValue({ ...EMPTY_STATE });
    const { getDualLinkConnector } = await loadModule();

    expect(getDualLinkConnector()).toBeNull();
    expect(DualLinkConnectorMock).not.toHaveBeenCalled();
  });

  it("rebuilds the connector when the stored dual-link-key changes", async () => {
    readConnectorStateMock
      .mockReturnValueOnce({ ...LINKED_STATE })
      .mockReturnValueOnce({ ...LINKED_STATE, dualLinkKey: "OTHER_STD|OTHER_SMT" });
    const { getDualLinkConnector } = await loadModule();

    getDualLinkConnector();
    getDualLinkConnector();

    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(2);
  });

  it("rebuilds the connector when the gateway URL changes", async () => {
    readConnectorStateMock.mockReturnValue({ ...LINKED_STATE });
    readAdminSettingsMock
      .mockReturnValueOnce({ pythiaUrl: "http://pythia.test" })
      .mockReturnValueOnce({ pythiaUrl: "http://pythia.other" });
    const { getDualLinkConnector } = await loadModule();

    getDualLinkConnector();
    getDualLinkConnector();

    expect(DualLinkConnectorMock).toHaveBeenCalledTimes(2);
  });
});
