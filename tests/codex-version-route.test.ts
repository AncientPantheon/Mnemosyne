import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";

import { GET } from "../app/api/admin/codex-version/route";
import { signSession } from "../lib/auth/session";

const SECRET = "codex-version-route-test-session-secret!!";

function req(cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/codex-version", {
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

describe("/api/admin/codex-version — ancient-gated installed-vs-available", () => {
  it("401s with no session", async () => {
    expect((await GET(req())).status).toBe(401);
  });

  it("403s for a non-ancient session", async () => {
    expect((await GET(req(await modernCookie()))).status).toBe(403);
  });

  it("200s for an ancient with { installed, available, updateAvailable } + no-store", async () => {
    // Stub the npm registry so the route reports a newer version than installed.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "99.0.0" } }), { status: 200 }),
      ),
    );
    const res = await GET(req(await ancientCookie()));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(typeof body.installed).toBe("string");
    expect(body.available).toBe("99.0.0");
    expect(body.updateAvailable).toBe(true); // 99.0.0 > whatever is installed
  });

  it("reports updateAvailable:false and available:null when npm is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const res = await GET(req(await ancientCookie()));
    const body = await res.json();
    expect(body.available).toBeNull();
    expect(body.updateAvailable).toBe(false);
  });
});
