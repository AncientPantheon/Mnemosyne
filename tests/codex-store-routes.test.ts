import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { GET, POST, DELETE } from "../app/api/admin/codex/route";
import { signSession } from "../lib/auth/session";

// A 40-char secret so loadOidcConfig() accepts it (>=32) and requireAncient can
// verify the signed cookies — exercises the REAL gate, not a stub.
const SECRET = "codex-routes-test-session-secret-40chars!!";

function req(method: string, body?: unknown, cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/codex", {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
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
  dir = mkdtempSync(join(tmpdir(), "mnemo-codex-route-"));
  process.env.MNEMOSYNE_CODEX_DIR = dir;
}

describe("/api/admin/codex — ancient-gated sealed codex custody", () => {
  it("401s GET with no session (custody is never exposed unauthenticated)", async () => {
    freshStore();
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
  });

  it("403s GET for a valid non-ancient session (only ancients hold the operator codex)", async () => {
    freshStore();
    const res = await GET(req("GET", undefined, await modernCookie()));
    expect(res.status).toBe(403);
  });

  it("200s GET for an ancient, hands the auto-unlock password, and marks no-store", async () => {
    freshStore();
    const res = await GET(req("GET", undefined, await ancientCookie()));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.initialized).toBe(false); // provisioned but no content yet
    expect(typeof body.password).toBe("string");
    expect(body.password.length).toBeGreaterThan(0);
    expect(body.backup).toBeNull();
  });

  it("401s POST with no session (only ancients may write custody)", async () => {
    freshStore();
    const res = await POST(req("POST", { backup: "x" }));
    expect(res.status).toBe(401);
  });

  it("403s POST for a non-ancient session", async () => {
    freshStore();
    const res = await POST(req("POST", { backup: "x" }, await modernCookie()));
    expect(res.status).toBe(403);
  });

  it("400s POST when the backup is missing or not a non-empty string (never seals garbage)", async () => {
    freshStore();
    const cookie = await ancientCookie();
    expect((await POST(req("POST", {}, cookie))).status).toBe(400);
    expect((await POST(req("POST", { backup: "" }, cookie))).status).toBe(400);
    expect((await POST(req("POST", { backup: 42 }, cookie))).status).toBe(400);
  });

  it("saves an ancient's backup and reflects it back through GET (the custody round-trip)", async () => {
    freshStore();
    const cookie = await ancientCookie();
    const payload = '{"codex":"opaque-export"}';
    const saveRes = await POST(req("POST", { backup: payload }, cookie));
    expect(saveRes.status).toBe(200);

    const getRes = await GET(req("GET", undefined, cookie));
    const body = await getRes.json();
    expect(body.initialized).toBe(true);
    expect(body.backup).toBe(payload);
  });

  it("DELETE clears the codex for an ancient so a subsequent GET has no content", async () => {
    freshStore();
    const cookie = await ancientCookie();
    await POST(req("POST", { backup: "payload" }, cookie));
    const delRes = await DELETE(req("DELETE", undefined, cookie));
    expect(delRes.status).toBe(200);

    const getRes = await GET(req("GET", undefined, cookie));
    expect((await getRes.json()).initialized).toBe(false);
  });

  it("401s DELETE with no session (clearing custody is ancient-only)", async () => {
    freshStore();
    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(401);
  });
});
