import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * `app/api/pythia/relay/route.ts` (POST) — the ancient-gated SEND relay that
 * routes the loaded Codex's SIGNED broadcasts through Pythia's `/stoachain/send`
 * (keyed with the connector's server-held `x-pythia-key`) so on-chain
 * transactions COUNT in Pythia's meter and are ATTRIBUTED to `mnemosyne`,
 * instead of the codex signing strategy submitting direct-to-node.
 *
 * The gated Pythia client is mocked, so only the route's own
 * auth/validation/relay/no-tx-sender branching is under test — no real gateway
 * or key work fires.
 */
const { getGatedPythiaClientMock, sendMock, readMock, pollMock } = vi.hoisted(() => ({
  getGatedPythiaClientMock: vi.fn(),
  sendMock: vi.fn(),
  readMock: vi.fn(),
  pollMock: vi.fn(),
}));

vi.mock("../lib/pythia/connectorClient", () => ({
  getGatedPythiaClient: getGatedPythiaClientMock,
}));

import { POST } from "../app/api/pythia/relay/route";
import { signSession } from "../lib/auth/session";

const SECRET = "pythia-relay-route-test-session-secret!!!!";

const SIGNED_CMD = { hash: "h1", sigs: [{ sig: "s1" }], cmd: "{\"payload\":{}}" };

function postReq(cookie: string | undefined, body?: unknown): Request {
  return new Request("http://localhost:3005/api/pythia/relay", {
    method: "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
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
  getGatedPythiaClientMock.mockReset();
  sendMock.mockReset();
  readMock.mockReset();
  pollMock.mockReset();
  getGatedPythiaClientMock.mockReturnValue({ send: sendMock, read: readMock, poll: pollMock });
});

describe("POST /api/pythia/relay", () => {
  it("401s with no session and never relays", async () => {
    const res = await POST(postReq(undefined, { cmds: [SIGNED_CMD] }));
    expect(res.status).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("403s for a non-ancient session and never relays", async () => {
    const res = await POST(postReq(await modernCookie(), { cmds: [SIGNED_CMD] }));
    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("400s when cmds is missing or not a non-empty array, without relaying", async () => {
    const res = await POST(postReq(await ancientCookie(), { cmds: [] }));
    expect(res.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("relays the signed cmds through the gated Pythia client and returns the node response verbatim", async () => {
    sendMock.mockResolvedValue({ requestKeys: ["rk-abc"] });

    const res = await POST(postReq(await ancientCookie(), { cmds: [SIGNED_CMD] }));

    expect(res.status).toBe(200);
    // Routed through Pythia's send (the ONLY thing that makes the tx COUNT), with
    // the caller-signed cmds passed verbatim.
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toEqual({ cmds: [SIGNED_CMD] });
    const body = await res.json();
    expect(body.requestKeys).toEqual(["rk-abc"]);
  });

  it("relays a dirty READ (code+data) through the gated Pythia client (Pythia /read, not a node)", async () => {
    readMock.mockResolvedValue({ result: { status: "success" }, gas: 512 });

    const res = await POST(postReq(await ancientCookie(), { code: "(coin.details x)", data: { x: 1 } }));

    expect(res.status).toBe(200);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(readMock.mock.calls[0][0]).toEqual({ code: "(coin.details x)", data: { x: 1 } });
    expect(sendMock).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.gas).toBe(512);
  });

  it("maps Pythia's 503 pythia_no_tx_sender to a clear error and NEVER falls back to a node", async () => {
    // The gated client returns the no-tx-sender envelope verbatim (that code is
    // not in the client's thrown-envelope set), so the route must detect it.
    sendMock.mockResolvedValue({ code: "pythia_no_tx_sender" });

    const res = await POST(postReq(await ancientCookie(), { cmds: [SIGNED_CMD] }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(String(body.error)).toMatch(/tx relay node/i);
    expect(body.code).toBe("pythia_no_tx_sender");
    // Exactly one relay attempt — no silent direct-to-node fallback.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
