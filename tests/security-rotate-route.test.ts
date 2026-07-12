import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { GET, POST } from "../app/api/admin/security/rotate-master-key/route";
import { signSession } from "../lib/auth/session";
import { getOrCreateCodexPassword, saveBackup } from "../lib/mnemosyneCodexStore";

const SECRET = "security-rotate-route-test-secret-40chars!!";
const OLD_KEY = Buffer.alloc(32, 7).toString("base64");

function req(method: string, body?: unknown, cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/security/rotate-master-key", {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
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
  process.env.OIDC_CLIENT_ID = "mnemosyne-test";
  process.env.OIDC_CLIENT_SECRET = "test-secret";
  process.env.SESSION_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.SESSION_SECRET;
});
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mnemo-sec-route-"));
  process.env.MNEMOSYNE_CODEX_DIR = join(dir, "codex");
  process.env.MNEMOSYNE_ENV_FILE = join(dir, ".env.local");
  writeFileSync(process.env.MNEMOSYNE_ENV_FILE, `MNEMOSYNE_MASTER_KEY=${OLD_KEY}\n`);
  process.env.MNEMOSYNE_MASTER_KEY = OLD_KEY;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MNEMOSYNE_CODEX_DIR;
  delete process.env.MNEMOSYNE_ENV_FILE;
  delete process.env.MNEMOSYNE_MASTER_KEY;
});

describe("/api/admin/security/rotate-master-key — gating + rotation", () => {
  it("GET 401 unauthenticated, 403 non-ancient, 200 ancient with a secret-free status", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await GET(req("GET", undefined, await modernCookie()))).status).toBe(403);
    const res = await GET(req("GET", undefined, await ancientCookie()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body).not.toHaveProperty("key");
  });

  it("POST 401/403 for non-ancients", async () => {
    expect((await POST(req("POST", { acknowledgedExport: true }))).status).toBe(401);
    expect(
      (await POST(req("POST", { acknowledgedExport: true }, await modernCookie()))).status,
    ).toBe(403);
  });

  it("POST 400 without acknowledgedExport (can't rotate without affirming a key backup)", async () => {
    const cookie = await ancientCookie();
    expect((await POST(req("POST", {}, cookie))).status).toBe(400);
    expect((await POST(req("POST", { acknowledgedExport: false }, cookie))).status).toBe(400);
  });

  it("POST rotates for an ancient with the ack: codex still opens + the env key changed", async () => {
    const cookie = await ancientCookie();
    const passwordBefore = await getOrCreateCodexPassword();
    await saveBackup('{"snapshot":"x"}');

    const res = await POST(req("POST", { acknowledgedExport: true }, cookie));
    expect(res.status).toBe(200);
    expect((await res.json()).rotatedFiles).toBe(2);

    // Env key rotated away from OLD, and the codex still decrypts under the new key.
    expect(process.env.MNEMOSYNE_MASTER_KEY).not.toBe(OLD_KEY);
    expect(readFileSync(process.env.MNEMOSYNE_ENV_FILE!, "utf8")).not.toContain(OLD_KEY);
    expect(await getOrCreateCodexPassword()).toBe(passwordBefore);
  });
});
