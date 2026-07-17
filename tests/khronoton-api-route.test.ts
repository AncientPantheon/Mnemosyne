import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

import { signSession } from "../lib/auth/session";

/**
 * The /api/admin/khronoton catch-all — the Next adapter over the package's
 * sixteen handlers. Hermetic: the chain runtime is stubbed (no @stoachain SDK
 * loads, no network), the sqlite store lives in a temp dir. What's under test is
 * the ADAPTER contract: the ancient gate in front of everything, the confirm
 * header arbitration for mutations, the path→handler mapping, and a real
 * list round-trip against the engine store.
 */

vi.mock("../lib/khronoton/runtime", () => ({
  getChainRuntime: async () => ({}) as unknown,
}));

import { GET, POST } from "../app/api/admin/khronoton/[[...path]]/route";

const SECRET = "khronoton-api-route-test-session-secret!!!";

function req(
  method: "GET" | "POST",
  path: string,
  opts: { cookie?: string; confirmed?: boolean; body?: unknown } = {},
): Request {
  return new Request(`http://localhost:3005/api/admin/khronoton${path}`, {
    method,
    headers: {
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.confirmed ? { "x-khronoton-confirmed": "1" } : {}),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

function ctx(...segments: string[]): { params: Promise<{ path?: string[] }> } {
  return { params: Promise.resolve({ path: segments.length ? segments : undefined }) };
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
  dir = mkdtempSync(join(tmpdir(), "mnemo-khronoton-api-"));
  process.env.MNEMOSYNE_KHRONOTON_DIR = dir;
  process.env.OIDC_CLIENT_ID = "mnemosyne-test";
  process.env.OIDC_CLIENT_SECRET = "test-secret";
  process.env.SESSION_SECRET = SECRET;
});

afterAll(() => {
  delete process.env.MNEMOSYNE_KHRONOTON_DIR;
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.SESSION_SECRET;
  // Close the singleton sqlite handle so Windows releases the file lock.
  const g = globalThis as unknown as { __mnemosyneKhronotonDb?: { close(): void } };
  g.__mnemosyneKhronotonDb?.close();
  delete g.__mnemosyneKhronotonDb;
  rmSync(dir, { recursive: true, force: true });
});

describe("/api/admin/khronoton — ancient gate in front of EVERYTHING", () => {
  it("401s with no session (read tier too)", async () => {
    expect((await GET(req("GET", ""), ctx())).status).toBe(401);
  });

  it("403s for a non-ancient session", async () => {
    const res = await GET(req("GET", "", { cookie: await modernCookie() }), ctx());
    expect(res.status).toBe(403);
  });
});

describe("/api/admin/khronoton — adapter contract", () => {
  it("GET / lists cronotons from the real engine store (empty at first)", async () => {
    const res = await GET(req("GET", "", { cookie: await ancientCookie() }), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { ok: boolean; codexCronotons: unknown[] };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.codexCronotons)).toBe(true);
    expect(body.codexCronotons).toHaveLength(0);
  });

  it("POST / without the confirm header 401s admin_confirm_required (runGated round-trip)", async () => {
    const res = await POST(
      req("POST", "", { cookie: await ancientCookie(), body: { name: "x" } }),
      ctx(),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("admin_confirm_required");
  });

  it("a confirmed but invalid commit reaches the handler and 400s on validation", async () => {
    const res = await POST(
      req("POST", "", {
        cookie: await ancientCookie(),
        confirmed: true,
        body: { name: "" },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
  });

  it("404s an unmapped path instead of guessing a handler", async () => {
    const res = await GET(
      req("GET", "/nope/really/not/a/route", { cookie: await ancientCookie() }),
      ctx("nope", "really", "not", "a", "route"),
    );
    expect(res.status).toBe(404);
  });
});
