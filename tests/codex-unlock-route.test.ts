import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { GET } from "../app/api/admin/codex/unlock/route";
import { signSession } from "../lib/auth/session";

// Same real-gate approach as codex-store-routes.test.ts — a >=32-char secret so
// loadOidcConfig() accepts it and requireAncient verifies signed cookies.
const SECRET = "codex-unlock-test-session-secret-40chars!!";

function req(cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/codex/unlock", {
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

let dir: string;
beforeAll(() => {
  process.env.MNEMOSYNE_MASTER_KEY = Buffer.alloc(32, 5).toString("base64");
  process.env.OIDC_CLIENT_ID = "mnemosyne-test";
  process.env.OIDC_CLIENT_SECRET = "test-secret";
  process.env.SESSION_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.SESSION_SECRET;
});
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});
function freshStore(): void {
  dir = mkdtempSync(join(tmpdir(), "mnemo-codex-unlock-"));
  process.env.MNEMOSYNE_CODEX_DIR = dir;
}

describe("/api/admin/codex/unlock — ancient-gated master-key password", () => {
  it("401s with no session (the password is never exposed unauthenticated)", async () => {
    freshStore();
    expect((await GET(req())).status).toBe(401);
  });

  it("403s for a valid non-ancient session", async () => {
    freshStore();
    expect((await GET(req(await modernCookie()))).status).toBe(403);
  });

  it("200s for an ancient, hands the machine password, and marks no-store", async () => {
    freshStore();
    const res = await GET(req(await ancientCookie()));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.password).toBe("string");
    expect(body.password.length).toBeGreaterThan(0);
  });

  it("is idempotent — the same ancient gets the SAME password across calls", async () => {
    freshStore();
    const cookie = await ancientCookie();
    const p1 = (await (await GET(req(cookie))).json()).password;
    const p2 = (await (await GET(req(cookie))).json()).password;
    expect(p1).toBe(p2);
  });
});
