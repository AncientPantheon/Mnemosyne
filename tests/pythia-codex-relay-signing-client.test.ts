import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `app/codex/codexRelaySigningClient.ts` — the browser signing client injected
 * into the operator codex's <CodexProvider signingClient={…}> so the loaded
 * Codex's WRITES route through Pythia's meter (via the ancient-gated relay)
 * while its `dirtyRead` simulation stays a direct-node `/local` for accurate gas.
 *
 * networkSettings is mocked so importing the adapter does not drag the codex
 * package (and its CSS side-effects) into the node test env.
 */
vi.mock("../app/codex/networkSettings", () => ({
  loadNetworkSettings: () => ({ stoaChainNodeUrl: "https://node.example" }),
}));

import {
  createCodexRelaySigningClient,
  createCodexDirectPythiaSigningClient,
} from "../app/codex/codexRelaySigningClient";

const SIGNED = { cmd: "{\"payload\":{}}", hash: "h1", sigs: [{ sig: "s1" }] };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("codexRelaySigningClient", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("dirtyRead POSTs the built command to the configured node's /local (accurate gas, not Pythia)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { result: { status: "success" }, gas: 700 }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const out = await client.dirtyRead({ any: "cmd" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    // The simulation goes to the NODE's /local — never through /api/pythia/relay.
    expect(url).toBe("https://node.example/chainweb/0.0/stoa/chain/0/pact/api/v1/local");
    expect(String(url)).not.toContain("/api/pythia/relay");
    expect(init.method).toBe("POST");
    expect(out).toEqual({ result: { status: "success" }, gas: 700 });
  });

  it("submit relays the SIGNED cmd through the gated relay and returns { requestKey }", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk-xyz"] }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const out = await client.submit(SIGNED);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    // Routing through the relay is what makes the tx COUNT in Pythia's meter.
    expect(url).toBe("/api/pythia/relay");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(JSON.parse(init.body)).toEqual({ cmds: [SIGNED] });
    // The strategy reads `.requestKey` off the return value.
    expect(out.requestKey).toBe("rk-xyz");
  });

  it("submit maps the 503 pythia_no_tx_sender to a clear throw (no node fallback)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(503, { code: "pythia_no_tx_sender", error: "…" }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.submit(SIGNED)).rejects.toThrow(/tx relay node/i);
    // Exactly one attempt — it never retries against a direct node.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("submit throws on a non-ok relay response", async () => {
    fetchImpl.mockResolvedValue(jsonRes(502, { error: "Node pool exhausted" }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.submit(SIGNED)).rejects.toThrow(/Node pool exhausted/);
  });

  it("dirtyRead throws on a non-2xx /local instead of returning a bodiless result (avoids silent default-gas)", async () => {
    fetchImpl.mockResolvedValue(new Response("gateway boom", { status: 502 }));
    const client = createCodexRelaySigningClient({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.dirtyRead({ any: "cmd" })).rejects.toThrow(/simulation failed|HTTP 502/i);
  });

  it("is wired into the operator codex mount (<CodexProvider signingClient>)", () => {
    // Source-contract: the admin codex passes the KEYED relay signing client to
    // the provider — that override re-points the operator codex's send at Pythia.
    const src = readFileSync(
      join(process.cwd(), "app", "admin", "codex", "MnemosyneCodex.tsx"),
      "utf8",
    );
    expect(src).toMatch(/createCodexRelaySigningClient/);
    expect(src).toMatch(/signingClient=/);
  });
});

describe("createCodexDirectPythiaSigningClient (public /codex — keyless browser-direct)", () => {
  let fetchImpl: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchImpl = vi.fn();
  });

  it("submit broadcasts the SIGNED cmd KEYLESS straight to Pythia's /stoachain/send (counts as a tx)", async () => {
    fetchImpl.mockResolvedValue(jsonRes(200, { requestKeys: ["rk-consumer"] }));
    const client = createCodexDirectPythiaSigningClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolvePythiaUrl: async () => "https://pythia.example",
    });

    const out = await client.submit(SIGNED);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://pythia.example/stoachain/send");
    // Keyless: no operator key header, and it does NOT go via Mnemosyne's relay.
    expect(String(url)).not.toContain("/api/pythia/relay");
    expect((init.headers as Record<string, string>)["x-pythia-key"]).toBeUndefined();
    expect(init.credentials).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({ cmds: [SIGNED] });
    expect(out.requestKey).toBe("rk-consumer");
  });

  it("submit throws (does not fall back to a node) when no Pythia gateway is configured", async () => {
    const client = createCodexDirectPythiaSigningClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      resolvePythiaUrl: async () => "",
    });

    await expect(client.submit(SIGNED)).rejects.toThrow(/no Pythia gateway/i);
    // Never attempted a node send.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("is wired into the public consumer codex mount (CodexApp <CodexProvider signingClient>)", () => {
    const src = readFileSync(join(process.cwd(), "app", "codex", "CodexApp.tsx"), "utf8");
    expect(src).toMatch(/createCodexDirectPythiaSigningClient/);
    expect(src).toMatch(/signingClient=\{signingClient\.current\}/);
  });
});
