import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  readAdminSettings,
  writeAdminSettings,
  DEFAULT_FALLBACK_NODE_URL,
} from "../lib/adminSettings";
import { resolveServerTransport, pactBaseUrl } from "../lib/transport/serverTransport";
import { routeChainRuntimeThroughPythia } from "../lib/khronoton/pythiaRoutedRuntime";

describe("adminSettings — transportFallback + nodeUrl", () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "mnemo-admin-"));
    file = join(dir, "admin-settings.json");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("defaults to pythia + the embedded node when unset", () => {
    const s = readAdminSettings(file);
    expect(s.transportFallback).toBe("pythia");
    expect(s.nodeUrl).toBe(DEFAULT_FALLBACK_NODE_URL);
  });

  it("round-trips a direct-node choice + custom node", () => {
    writeAdminSettings(
      { pythiaUrl: "https://p", transportFallback: "direct-node", nodeUrl: "https://n.example" },
      file,
    );
    const s = readAdminSettings(file);
    expect(s.transportFallback).toBe("direct-node");
    expect(s.nodeUrl).toBe("https://n.example");
  });

  it("coerces a bogus transportFallback back to pythia", () => {
    writeFileSync(file, JSON.stringify({ transportFallback: "banana" }));
    expect(readAdminSettings(file).transportFallback).toBe("pythia");
  });
});

describe("resolveServerTransport", () => {
  afterEach(() => {
    delete process.env.MNEMOSYNE_KHRONOTON_DIRECT_NODE;
  });

  it("pythia by default", () => {
    const t = resolveServerTransport(() => ({ pythiaUrl: "https://p", transportFallback: "pythia", nodeUrl: "https://n" }));
    expect(t.mode).toBe("pythia");
  });

  it("direct-node when the admin toggle is set", () => {
    const t = resolveServerTransport(() => ({ pythiaUrl: "https://p", transportFallback: "direct-node", nodeUrl: "https://n" }));
    expect(t).toMatchObject({ mode: "direct-node", nodeUrl: "https://n" });
  });

  it("env override forces direct-node even while the toggle says pythia", () => {
    process.env.MNEMOSYNE_KHRONOTON_DIRECT_NODE = "1";
    const t = resolveServerTransport(() => ({ pythiaUrl: "https://p", transportFallback: "pythia", nodeUrl: "https://n" }));
    expect(t.mode).toBe("direct-node");
  });

  it("pactBaseUrl builds the chainweb path", () => {
    expect(pactBaseUrl("https://node2.stoachain.com/")).toBe(
      "https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact",
    );
  });
});

describe("Khronoton runtime honors the Network Fallback", () => {
  const SIGNED = { cmd: "{}", hash: "rk", sigs: [] };

  function fakeBase() {
    const nodeClient = {
      dirtyRead: vi.fn(async () => ({ result: { status: "success" }, gas: 1 })),
      submit: vi.fn(async () => ({ requestKey: "NODE-rk" })),
      listen: vi.fn(async () => ({ result: { status: "success" }, reqKey: "NODE-rk" })),
    };
    const createClient = vi.fn((_url: string) => nodeClient);
    const base = {
      createClient,
      getPactUrl: (c: string) => `https://x/chain/${c}/pact`,
      networkId: "stoa",
      namespace: "ns",
      gasStationAccount: "gas",
    } as never;
    return { base, nodeClient, createClient };
  }

  it("direct-node mode delegates to the base NODE client (unmetered, never the gateway)", async () => {
    const { base, nodeClient, createClient } = fakeBase();
    const gateway = { read: vi.fn(), send: vi.fn(), poll: vi.fn() };
    const rt = routeChainRuntimeThroughPythia(base, {
      getGateway: () => gateway,
      resolveTransport: () => ({ mode: "direct-node", nodeUrl: "https://node2.stoachain.com", pythiaUrl: "" }),
    });

    const out = await rt.createClient("ignored").submit(SIGNED);

    expect(out).toEqual({ requestKey: "NODE-rk" });
    expect(nodeClient.submit).toHaveBeenCalledWith(SIGNED);
    // The Pythia gateway is untouched while direct-node is active.
    expect(gateway.send).not.toHaveBeenCalled();
    // The node client was built at the admin-configured node's pact URL.
    expect(createClient.mock.calls[0][0]).toBe(
      "https://node2.stoachain.com/chainweb/0.0/stoa/chain/0/pact",
    );
  });

  it("pythia mode routes submit through the gateway (metered)", async () => {
    const { base, nodeClient } = fakeBase();
    const gateway = { read: vi.fn(), send: vi.fn(async () => ({ requestKeys: ["GW-rk"] })), poll: vi.fn() };
    const rt = routeChainRuntimeThroughPythia(base, {
      getGateway: () => gateway,
      resolveTransport: () => ({ mode: "pythia", nodeUrl: "https://n", pythiaUrl: "https://p" }),
    });

    const out = await rt.createClient("x").submit(SIGNED);

    expect(out).toEqual({ requestKey: "GW-rk" });
    expect(gateway.send).toHaveBeenCalledWith({ cmds: [SIGNED] });
    expect(nodeClient.submit).not.toHaveBeenCalled();
  });
});
