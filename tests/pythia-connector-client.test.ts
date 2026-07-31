import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `lib/pythia/connectorClient.ts` — ongoing (post-onboarding) gated Pythia
 * access. What's under test is the WIRING contract: `getConnectorForHalf`
 * builds a `PythiaConnector` for the given Apollo half with Mnemosyne's own
 * signer/storage; `getGatedPythiaClient` degrades to a plain, unattributed
 * `PythiaClient` when onboarding hasn't succeeded (the "strictly additive,
 * never breaks existing behavior" acceptance criterion), and otherwise wires
 * a `pythiaKey` sourced from the Standard half's connector. Every dependency
 * that would otherwise hit disk/network is mocked, mirroring
 * `tests/pythia-onboarding-chain.test.ts`'s own approach.
 */

// `vi.mock` factories are hoisted above the rest of this file, so any mock
// function they reference must be created via `vi.hoisted` (hoisted right
// alongside them) rather than a plain top-level `const` — otherwise the
// factory sees the outer binding before it's initialized.
const { readAdminSettingsMock, readConnectorStatusMock, PythiaClientMock, PythiaConnectorMock, keyProviderFn } =
  vi.hoisted(() => {
    const keyProviderFn = vi.fn(() => "mock-key-provider-fn");
    return {
      readAdminSettingsMock: vi.fn(() => ({ pythiaUrl: "http://pythia.test" })),
      readConnectorStatusMock: vi.fn(),
      PythiaConnectorMock: vi.fn().mockImplementation((options: unknown) => ({
        __options: options,
        keyProvider: keyProviderFn,
      })),
      PythiaClientMock: vi.fn().mockImplementation((options: unknown) => ({ __options: options })),
      keyProviderFn,
    };
  });

vi.mock("../lib/adminSettings", () => ({
  readAdminSettings: readAdminSettingsMock,
}));

vi.mock("../lib/pythia/connectorStatus", () => ({
  readConnectorStatus: readConnectorStatusMock,
}));

vi.mock("@ancientpantheon/pythia-client", () => ({
  PythiaClient: PythiaClientMock,
  PythiaConnector: PythiaConnectorMock,
}));

import { getConnectorForHalf, getGatedPythiaClient } from "../lib/pythia/connectorClient";

const DEFAULT_STATUS = {
  stage: "idle" as const,
  standardApollo: null,
  smartApollo: null,
  startedAt: null,
  updatedAt: null,
  lastError: null,
};

beforeEach(() => {
  readAdminSettingsMock.mockClear();
  readConnectorStatusMock.mockReset();
  PythiaConnectorMock.mockClear();
  PythiaClientMock.mockClear();
  keyProviderFn.mockClear();
});

describe("getConnectorForHalf", () => {
  it("builds a PythiaConnector wired with the given Apollo half, the admin-configured baseUrl, and Mnemosyne's own signer/storage", () => {
    getConnectorForHalf("apollo-pub-standard");

    expect(PythiaConnectorMock).toHaveBeenCalledTimes(1);
    const options = PythiaConnectorMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.baseUrl).toBe("http://pythia.test");
    expect(options.apolloAccount).toBe("apollo-pub-standard");
    // Not asserting the concrete classes here (that's T3/T2's own coverage) —
    // just that SOMETHING was wired for each, so a caller can't silently get
    // an unauthenticated/unsealed connector.
    expect(options.signer).toBeDefined();
    expect(options.storage).toBeDefined();
  });
});

describe("getGatedPythiaClient", () => {
  it("falls back to an unattributed PythiaClient (no pythiaKey) when onboarding hasn't reached success", () => {
    readConnectorStatusMock.mockReturnValue({ ...DEFAULT_STATUS, stage: "idle" });

    expect(() => getGatedPythiaClient()).not.toThrow();
    expect(PythiaConnectorMock).not.toHaveBeenCalled();
    expect(PythiaClientMock).toHaveBeenCalledTimes(1);
    const options = PythiaClientMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.baseUrl).toBe("http://pythia.test");
    expect(options.pythiaKey).toBeUndefined();
  });

  it("also falls back to an unattributed client for every non-success stage, e.g. mid-run", () => {
    readConnectorStatusMock.mockReturnValue({ ...DEFAULT_STATUS, stage: "linking" });

    getGatedPythiaClient();
    expect(PythiaConnectorMock).not.toHaveBeenCalled();
    expect((PythiaClientMock.mock.calls[0][0] as Record<string, unknown>).pythiaKey).toBeUndefined();
  });

  it("falls back to an unattributed client even at stage success if standardApollo is falsy (a structurally-shouldn't-happen-but-defended-against state)", () => {
    readConnectorStatusMock.mockReturnValue({ ...DEFAULT_STATUS, stage: "success", standardApollo: null });

    expect(() => getGatedPythiaClient()).not.toThrow();
    expect(PythiaConnectorMock).not.toHaveBeenCalled();
    expect(PythiaClientMock).toHaveBeenCalledTimes(1);
    const options = PythiaClientMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.baseUrl).toBe("http://pythia.test");
    expect(options.pythiaKey).toBeUndefined();
  });

  it("builds a connector-backed gated client sourced from the Standard half once onboarding has succeeded", () => {
    readConnectorStatusMock.mockReturnValue({
      ...DEFAULT_STATUS,
      stage: "success",
      standardApollo: "apollo-pub-standard",
      smartApollo: "apollo-pub-smart",
    });

    getGatedPythiaClient();

    expect(PythiaConnectorMock).toHaveBeenCalledTimes(1);
    expect((PythiaConnectorMock.mock.calls[0][0] as Record<string, unknown>).apolloAccount).toBe(
      "apollo-pub-standard",
    );
    expect(keyProviderFn).toHaveBeenCalledTimes(1);
    const options = PythiaClientMock.mock.calls[0][0] as Record<string, unknown>;
    expect(options.baseUrl).toBe("http://pythia.test");
    expect(options.pythiaKey).toBe("mock-key-provider-fn");
  });
});
