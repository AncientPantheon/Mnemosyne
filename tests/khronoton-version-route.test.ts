import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

import { GET } from "../app/api/admin/khronoton-version/route";
import { signSession } from "../lib/auth/session";

const SECRET = "khronoton-version-route-test-session-secret!!";

function req(cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/khronoton-version", {
    method: "GET",
    headers: { ...(cookie ? { cookie } : {}) },
  });
}
async function ancientCookie(): Promise<string> {
  const token = await signSession({ sub: "a1", roles: ["ancient"], name: "Ancient" }, SECRET);
  return `mnemosyne_session=${token}`;
}
async function modernCookie(): Promise<string> {
  const token = await signSession({ sub: "m1", roles: ["modern"], name: "Modern" }, SECRET);
  return `mnemosyne_session=${token}`;
}

beforeAll(() => {
  process.env.OIDC_CLIENT_ID = "mnemosyne-test";
  process.env.OIDC_CLIENT_SECRET = "test-secret";
  process.env.SESSION_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.SESSION_SECRET;
});
afterEach(() => vi.unstubAllGlobals());

describe("/api/admin/khronoton-version — ancient-gated scaffold", () => {
  it("401s with no session", async () => {
    expect((await GET(req())).status).toBe(401);
  });

  it("403s for a non-ancient session", async () => {
    expect((await GET(req(await modernCookie()))).status).toBe(403);
  });

  it("200s for an ancient with { installed:<semver>, wired:true, available } + no-store", async () => {
    // npm reports an OLDER version than what's installed → no update available.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "0.1.1" } }), { status: 200 }),
      ),
    );
    const res = await GET(req(await ancientCookie()));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    // Khronoton is now a real dependency: installed is read from node_modules, wired:true.
    expect(body.wired).toBe(true);
    expect(body.installed).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.installed).not.toBe("not wired");
    expect(body.available).toBe("0.1.1");
    expect(body.updateAvailable).toBe(false);
  });

  it("flags updateAvailable when npm publishes a newer Khronoton", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "99.0.0" } }), { status: 200 }),
      ),
    );
    const res = await GET(req(await ancientCookie()));
    const body = await res.json();
    expect(body.wired).toBe(true);
    expect(body.available).toBe("99.0.0");
    expect(body.updateAvailable).toBe(true);
  });

  it("still reports wired:true with available:null + no update when npm is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const res = await GET(req(await ancientCookie()));
    const body = await res.json();
    expect(body.wired).toBe(true);
    expect(body.available).toBeNull();
    expect(body.updateAvailable).toBe(false);
  });
});
