import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `app/codex/codexRelaySigningClient.ts` — signing clients + display-read routing.
 * Read routing (organs/06 §6a, given Pythia HARD-GATES reads with 401):
 *   - operator `/admin/codex` DISPLAY read → KEYED relay `/read` (attributed),
 *     with a node-direct fallback on relay/key failure;
 *   - consumer `/codex` DISPLAY read → NODE-DIRECT (a public visitor has no key +
 *     can't send the header, so it can't read through Pythia);
 *   - signed-tx SIMULATE (declares signers) → node-direct `/local` (both mounts);
 *   - SEND → Pythia (relay for operator, keyless-direct for consumer).
 */
const { rawMock } = vi.hoisted(() => ({ rawMock: vi.fn(async () => ({ result: { status: "success" }, gas: 1 })) }));
vi.mock("@stoachain/stoa-core/reads", () => ({ rawCalibratedDirtyRead: rawMock }));

import {
  createCodexRelaySigningClient,
  createCodexDirectPythiaSigningClient,
  createCodexRelayPactReader,
  createCodexDirectPythiaPactReader,
  extractExec,
  type BrowserTransportConfig,
} from "../app/codex/codexRelaySigningClient";

const SIM_SIGNED = {
  cmd: JSON.stringify({ payload: { exec: { code: "(free.mod.fire)", data: { a: 1 } } }, signers: [{ pubKey: "abc" }] }),
  hash: "hsim",
  sigs: [{}],
};
const DISPLAY = {
  cmd: JSON.stringify({ payload: { exec: { code: "(coin.details x)", data: { x: 1 } } }, signers: [] }),
  hash: "hdisp",
  sigs: [],
};
const SIGNED = { cmd: "{\"payload\":{\"exec\":{}}}", hash: "h1", sigs: [{ sig: "s1" }] };

const PYTHIA: BrowserTransportConfig = { pythiaUrl: "https://pythia.example", mode: "pythia", nodeUrl: "https://node2.stoachain.com" };
const DIRECT: BrowserTransportConfig = { pythiaUrl: "https://pythia.example", mode: "direct-node", nodeUrl: "https://node2.stoachain.com" };
const cfg = (c: BrowserTransportConfig) => () => Promise.resolve(c);

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
const NODE_LOCAL = "https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact/api/v1/local?preflight=false&signatureVerification=false";
const NODE_PACT = "https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact";

beforeEach(() => rawMock.mockClear());

describe("extractExec", () => {
  it("pulls code + data out of a built command envelope", () => {
    expect(extractExec(DISPLAY)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
  });
});

describe("DISPLAY read routing (no signers)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("operator: display read → KEYED /api/pythia/relay (not the node)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" } }));
    const c = createCodexRelaySigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await c.dirtyRead(DISPLAY);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/pythia/relay");
    expect(JSON.parse(init.body)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
    expect(rawMock).not.toHaveBeenCalled();
  });

  it("operator: display read FALLS BACK to node-direct when the relay fails (display never blanks)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(401, { error: "a valid connector API key is required" }));
    const c = createCodexRelaySigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await c.dirtyRead(DISPLAY);
    expect(rawMock).toHaveBeenCalledTimes(1);
    expect(rawMock.mock.calls[0][0]).toBe("(coin.details x)");
    expect(rawMock.mock.calls[0][1]).toMatchObject({ pactUrl: NODE_PACT });
  });

  it("consumer: display read → NODE-DIRECT (Pythia hard-gates keyless reads), never /stoachain/read", async () => {
    const c = createCodexDirectPythiaSigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await c.dirtyRead(DISPLAY);
    expect(rawMock).toHaveBeenCalledTimes(1);
    expect(rawMock.mock.calls[0][1]).toMatchObject({ pactUrl: NODE_PACT });
    expect(fetchImpl).not.toHaveBeenCalled(); // no keyless Pythia /read attempt
  });
});

describe("signed SIMULATE (declares signers) stays node-direct /local", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  for (const [name, make] of [
    ["operator", createCodexRelaySigningClient],
    ["consumer", createCodexDirectPythiaSigningClient],
  ] as const) {
    it(`${name}: simulate → node /local?signatureVerification=false`, async () => {
      fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 700 }));
      const c = make({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
      await c.dirtyRead(SIM_SIGNED);
      expect(String(fetchImpl.mock.calls[0][0])).toBe(NODE_LOCAL);
    });
  }

  it("break-glass direct-node: even a DISPLAY read goes node-direct /local", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" } }));
    const c = createCodexDirectPythiaSigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(DIRECT) });
    await c.dirtyRead(DISPLAY);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(NODE_LOCAL);
  });
});

const NODE_SEND = "https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact/api/v1/send";

describe("send lanes (Pythia hard-gates keyless sends → 401)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("operator submit → KEYED relay, node fallback on failure", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk"] }));
    const c = createCodexRelaySigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    expect((await c.submit(SIGNED)).requestKey).toBe("rk");
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/pythia/relay");

    fetchImpl.mockReset();
    fetchImpl.mockResolvedValueOnce(jsonRes(500, {})); // relay fails
    fetchImpl.mockResolvedValueOnce(jsonRes(200, { requestKeys: ["rk-node"] })); // node fallback
    expect((await c.submit(SIGNED)).requestKey).toBe("rk-node");
    expect(String(fetchImpl.mock.calls[1][0])).toBe(NODE_SEND);
  });

  it("consumer submit → NODE-DIRECT /send (a public visitor has no key; Pythia gates keyless)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk2"] }));
    const c = createCodexDirectPythiaSigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    expect((await c.submit(SIGNED)).requestKey).toBe("rk2");
    expect(String(fetchImpl.mock.calls[0][0])).toBe(NODE_SEND);
    expect(String(fetchImpl.mock.calls[0][0])).not.toContain("/stoachain/send");
  });
});

describe("pactReaders — the setPactReader display-read seam", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("operator reader → KEYED /api/pythia/relay { code }, node fallback on failure", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" } }));
    const reader = createCodexRelayPactReader({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await reader("(coin.details x)");
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/pythia/relay");
    expect(rawMock).not.toHaveBeenCalled();

    fetchImpl.mockResolvedValue(jsonRes(500, {}));
    await reader("(coin.details x)");
    expect(rawMock).toHaveBeenCalledTimes(1); // fell back to node
  });

  it("consumer reader → NODE-DIRECT (never Pythia, since keyless reads are hard-gated)", async () => {
    const reader = createCodexDirectPythiaPactReader({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await reader("(coin.details x)");
    expect(rawMock).toHaveBeenCalledTimes(1);
    expect(rawMock.mock.calls[0][1]).toMatchObject({ pactUrl: NODE_PACT });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("mount wiring (source-contract)", () => {
  it("operator codex installs the RELAY reader + relay signing client", () => {
    const src = readFileSync(join(process.cwd(), "app", "admin", "codex", "MnemosyneCodex.tsx"), "utf8");
    expect(src).toMatch(/setPactReader\(createCodexRelayPactReader\(\)\)/);
    expect(src).toMatch(/signingClient=/);
  });
  it("consumer codex installs the (node-direct) reader + direct signing client", () => {
    const src = readFileSync(join(process.cwd(), "app", "codex", "CodexApp.tsx"), "utf8");
    expect(src).toMatch(/setPactReader\(createCodexDirectPythiaPactReader\(\)\)/);
    expect(src).toMatch(/signingClient=\{signingClient\.current\}/);
  });
});
