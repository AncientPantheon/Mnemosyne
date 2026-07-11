import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { MnemosyneServerCodexAdapter } from "../lib/codex-dropin/MnemosyneServerCodexAdapter";

// The adapter is a thin server-custody proxy: it turns codex-ui writes into
// POST /api/admin/codex { backup: JSON.stringify(snapshot) } and reads them back
// through GET. These tests stub global fetch and assert the wire contract +
// per-slice patching, so a regression in the adapter surfaces without a browser.

type FetchArgs = { url: string; init?: RequestInit };

/** A fake sealed store: last POSTed `backup` is echoed back on GET. */
function makeFetchStub() {
  let stored: string | null = null;
  const calls: FetchArgs[] = [];

  const stub = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "GET") {
      return new Response(JSON.stringify({ initialized: stored !== null, password: "pw", backup: stored }), { status: 200 });
    }
    if (method === "POST") {
      const body = JSON.parse(String(init?.body)) as { backup: string };
      stored = body.backup;
      return new Response(JSON.stringify({ ok: true, initialized: true }), { status: 200 });
    }
    if (method === "DELETE") {
      stored = null;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("nope", { status: 405 });
  });

  return { stub, calls, peek: () => stored };
}

let fetchStub: ReturnType<typeof makeFetchStub>;

beforeEach(() => {
  fetchStub = makeFetchStub();
  vi.stubGlobal("fetch", fetchStub.stub);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MnemosyneServerCodexAdapter — server-custody wire contract", () => {
  it("loadAll returns emptySnapshot when the store has no backup yet (create-on-the-spot)", async () => {
    const a = new MnemosyneServerCodexAdapter("main");
    const snap = await a.loadAll();
    expect(snap.kadenaSeeds).toEqual([]);
    expect(snap.ouroAccounts).toEqual([]);
    expect(snap.lastUpdatedDevice).toBe("main");
    // GET /api/admin/codex, no-store.
    expect(fetchStub.calls[0].url).toBe("/api/admin/codex");
  });

  it("saveAll POSTs { backup: JSON.stringify(snapshot) } and loadAll round-trips it", async () => {
    const a = new MnemosyneServerCodexAdapter("main");
    const snap = await a.loadAll();
    const withSeed = { ...snap, schemaVersion: 7 };
    await a.saveAll(withSeed);

    // The POST body wraps the whole snapshot as an opaque `backup` string.
    const post = fetchStub.calls.find((c) => (c.init?.method ?? "GET") === "POST");
    expect(post?.url).toBe("/api/admin/codex");
    const body = JSON.parse(String(post?.init?.body)) as { backup: string };
    expect(JSON.parse(body.backup).schemaVersion).toBe(7);

    // A fresh adapter reads it back verbatim.
    const b = new MnemosyneServerCodexAdapter("main");
    const reloaded = await b.loadAll();
    expect(reloaded.schemaVersion).toBe(7);
  });

  it("saveStoaChainSeeds patches only the kadenaSeeds slice, preserving the rest", async () => {
    const a = new MnemosyneServerCodexAdapter("main");
    await a.loadAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seeds = [{ id: "s1" } as any];
    await a.saveStoaChainSeeds(seeds);

    const saved = JSON.parse(fetchStub.peek()!);
    expect(saved.kadenaSeeds).toEqual([{ id: "s1" }]);
    expect(saved.ouroAccounts).toEqual([]); // untouched slice survives
  });

  it("clearAll DELETEs and resets in-memory state to empty", async () => {
    const a = new MnemosyneServerCodexAdapter("main");
    await a.loadAll();
    await a.saveAll({ ...(await a.loadAll()), schemaVersion: 3 });
    expect(fetchStub.peek()).not.toBeNull();

    await a.clearAll();
    expect(fetchStub.peek()).toBeNull();
    const del = fetchStub.calls.find((c) => (c.init?.method ?? "GET") === "DELETE");
    expect(del?.url).toBe("/api/admin/codex");
  });

  it("throws a named error when the store rejects a load (so the UI can surface it)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 403 })),
    );
    const a = new MnemosyneServerCodexAdapter("main");
    await expect(a.loadAll()).rejects.toThrow(/mnemosyne-server: load failed \(HTTP 403\)/);
  });
});
