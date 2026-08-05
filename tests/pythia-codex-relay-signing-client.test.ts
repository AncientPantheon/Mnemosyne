import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `app/codex/codexRelaySigningClient.ts` — the browser signing clients injected
 * into <CodexProvider signingClient={…}> so the loaded Codex's traffic (reads,
 * gas simulation AND sends) routes through PYTHIA, never a node.
 *   - operator codex → KEYED via Mnemosyne's ancient-gated /api/pythia/relay.
 *   - consumer codex → KEYLESS browser-direct to Pythia's public gateway.
 */
import {
  createCodexRelaySigningClient,
  createCodexDirectPythiaSigningClient,
  extractExec,
} from "../app/codex/codexRelaySigningClient";

const SIGNED = { cmd: "{\"payload\":{\"exec\":{}}}", hash: "h1", sigs: [{ sig: "s1" }] };
const SIM = {
  cmd: JSON.stringify({ payload: { exec: { code: "(coin.details x)", data: { x: 1 } } } }),
  hash: "hsim",
  sigs: [],
};

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("extractExec", () => {
  it("pulls code + data out of a built command envelope for Pythia /read", () => {
    expect(extractExec(SIM)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
  });
});

describe("createCodexRelaySigningClient (operator codex — KEYED via relay)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("dirtyRead routes the simulation through the KEYED relay (Pythia /read), NOT a node /local", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 700 }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const out = await client.dirtyRead(SIM);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/pythia/relay");
    // Never a chainweb node /local.
    expect(String(url)).not.toContain("/pact/api/v1/local");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
    expect(out).toEqual({ result: { status: "success" }, gas: 700 });
  });

  it("submit relays the SIGNED cmd through the gated relay and returns { requestKey }", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk-xyz"] }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const out = await client.submit(SIGNED);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("/api/pythia/relay");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ cmds: [SIGNED] });
    expect(out.requestKey).toBe("rk-xyz");
  });

  it("submit maps the 503 pythia_no_tx_sender to a clear throw (no node fallback)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(503, { code: "pythia_no_tx_sender", error: "…" }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.submit(SIGNED)).rejects.toThrow(/tx relay node/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("is wired into the operator codex mount (<CodexProvider signingClient>)", () => {
    const src = readFileSync(join(process.cwd(), "app", "admin", "codex", "MnemosyneCodex.tsx"), "utf8");
    expect(src).toMatch(/createCodexRelaySigningClient/);
    expect(src).toMatch(/signingClient=/);
  });
});

describe("createCodexDirectPythiaSigningClient (public /codex — KEYLESS browser-direct)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("dirtyRead routes the simulation KEYLESS straight to Pythia's /stoachain/read (not a node)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 640 }));
    const client = createCodexDirectPythiaSigningClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolvePythiaUrl: async () => "https://pythia.example",
    });

    const out = await client.dirtyRead(SIM);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://pythia.example/stoachain/read");
    expect(String(url)).not.toContain("/pact/api/v1/local");
    expect(JSON.parse(init.body)).toEqual({ code: "(coin.details x)", data: { x: 1 } });
    expect(out.gas).toBe(640);
  });

  it("submit broadcasts the SIGNED cmd KEYLESS straight to Pythia's /stoachain/send (counts as a tx)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk-consumer"] }));
    const client = createCodexDirectPythiaSigningClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolvePythiaUrl: async () => "https://pythia.example",
    });

    const out = await client.submit(SIGNED);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://pythia.example/stoachain/send");
    expect(String(url)).not.toContain("/api/pythia/relay");
    expect((init.headers as Record<string, string>)["x-pythia-key"]).toBeUndefined();
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ cmds: [SIGNED] });
    expect(out.requestKey).toBe("rk-consumer");
  });

  it("throws (never a node) when no Pythia gateway is configured — for reads AND sends", async () => {
    const client = createCodexDirectPythiaSigningClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolvePythiaUrl: async () => "",
    });
    await expect(client.submit(SIGNED)).rejects.toThrow(/no Pythia gateway/i);
    await expect(client.dirtyRead(SIM)).rejects.toThrow(/no Pythia gateway/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is wired into the public consumer codex mount (CodexApp <CodexProvider signingClient>)", () => {
    const src = readFileSync(join(process.cwd(), "app", "codex", "CodexApp.tsx"), "utf8");
    expect(src).toMatch(/createCodexDirectPythiaSigningClient/);
    expect(src).toMatch(/signingClient=\{signingClient\.current\}/);
  });
});
