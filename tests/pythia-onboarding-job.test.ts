import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ConnectorStatus } from "../lib/pythia/connectorStatus";

/**
 * `lib/pythia/onboardingJob.ts` — the onboarding orchestrator. Every stage
 * dependency (T4's identity, T5's chain calls, this task's own
 * `getConnectorForHalf`) is mocked, and T1's status store is faked with an
 * in-memory record so each `writeConnectorStatus` call is both assertable
 * (spyable) AND round-trips like the real read/write store would — proving
 * the sequence, the "never throws out of runOnboarding" contract, and the
 * double-start guard, without touching disk.
 *
 * `vi.mock` factories are hoisted above the rest of this file, so every
 * mock function/state referenced directly inside a factory's returned
 * object is created via `vi.hoisted` alongside them (see
 * `tests/pythia-connector-client.test.ts` for the same pattern).
 */
const {
  ensureConnectorApolloPairMock,
  deployApolloHalfMock,
  linkDualApiKeyMock,
  refreshMock,
  getConnectorForHalfMock,
  readConnectorStatusMock,
  writeConnectorStatusMock,
  state,
} = vi.hoisted(() => {
  const IDLE_STATUS: ConnectorStatus = {
    stage: "idle",
    standardApollo: null,
    smartApollo: null,
    startedAt: null,
    updatedAt: null,
    lastError: null,
  };
  const state: { status: ConnectorStatus } = { status: { ...IDLE_STATUS } };
  const refreshMock = vi.fn();
  return {
    ensureConnectorApolloPairMock: vi.fn(),
    deployApolloHalfMock: vi.fn(),
    linkDualApiKeyMock: vi.fn(),
    refreshMock,
    getConnectorForHalfMock: vi.fn((_apolloAccount: string) => ({ refresh: refreshMock })),
    readConnectorStatusMock: vi.fn(() => state.status),
    writeConnectorStatusMock: vi.fn((status: ConnectorStatus) => {
      state.status = status;
    }),
    state,
  };
});

vi.mock("../lib/pythia/apolloIdentity", () => ({
  ensureConnectorApolloPair: ensureConnectorApolloPairMock,
}));

vi.mock("../lib/pythia/onboardingChain", () => ({
  deployApolloHalf: deployApolloHalfMock,
  linkDualApiKey: linkDualApiKeyMock,
}));

vi.mock("../lib/pythia/connectorClient", () => ({
  getConnectorForHalf: getConnectorForHalfMock,
}));

vi.mock("../lib/pythia/connectorStatus", () => ({
  readConnectorStatus: readConnectorStatusMock,
  writeConnectorStatus: writeConnectorStatusMock,
}));

import { runOnboarding, startOnboarding } from "../lib/pythia/onboardingJob";

const IDLE: ConnectorStatus = {
  stage: "idle",
  standardApollo: null,
  smartApollo: null,
  startedAt: null,
  updatedAt: null,
  lastError: null,
};

/** Let any pending fire-and-forget `runOnboarding()` microtask chain fully
 * settle before the next test's `beforeEach` resets shared in-memory state. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  state.status = { ...IDLE };
  ensureConnectorApolloPairMock.mockReset();
  deployApolloHalfMock.mockReset();
  linkDualApiKeyMock.mockReset();
  getConnectorForHalfMock.mockClear();
  refreshMock.mockReset();
  readConnectorStatusMock.mockClear();
  writeConnectorStatusMock.mockClear();

  ensureConnectorApolloPairMock.mockResolvedValue({
    standardPublicKey: "apollo-pub-standard",
    smartPublicKey: "apollo-pub-smart",
    // Deliberately distinct from the raw public keys above — proves the job
    // routes each representation to its correct consumer instead of reusing
    // one value everywhere (the confirmed bug this fix addresses): raw
    // public keys go to the on-chain `deployApolloHalf`/`linkDualApiKey`
    // calls, `₱./Π.`-prefixed addresses go to `connectorStatus` and
    // `getConnectorForHalf` (Pythia's wire protocol).
    standardAddress: "₱.address-standard",
    smartAddress: "Π.address-smart",
  });
  deployApolloHalfMock.mockResolvedValue({ ok: true });
  linkDualApiKeyMock.mockResolvedValue({ ok: true });
  refreshMock.mockResolvedValue({ status: "pending" });
});

describe("runOnboarding", () => {
  it("transitions through every stage in order, ending at success, on a fully successful run", async () => {
    await runOnboarding();

    const stages = writeConnectorStatusMock.mock.calls.map(
      ([status]) => (status as ConnectorStatus).stage,
    );
    expect(stages).toEqual([
      "ensuring-identity",
      "deploying-standard",
      "deploying-smart",
      "linking",
      "proving-standard",
      "proving-smart",
      "success",
    ]);
    expect(state.status.stage).toBe("success");
    expect(state.status.lastError).toBeNull();
  });

  it("records both Apollo ADDRESSES (not the raw public keys) in status once identity has been ensured", async () => {
    await runOnboarding();

    expect(state.status.standardApollo).toBe("₱.address-standard");
    expect(state.status.smartApollo).toBe("Π.address-smart");
  });

  it("deploys standard then smart, and links, using the RAW PUBLIC KEYS ensureConnectorApolloPair produced", async () => {
    await runOnboarding();

    expect(deployApolloHalfMock).toHaveBeenNthCalledWith(
      1,
      "apollo-pub-standard",
      "apollo-pub-standard",
      true,
    );
    expect(deployApolloHalfMock).toHaveBeenNthCalledWith(
      2,
      "apollo-pub-standard",
      "apollo-pub-smart",
      false,
    );
    expect(linkDualApiKeyMock).toHaveBeenCalledWith(
      "apollo-pub-standard",
      "apollo-pub-smart",
      "mnemosyne",
    );
  });

  it("proves both halves via getConnectorForHalf(...).refresh(), standard then smart, using the ADDRESSES (Pythia's wire protocol rejects raw public keys)", async () => {
    await runOnboarding();

    expect(getConnectorForHalfMock.mock.calls[0][0]).toBe("₱.address-standard");
    expect(getConnectorForHalfMock.mock.calls[1][0]).toBe("Π.address-smart");
    expect(refreshMock).toHaveBeenCalled();
  });

  it("treats a pending proof result as an expected steady state, not a failure — the run still reaches success", async () => {
    refreshMock.mockResolvedValue({ status: "pending" });

    await runOnboarding();

    expect(state.status.stage).toBe("success");
    expect(state.status.lastError).toBeNull();
  });

  it("records stage failed with lastError when ensureConnectorApolloPair throws, without throwing out of runOnboarding", async () => {
    ensureConnectorApolloPairMock.mockRejectedValueOnce(new Error("identity boom"));

    await expect(runOnboarding()).resolves.toBeUndefined();

    expect(state.status.stage).toBe("failed");
    expect(state.status.lastError).toBe("identity boom");
    expect(deployApolloHalfMock).not.toHaveBeenCalled();
  });

  it("records stage failed with lastError when the standard deploy throws, without throwing out of runOnboarding", async () => {
    deployApolloHalfMock.mockRejectedValueOnce(new Error("deploy boom"));

    await expect(runOnboarding()).resolves.toBeUndefined();

    expect(state.status.stage).toBe("failed");
    expect(state.status.lastError).toBe("deploy boom");
    expect(linkDualApiKeyMock).not.toHaveBeenCalled();
  });

  it("records stage failed with lastError when linking throws, without throwing out of runOnboarding", async () => {
    linkDualApiKeyMock.mockRejectedValueOnce(new Error("link boom"));

    await expect(runOnboarding()).resolves.toBeUndefined();

    expect(state.status.stage).toBe("failed");
    expect(state.status.lastError).toBe("link boom");
    expect(getConnectorForHalfMock).not.toHaveBeenCalled();
  });

  it("records stage failed with lastError when the standard proof refresh throws a real error (not a pending result), without throwing out of runOnboarding", async () => {
    refreshMock.mockRejectedValueOnce(new Error("standard proof boom"));

    await expect(runOnboarding()).resolves.toBeUndefined();

    expect(state.status.stage).toBe("failed");
    expect(state.status.lastError).toBe("standard proof boom");
    // Only the standard half's refresh should have been attempted — the
    // smart half's proving stage must never run once the standard one threw.
    expect(getConnectorForHalfMock).toHaveBeenCalledTimes(1);
  });

  it("records stage failed with lastError when the smart proof refresh throws a real error (not a pending result), without throwing out of runOnboarding", async () => {
    refreshMock
      .mockResolvedValueOnce({ status: "pending" }) // proving-standard succeeds
      .mockRejectedValueOnce(new Error("smart proof boom")); // proving-smart throws

    await expect(runOnboarding()).resolves.toBeUndefined();

    expect(state.status.stage).toBe("failed");
    expect(state.status.lastError).toBe("smart proof boom");
    expect(getConnectorForHalfMock).toHaveBeenCalledTimes(2);
  });

  it("does not fail the job when the best-effort opportunistic final refresh throws", async () => {
    refreshMock
      .mockResolvedValueOnce({ status: "pending" }) // proving-standard
      .mockResolvedValueOnce({ status: "pending" }) // proving-smart
      .mockRejectedValueOnce(new Error("opportunistic refresh boom")); // best-effort extra

    await expect(runOnboarding()).resolves.toBeUndefined();

    expect(state.status.stage).toBe("success");
  });
});

describe("startOnboarding", () => {
  it("synchronously sets stage ensuring-identity and startedAt before firing runOnboarding", async () => {
    startOnboarding();

    expect(state.status.stage).toBe("ensuring-identity");
    expect(state.status.startedAt).not.toBeNull();

    await flush();
  });

  it("throws and does not start a second run when a status is already mid-run", () => {
    state.status = { ...IDLE, stage: "linking" };

    expect(() => startOnboarding()).toThrow();
    expect(ensureConnectorApolloPairMock).not.toHaveBeenCalled();
  });

  it("allows a new run to start after a previous run failed", async () => {
    state.status = { ...IDLE, stage: "failed", lastError: "prior failure" };

    expect(() => startOnboarding()).not.toThrow();
    expect(state.status.stage).toBe("ensuring-identity");

    await flush();
  });
});

describe("module import side effects", () => {
  it("never triggers onboarding merely by importing the module — no stray top-level call", async () => {
    // A stray top-level `void runOnboarding()` (or similar) in
    // `onboardingJob.ts` would run at MODULE-EVALUATION time, before any
    // test body — including this one's — gets a chance to observe it,
    // because the shared `beforeEach` above unconditionally resets every
    // mock before each test runs. Checking call counts against the
    // already-imported module (imported once at file-collection time, long
    // before this test's `beforeEach` reset ran) can't catch that. Instead,
    // force a genuinely FRESH module evaluation via `vi.resetModules()` +
    // a dynamic re-`import()` right here, then assert on the mocks
    // immediately — before calling anything ourselves — so any stray
    // module-scope side effect has nowhere to hide.
    vi.resetModules();
    await import("../lib/pythia/onboardingJob");

    expect(ensureConnectorApolloPairMock).not.toHaveBeenCalled();
    expect(deployApolloHalfMock).not.toHaveBeenCalled();
    expect(linkDualApiKeyMock).not.toHaveBeenCalled();
    expect(getConnectorForHalfMock).not.toHaveBeenCalled();
    expect(writeConnectorStatusMock).not.toHaveBeenCalled();
  });
});
