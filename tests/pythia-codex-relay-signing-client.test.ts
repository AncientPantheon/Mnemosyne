import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `app/codex/codexRelaySigningClient.ts` — the browser signing clients. Both
 * lanes (dirtyRead + submit) branch on the live transport mode from /api/config:
 *   pythia (default) → consumer keyless-to-Pythia / operator keyed relay;
 *   direct-node (admin Network Fallback) → straight to the Stoa node (unmetered).
 */
import {
  createCodexRelaySigningClient,
  createCodexDirectPythiaSigningClient,
  extractExec,
  type BrowserTransportConfig,
} from "../app/codex/codexRelaySigningClient";

const SIGNED = { cmd: "{\"payload\":{\"exec\":{}}}", hash: "h1", sigs: [{ sig: "s1" }] };
const SIM = {
  cmd: JSON.stringify({ payload: { exec: { code: "(coin.details x)", data: { x: 1 } } } }),
  hash: "hsim",
  sigs: [],
};

const PYTHIA: BrowserTransportConfig = { pythiaUrl: "https://pythia.example", mode: "pythia", nodeUrl: "" };
const DIRECT: BrowserTransportConfig = {
  pythiaUrl: "https://pythia.example",
  mode: "direct-node",
  nodeUrl: "https://node2.stoachain.com",
};
const cfg = (c: BrowserTransportConfig) => () => Promise.resolve(c);

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("extractExec", () => {
  it("pulls code + data out of a built command envelope for Pythia /read", () => {
    expect(extractExec(SIM)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
  });
});

const NODE_LOCAL = "https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact/api/v1/local";

describe("pre-fire SIMULATE is node-direct /local (full signed cmd) in BOTH modes — the keyset fix", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  for (const [name, make] of [
    ["operator relay client", createCodexRelaySigningClient],
    ["consumer direct client", createCodexDirectPythiaSigningClient],
  ] as const) {
    it(`${name}: dirtyRead posts the FULL command to the node /local (preserves signers), NOT Pythia /read`, async () => {
      fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 700 }));
      const client = make({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });

      await client.dirtyRead(SIM);

      const url = String(fetchImpl.mock.calls[0][0]);
      expect(url).toBe(NODE_LOCAL);
      // The full command (with its signers) goes to /local — NOT extracted code/data
      // to Pythia's signer-stripping /read (which fails keys-all guards).
      expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(SIM);
      expect(url).not.toContain("/stoachain/read");
      expect(url).not.toContain("/api/pythia/relay");
    });
  }
});

describe("operator relay client — pythia mode SEND (KEYED via relay)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("submit → relay ({cmds})", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk"] }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    const out = await client.submit(SIGNED);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/pythia/relay");
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ cmds: [SIGNED] });
    expect(out.requestKey).toBe("rk");
  });

  it("is wired into the operator codex mount", () => {
    const src = readFileSync(join(process.cwd(), "app", "admin", "codex", "MnemosyneCodex.tsx"), "utf8");
    expect(src).toMatch(/createCodexRelaySigningClient/);
    expect(src).toMatch(/signingClient=/);
  });
});

describe("consumer direct client — pythia mode SEND (KEYLESS to Pythia)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  it("submit → Pythia /stoachain/send", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk2"] }));
    const client = createCodexDirectPythiaSigningClient({ fetchImpl: fetchImpl as never, resolveConfig: cfg(PYTHIA) });
    const out = await client.submit(SIGNED);
    expect(fetchImpl.mock.calls[0][0]).toBe("https://pythia.example/stoachain/send");
    expect((fetchImpl.mock.calls[0][1].headers as Record<string, string>)["x-pythia-key"]).toBeUndefined();
    expect(out.requestKey).toBe("rk2");
  });

  it("submit throws (never a node) when no Pythia gateway is configured", async () => {
    const client = createCodexDirectPythiaSigningClient({
      fetchImpl: fetchImpl as never,
      resolveConfig: cfg({ pythiaUrl: "", mode: "pythia", nodeUrl: "https://node2.stoachain.com" }),
    });
    await expect(client.submit(SIGNED)).rejects.toThrow(/no Pythia gateway/i);
  });
});

describe("BREAK-GLASS direct-node mode — BOTH clients hit the Stoa node (unmetered)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => (fetchImpl = vi.fn()));

  for (const [name, make] of [
    ["operator relay client", createCodexRelaySigningClient],
    ["consumer direct client", createCodexDirectPythiaSigningClient],
  ] as const) {
    it(`${name}: dirtyRead → node /local (full cmd), submit → node /send — not Pythia, not the relay`, async () => {
      const client = make({ fetchImpl: fetchImpl as never, resolveConfig: cfg(DIRECT) });

      fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 800 }));
      await client.dirtyRead(SIM);
      const readUrl = String(fetchImpl.mock.calls[0][0]);
      expect(readUrl).toBe("https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact/api/v1/local");
      // Full signed command goes to /local (accurate gas), not extracted code/data.
      expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(SIM);
      expect(readUrl).not.toContain("/stoachain/read");
      expect(readUrl).not.toContain("/api/pythia/relay");

      fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk-node"] }));
      const out = await client.submit(SIGNED);
      const sendUrl = String(fetchImpl.mock.calls[1][0]);
      expect(sendUrl).toBe("https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact/api/v1/send");
      expect(sendUrl).not.toContain("/stoachain/send");
      expect(sendUrl).not.toContain("/api/pythia/relay");
      expect(out.requestKey).toBe("rk-node");
    });
  }

  it("is wired into the public consumer codex mount", () => {
    const src = readFileSync(join(process.cwd(), "app", "codex", "CodexApp.tsx"), "utf8");
    expect(src).toMatch(/createCodexDirectPythiaSigningClient/);
    expect(src).toMatch(/signingClient=\{signingClient\.current\}/);
  });
});
