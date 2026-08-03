import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The Pythia-connector heartbeat drives the one memoized DualLinkConnector's
// tick(); mock the connector-client so no real network/signing happens.
const { getDualLinkConnectorMock } = vi.hoisted(() => ({
  getDualLinkConnectorMock: vi.fn(),
}));

vi.mock("../lib/pythia/connectorClient", () => ({
  getDualLinkConnector: getDualLinkConnectorMock,
}));

import { tickPythiaConnectorOnce, startPythiaConnectorLoop } from "../lib/pythia/connectorLoop";

const g = globalThis as unknown as { __mnemosynePythiaConnectorLoop?: ReturnType<typeof setInterval> };

beforeEach(() => {
  getDualLinkConnectorMock.mockReset();
  if (g.__mnemosynePythiaConnectorLoop) {
    clearInterval(g.__mnemosynePythiaConnectorLoop);
    g.__mnemosynePythiaConnectorLoop = undefined;
  }
  delete process.env.MNEMOSYNE_PYTHIA_CONNECTOR_DISABLED;
  delete process.env.MNEMOSYNE_PYTHIA_CONNECTOR_TICK_MS;
});

afterEach(() => {
  if (g.__mnemosynePythiaConnectorLoop) {
    clearInterval(g.__mnemosynePythiaConnectorLoop);
    g.__mnemosynePythiaConnectorLoop = undefined;
  }
  vi.useRealTimers();
});

describe("pythia connector heartbeat — tickPythiaConnectorOnce", () => {
  it("drives the memoized DualLinkConnector's tick() — the round trip that mints the secret", async () => {
    const tick = vi.fn(async () => {});
    getDualLinkConnectorMock.mockReturnValue({ tick });
    await tickPythiaConnectorOnce();
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when nothing is linked (no connector)", async () => {
    getDualLinkConnectorMock.mockReturnValue(null);
    await expect(tickPythiaConnectorOnce()).resolves.toBeUndefined();
  });

  it("swallows a tick failure — a transient chain/signer error must never crash the loop", async () => {
    getDualLinkConnectorMock.mockReturnValue({
      tick: vi.fn(async () => {
        throw new Error("verify 502");
      }),
    });
    await expect(tickPythiaConnectorOnce()).resolves.toBeUndefined();
  });
});

describe("pythia connector heartbeat — startPythiaConnectorLoop", () => {
  it("fires an immediate tick and repeats on the interval, and is idempotent", async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => {});
    getDualLinkConnectorMock.mockReturnValue({ tick });
    process.env.MNEMOSYNE_PYTHIA_CONNECTOR_TICK_MS = "1000";

    startPythiaConnectorLoop();
    // A second call must NOT stack a second interval (globalThis guard).
    startPythiaConnectorLoop();

    await vi.advanceTimersByTimeAsync(0); // let the immediate tick's microtask run
    expect(tick).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tick).toHaveBeenCalledTimes(3); // one interval, not two (idempotent start)
  });

  it("does not start when disabled by the kill switch", async () => {
    vi.useFakeTimers();
    const tick = vi.fn(async () => {});
    getDualLinkConnectorMock.mockReturnValue({ tick });
    process.env.MNEMOSYNE_PYTHIA_CONNECTOR_DISABLED = "1";

    startPythiaConnectorLoop();
    await vi.advanceTimersByTimeAsync(0);
    expect(tick).not.toHaveBeenCalled();
    expect(g.__mnemosynePythiaConnectorLoop).toBeUndefined();
  });
});
