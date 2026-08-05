import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * `app/api/admin/network-fallback/route.ts` (GET + POST) — the ancient-gated
 * break-glass control. adminSettings is mocked so only the route's own
 * auth/validation/persistence branching is under test.
 */
const { readMock, writeMock } = vi.hoisted(() => ({ readMock: vi.fn(), writeMock: vi.fn() }));

vi.mock("../lib/adminSettings", () => ({
  readAdminSettings: readMock,
  writeAdminSettings: writeMock,
}));

import { GET, POST } from "../app/api/admin/network-fallback/route";
import { signSession } from "../lib/auth/session";

const SECRET = "network-fallback-route-test-session-secret!!";

function req(method: string, cookie: string | undefined, body?: unknown): Request {
  return new Request("http://localhost:3005/api/admin/network-fallback", {
    method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const ancient = async () =>
  `mnemosyne_session=${await signSession({ sub: "a", roles: ["ancient"], name: "A" }, SECRET)}`;
const modern = async () =>
  `mnemosyne_session=${await signSession({ sub: "m", roles: ["modern"], name: "M" }, SECRET)}`;

beforeAll(() => {
  process.env.OIDC_CLIENT_ID = "x";
  process.env.OIDC_CLIENT_SECRET = "y";
  process.env.SESSION_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.OIDC_CLIENT_ID;
  delete process.env.OIDC_CLIENT_SECRET;
  delete process.env.SESSION_SECRET;
});
beforeEach(() => {
  readMock.mockReset();
  writeMock.mockReset();
  readMock.mockReturnValue({ pythiaUrl: "https://p", transportFallback: "pythia", nodeUrl: "https://node2.stoachain.com" });
});

describe("GET /api/admin/network-fallback", () => {
  it("401 without a session, 403 for non-ancient", async () => {
    expect((await GET(req("GET", undefined) as never)).status).toBe(401);
    expect((await GET(req("GET", await modern()) as never)).status).toBe(403);
  });
  it("returns the current mode + node for an ancient", async () => {
    const res = await GET(req("GET", await ancient()) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transportFallback: "pythia", nodeUrl: "https://node2.stoachain.com" });
  });
});

describe("POST /api/admin/network-fallback", () => {
  it("401/403 gate before persisting", async () => {
    expect((await POST(req("POST", undefined, { transportFallback: "direct-node" }) as never)).status).toBe(401);
    expect((await POST(req("POST", await modern(), { transportFallback: "direct-node" }) as never)).status).toBe(403);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("flips to direct-node and persists", async () => {
    const res = await POST(req("POST", await ancient(), { transportFallback: "direct-node" }) as never);
    expect(res.status).toBe(200);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock.mock.calls[0][0]).toMatchObject({ transportFallback: "direct-node" });
    expect((await res.json()).transportFallback).toBe("direct-node");
  });

  it("400s a bogus mode and a malformed node URL, without persisting", async () => {
    expect((await POST(req("POST", await ancient(), { transportFallback: "banana" }) as never)).status).toBe(400);
    expect((await POST(req("POST", await ancient(), { nodeUrl: "not-a-url" }) as never)).status).toBe(400);
    expect((await POST(req("POST", await ancient(), { nodeUrl: "javascript:alert(1)" }) as never)).status).toBe(400);
    expect(writeMock).not.toHaveBeenCalled();
  });

  it("saves a valid custom node URL", async () => {
    const res = await POST(req("POST", await ancient(), { nodeUrl: "https://my-node.example" }) as never);
    expect(res.status).toBe(200);
    expect(writeMock.mock.calls[0][0]).toMatchObject({ nodeUrl: "https://my-node.example" });
  });
});
