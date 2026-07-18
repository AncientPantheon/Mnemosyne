import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fetchMe, type MeResponse } from "../lib/useMe";

// The single /api/me source. The hook itself needs a DOM (vitest here is node-env),
// so the fetch+parse core is factored into the pure `fetchMe(fetchImpl)` and unit-
// tested by injecting a stub fetch — the regressions that matter (wrong URL, a
// dropped `no-store` serving a stale session, an unhandled network error crashing the
// header) are all in that core. The hook wrapper is pinned by a light source contract.

describe("fetchMe — the /api/me fetch+parse core", () => {
  it("requests /api/me with cache: no-store (never a stale session)", async () => {
    const stub = vi.fn(async () =>
      new Response(JSON.stringify({ authenticated: false }), { status: 200 }),
    );
    await fetchMe(stub as unknown as typeof fetch);
    expect(stub).toHaveBeenCalledWith("/api/me", { cache: "no-store" });
  });

  it("returns the parsed authenticated payload", async () => {
    const payload: MeResponse = {
      authenticated: true,
      sub: "u1",
      name: "Ancient",
      roles: ["ancient"],
    };
    const stub = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    expect(await fetchMe(stub as unknown as typeof fetch)).toEqual(payload);
  });

  it("degrades to { authenticated: false } when the fetch rejects (no crash)", async () => {
    const stub = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await fetchMe(stub as unknown as typeof fetch)).toEqual({ authenticated: false });
  });
});

describe("useMe — hook wrapper (source contract)", () => {
  const src = readFileSync(join(process.cwd(), "lib", "useMe.ts"), "utf8");

  it("is a client hook that starts null and exposes { me, loading }", () => {
    expect(src).toMatch(/^["']use client["'];?/m);
    expect(src).toMatch(/export function useMe/);
    expect(src).toMatch(/useState<[^>]*>\(null\)/); // me starts null → no wrong-state flash
    expect(src).toMatch(/loading/);
  });
});
