import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `app/codex/codexRelaySigningClient.ts` — the browser signing clients + the
 * display-read pactReaders. Routing rules (organs/06 §6a):
 *   - DISPLAY reads (no signers) → Pythia's KEYED /read (metered + attributed).
 *   - signed-tx SIMULATE (declares signers) → node-direct /local (the ONE
 *     legitimate node-direct read — a keys-all guard needs the signers).
 *   - SEND → Pythia (relay for operator, keyless-direct for consumer).
 *   - Network Fallback "direct-node" → everything node-direct (break-glass).
 */
import {
  createCodexRelaySigningClient,
  createCodexDirectPythiaSigningClient,
  createCodexRelayPactReader,
  createCodexDirectPythiaPactReader,
  extractExec,
  type BrowserTransportConfig,
} from "../app/codex/codexRelaySigningClient";

// A signed-tx SIMULATE: DECLARES signers (so it must go node-direct).
const SIM_SIGNED = {
  cmd: JSON.stringify({
    payload: { exec: { code: "(free.mod.fire)", data: { a: 1 } } },
    signers: [{ pubKey: "abc" }],
  }),
  hash: "hsim",
  sigs: [{}],
};
// A DISPLAY read: NO signers (must go through Pythia /read).
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

describe("extractExec", () => {
  it("pulls code + data out of a built command envelope", () => {
    expect(extractExec(DISPLAY)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
  });
});

describe("dirtyRead lane split — DISPLAY read (no signers) routes through Pythia KEYED /read", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("operator client: display read → /api/pythia/relay (keyed), not the node", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 40 }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await client.dirtyRead(DISPLAY);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/pythia/relay");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
  });

  it("consumer client: display read → Pythia /stoachain/read (keyless), not the node", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 40 }));
    const client = createCodexDirectPythiaSigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await client.dirtyRead(DISPLAY);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://pythia.example/stoachain/read");
    expect(JSON.parse(init.body)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
  });
});

describe("dirtyRead lane split — signed SIMULATE (declares signers) stays node-direct /local", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  for (const [name, make] of [
    ["operator", createCodexRelaySigningClient],
    ["consumer", createCodexDirectPythiaSigningClient],
  ] as const) {
    it(`${name}: simulate → node /local?signatureVerification=false (full cmd), NOT Pythia`, async () => {
      fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 700 }));
      const client = make({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
      await client.dirtyRead(SIM_SIGNED);
      const url = String(fetchImpl.mock.calls[0][0]);
      expect(url).toBe(NODE_LOCAL);
      expect(url).not.toContain("/stoachain/read");
      expect(url).not.toContain("/api/pythia/relay");
    });
  }

  it("break-glass direct-node: even a DISPLAY read goes node-direct", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" } }));
    const client = createCodexDirectPythiaSigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(DIRECT) });
    await client.dirtyRead(DISPLAY);
    expect(String(fetchImpl.mock.calls[0][0])).toBe(NODE_LOCAL);
  });
});

describe("send lanes", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("operator submit → relay", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk"] }));
    const c = createCodexRelaySigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    const out = await c.submit(SIGNED);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/pythia/relay");
    expect(out.requestKey).toBe("rk");
  });

  it("consumer submit → Pythia /stoachain/send (keyless)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk2"] }));
    const c = createCodexDirectPythiaSigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    const out = await c.submit(SIGNED);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://pythia.example/stoachain/send");
    expect(out.requestKey).toBe("rk2");
  });
});

describe("pactReaders — the setPactReader display-read seam", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("operator reader → KEYED /api/pythia/relay { code }", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" } }));
    const reader = createCodexRelayPactReader({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await reader("(coin.details x)");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/pythia/relay");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ code: "(coin.details x)" });
  });

  it("consumer reader → Pythia /stoachain/read { code }", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" } }));
    const reader = createCodexDirectPythiaPactReader({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    await reader("(coin.details x)");
    expect(String(fetchImpl.mock.calls[0][0])).toBe("https://pythia.example/stoachain/read");
  });
});

describe("mount wiring (source-contract)", () => {
  it("operator codex installs the RELAY reader + relay signing client", () => {
    const src = readFileSync(join(process.cwd(), "app", "admin", "codex", "MnemosyneCodex.tsx"), "utf8");
    expect(src).toMatch(/setPactReader\(createCodexRelayPactReader\(\)\)/);
    expect(src).toMatch(/createCodexRelaySigningClient/);
    expect(src).toMatch(/signingClient=/);
  });
  it("consumer codex installs the DIRECT reader + direct signing client", () => {
    const src = readFileSync(join(process.cwd(), "app", "codex", "CodexApp.tsx"), "utf8");
    expect(src).toMatch(/setPactReader\(createCodexDirectPythiaPactReader\(\)\)/);
    expect(src).toMatch(/createCodexDirectPythiaSigningClient/);
    expect(src).toMatch(/signingClient=\{signingClient\.current\}/);
  });
});
