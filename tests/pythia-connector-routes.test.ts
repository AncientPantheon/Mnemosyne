import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

import type { ConnectorStatus } from "../lib/pythia/connectorStatus";

/**
 * `app/api/admin/pythia-connector/route.ts` (POST) and
 * `app/api/admin/pythia-connector/status/route.ts` (GET) — ancient-gated
 * onboarding trigger + status poll. `startOnboarding`/`readConnectorStatus`
 * are mocked so no real onboarding work (chain calls, codex writes) ever
 * fires from this test — only the route's own auth/body/status-branching
 * logic is under test here (T6's own behavior is covered by
 * `tests/pythia-onboarding-job.test.ts`).
 */
const { startOnboardingMock, readConnectorStatusMock } = vi.hoisted(() => ({
  startOnboardingMock: vi.fn(),
  readConnectorStatusMock: vi.fn(),
}));

vi.mock("../lib/pythia/onboardingJob", () => ({
  startOnboarding: startOnboardingMock,
}));

vi.mock("../lib/pythia/connectorStatus", () => ({
  readConnectorStatus: readConnectorStatusMock,
}));

import { POST } from "../app/api/admin/pythia-connector/route";
import { GET as GET_STATUS } from "../app/api/admin/pythia-connector/status/route";
import { signSession } from "../lib/auth/session";

const SECRET = "pythia-connector-routes-test-session-secret!!";

const IDLE_STATUS: ConnectorStatus = {
  stage: "idle",
  standardApollo: null,
  smartApollo: null,
  startedAt: null,
  updatedAt: null,
  lastError: null,
};

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
  startOnboardingMock.mockReset();
  readConnectorStatusMock.mockReset();
  readConnectorStatusMock.mockReturnValue({ ...IDLE_STATUS });
});

describe("POST /api/admin/pythia-connector", () => {
  it("401s with no session", async () => {
    const res = await POST(postReq(undefined, { acknowledgedSpend: true }));
    expect(res.status).toBe(401);
    expect(startOnboardingMock).not.toHaveBeenCalled();
  });

  it("403s for a non-ancient session", async () => {
    const res = await POST(postReq(await modernCookie(), { acknowledgedSpend: true }));
    expect(res.status).toBe(403);
    expect(startOnboardingMock).not.toHaveBeenCalled();
  });

  it("400s when acknowledgedSpend is not true", async () => {
    const res = await POST(postReq(await ancientCookie(), { acknowledgedSpend: false }));
    expect(res.status).toBe(400);
    expect(startOnboardingMock).not.toHaveBeenCalled();
  });

  it("400s when acknowledgedSpend is missing entirely", async () => {
    const res = await POST(postReq(await ancientCookie(), {}));
    expect(res.status).toBe(400);
    expect(startOnboardingMock).not.toHaveBeenCalled();
  });

  it("202s and starts onboarding when acknowledged and status is idle", async () => {
    readConnectorStatusMock.mockReturnValue({ ...IDLE_STATUS });

    const res = await POST(postReq(await ancientCookie(), { acknowledgedSpend: true }));

    expect(res.status).toBe(202);
    expect(startOnboardingMock).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.status).toEqual(IDLE_STATUS);
  });

  it("409s without starting a new run when status is already mid-run", async () => {
    const midRun: ConnectorStatus = { ...IDLE_STATUS, stage: "linking" };
    readConnectorStatusMock.mockReturnValue(midRun);

    const res = await POST(postReq(await ancientCookie(), { acknowledgedSpend: true }));

    expect(res.status).toBe(409);
    expect(startOnboardingMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.error).toBe("onboarding already in progress");
    expect(body.status).toEqual(midRun);
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

  it("200s with the current status shape for an ancient", async () => {
    const inProgress: ConnectorStatus = {
      stage: "deploying-standard",
      standardApollo: "pub-standard",
      smartApollo: null,
      startedAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:00:01.000Z",
      lastError: null,
    };
    readConnectorStatusMock.mockReturnValue(inProgress);

    const res = await GET_STATUS(getReq(await ancientCookie()));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(inProgress);
  });
});
