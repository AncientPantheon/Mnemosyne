import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * `app/api/admin/pythia-connector/route.ts` (POST + DELETE) and
 * `app/api/admin/pythia-connector/status/route.ts` (GET) — the reworked,
 * dual-link-key-driven connector admin surface (all on-chain onboarding
 * removed). Everything the routes reach past the auth gate is mocked so no
 * real SDK / codex / disk work fires: only the routes' own
 * auth/validation/codex-held/persistence branching is under test.
 *
 *  - `splitDualLinkKey` — throws on a malformed key (→ 400), else returns the
 *    two halves.
 *  - `maskSecret` — the status route's secret masker.
 *  - `loadCodexSnapshot` — the operator codex snapshot the POST route checks
 *    both halves against.
 *  - `writeConnectorState` / `clearConnectorState` / `readConnectorState` —
 *    the persistence seam.
 *  - `getDualLinkConnector` — the live connector whose `status()` the GET
 *    route surfaces.
 */
const {
  splitDualLinkKeyMock,
  maskSecretMock,
  loadCodexSnapshotMock,
  writeConnectorStateMock,
  clearConnectorStateMock,
  readConnectorStateMock,
  getDualLinkConnectorMock,
} = vi.hoisted(() => ({
  splitDualLinkKeyMock: vi.fn(),
  maskSecretMock: vi.fn(),
  loadCodexSnapshotMock: vi.fn(),
  writeConnectorStateMock: vi.fn(),
  clearConnectorStateMock: vi.fn(),
  readConnectorStateMock: vi.fn(),
  getDualLinkConnectorMock: vi.fn(),
}));

vi.mock("@ancientpantheon/pythia-client", () => ({
  splitDualLinkKey: splitDualLinkKeyMock,
  maskSecret: maskSecretMock,
}));

vi.mock("../lib/pythia/codexSnapshot", () => ({
  loadCodexSnapshot: loadCodexSnapshotMock,
  ouroAccountsOf: (snapshot: { ouroAccounts?: unknown }) =>
    Array.isArray(snapshot.ouroAccounts) ? snapshot.ouroAccounts : [],
}));

vi.mock("../lib/pythia/connectorStatus", () => ({
  writeConnectorState: writeConnectorStateMock,
  clearConnectorState: clearConnectorStateMock,
  readConnectorState: readConnectorStateMock,
}));

vi.mock("../lib/pythia/connectorClient", () => ({
  getDualLinkConnector: getDualLinkConnectorMock,
}));

import { POST, DELETE } from "../app/api/admin/pythia-connector/route";
import { GET as GET_STATUS } from "../app/api/admin/pythia-connector/status/route";
import { signSession } from "../lib/auth/session";

const SECRET = "pythia-connector-routes-test-session-secret!!";

const STANDARD = "₱.standard-account-half";
const SMART = "Π.smart-account-half";
const DUAL_LINK_KEY = `${STANDARD}|${SMART}`;

function postReq(cookie: string | undefined, body?: unknown): Request {
  return new Request("http://localhost:3005/api/admin/pythia-connector", {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function deleteReq(cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/pythia-connector", {
    method: "DELETE",
    headers: { ...(cookie ? { cookie } : {}) },
  });
}

function getReq(cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/pythia-connector/status", {
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

/** A codex snapshot whose `ouroAccounts` hold exactly the given addresses. */
function snapshotHolding(...addresses: string[]) {
  return { ouroAccounts: addresses.map((address) => ({ address })) };
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

beforeEach(() => {
  splitDualLinkKeyMock.mockReset();
  maskSecretMock.mockReset();
  loadCodexSnapshotMock.mockReset();
  writeConnectorStateMock.mockReset();
  clearConnectorStateMock.mockReset();
  readConnectorStateMock.mockReset();
  getDualLinkConnectorMock.mockReset();
});

describe("POST /api/admin/pythia-connector", () => {
  it("401s with no session and never touches persistence", async () => {
    const res = await POST(postReq(undefined, { dualLinkKey: DUAL_LINK_KEY }));
    expect(res.status).toBe(401);
    expect(splitDualLinkKeyMock).not.toHaveBeenCalled();
    expect(writeConnectorStateMock).not.toHaveBeenCalled();
  });

  it("403s for a non-ancient session and never touches persistence", async () => {
    const res = await POST(postReq(await modernCookie(), { dualLinkKey: DUAL_LINK_KEY }));
    expect(res.status).toBe(403);
    expect(writeConnectorStateMock).not.toHaveBeenCalled();
  });

  it("400s with the SDK's error message on a malformed dual-link-key", async () => {
    splitDualLinkKeyMock.mockImplementation(() => {
      throw new Error("dual-link-key must be exactly 325 chars");
    });

    const res = await POST(postReq(await ancientCookie(), { dualLinkKey: "too-short" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("dual-link-key must be exactly 325 chars");
    expect(writeConnectorStateMock).not.toHaveBeenCalled();
  });

  it("400s when a half is not held by the codex, without persisting", async () => {
    splitDualLinkKeyMock.mockReturnValue({ standardApollo: STANDARD, smartApollo: SMART });
    // Codex holds only the standard half; the smart half is missing.
    loadCodexSnapshotMock.mockResolvedValue(snapshotHolding(STANDARD));

    const res = await POST(postReq(await ancientCookie(), { dualLinkKey: DUAL_LINK_KEY }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain(SMART);
    expect(body.error).toContain("Codex tab");
    expect(writeConnectorStateMock).not.toHaveBeenCalled();
  });

  it("200s and stores the split halves when both are held by the codex", async () => {
    splitDualLinkKeyMock.mockReturnValue({ standardApollo: STANDARD, smartApollo: SMART });
    loadCodexSnapshotMock.mockResolvedValue(snapshotHolding(STANDARD, SMART));

    const res = await POST(postReq(await ancientCookie(), { dualLinkKey: DUAL_LINK_KEY }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(writeConnectorStateMock).toHaveBeenCalledTimes(1);
    const stored = writeConnectorStateMock.mock.calls[0][0];
    expect(stored.dualLinkKey).toBe(DUAL_LINK_KEY);
    expect(stored.standardApollo).toBe(STANDARD);
    expect(stored.smartApollo).toBe(SMART);
    expect(typeof stored.linkedAt).toBe("string");
    expect(Number.isNaN(Date.parse(stored.linkedAt))).toBe(false);
  });
});

describe("DELETE /api/admin/pythia-connector", () => {
  it("401s with no session and never clears", async () => {
    const res = await DELETE(deleteReq());
    expect(res.status).toBe(401);
    expect(clearConnectorStateMock).not.toHaveBeenCalled();
  });

  it("403s for a non-ancient session and never clears", async () => {
    const res = await DELETE(deleteReq(await modernCookie()));
    expect(res.status).toBe(403);
    expect(clearConnectorStateMock).not.toHaveBeenCalled();
  });

  it("200s and clears the stored key for an ancient", async () => {
    const res = await DELETE(deleteReq(await ancientCookie()));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(clearConnectorStateMock).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/pythia-connector/status", () => {
  it("401s with no session", async () => {
    const res = await GET_STATUS(getReq());
    expect(res.status).toBe(401);
  });

  it("403s for a non-ancient session", async () => {
    const res = await GET_STATUS(getReq(await modernCookie()));
    expect(res.status).toBe(403);
  });

  it("200s with the live status shape and a MASKED secret when active", async () => {
    readConnectorStateMock.mockReturnValue({
      dualLinkKey: DUAL_LINK_KEY,
      standardApollo: STANDARD,
      smartApollo: SMART,
      linkedAt: "2026-08-03T00:00:00.000Z",
    });
    const liveStatus = {
      standard: { status: "active", secret: "raw-secret-value", expiresAt: 1_800_000 },
      smart: { status: "pending" },
      secret: "raw-secret-value",
      expiresAt: 1_800_000,
    };
    getDualLinkConnectorMock.mockReturnValue({ status: () => liveStatus });
    maskSecretMock.mockReturnValue("ra***ue");

    const res = await GET_STATUS(getReq(await ancientCookie()));

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.linked).toBe(true);
    expect(body.standardApollo).toBe(STANDARD);
    expect(body.smartApollo).toBe(SMART);
    // The active half is passed through, but its RAW secret is stripped — only the
    // status label + expiry cross the wire (the raw x-pythia-key must never leak in a
    // per-half object beside the masked field).
    expect(body.standard).toEqual({ status: "active", expiresAt: 1_800_000 });
    expect(body.standard.secret).toBeUndefined();
    expect(body.smart).toEqual({ status: "pending" });
    expect(body.expiresAt).toBe(1_800_000);
    // The ONLY secret material on the wire is the single top-level masked form.
    expect(maskSecretMock).toHaveBeenCalledWith("raw-secret-value");
    expect(body.maskedSecret).toBe("ra***ue");
    // Belt-and-braces: the raw secret string appears nowhere in the serialized body.
    expect(JSON.stringify(body)).not.toContain("raw-secret-value");
  });

  it("200s with all-null halves/secret and linked:false when nothing is linked", async () => {
    readConnectorStateMock.mockReturnValue({
      dualLinkKey: null,
      standardApollo: null,
      smartApollo: null,
      linkedAt: null,
    });
    getDualLinkConnectorMock.mockReturnValue(null);

    const res = await GET_STATUS(getReq(await ancientCookie()));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.linked).toBe(false);
    expect(body.standard).toBeNull();
    expect(body.smart).toBeNull();
    expect(body.maskedSecret).toBeNull();
    expect(body.expiresAt).toBeNull();
    expect(maskSecretMock).not.toHaveBeenCalled();
  });
});
