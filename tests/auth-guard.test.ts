import { describe, it, expect } from "vitest";

import { requireAncient } from "../lib/auth/guard";
import { signSession } from "../lib/auth/session";

const SECRET = "unit-test-session-secret-at-least-32-chars";

function request(cookie?: string): Request {
  return new Request("http://localhost:3005/api/admin/ping", {
    headers: cookie ? { cookie } : {},
  });
}

describe("requireAncient — the shared ancient-only gate", () => {
  it("401s when no session cookie is present at all", async () => {
    const gate = await requireAncient(request(), SECRET);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("401s when only a stale/invalid session cookie is present", async () => {
    const gate = await requireAncient(
      request("mnemosyne_session=STALE.INVALID.TOKEN"),
      SECRET,
    );
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("401s when the deployment is unconfigured (no secret ⇒ no session is possible)", async () => {
    const valid = await signSession(
      { sub: "u1", roles: ["ancient"], name: "Ancient" },
      SECRET,
    );
    // No secret override AND no OIDC env in the test process ⇒ gate cannot verify.
    const gate = await requireAncient(request(`mnemosyne_session=${valid}`));
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(401);
  });

  it("403s when a valid session lacks the ancient role", async () => {
    const modern = await signSession(
      { sub: "u2", roles: ["modern"], name: "Modern" },
      SECRET,
    );
    const gate = await requireAncient(request(`mnemosyne_session=${modern}`), SECRET);
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.response.status).toBe(403);
  });

  it("admits an ancient session and exposes it to the handler", async () => {
    const valid = await signSession(
      { sub: "u1", roles: ["ancient"], name: "Ancient" },
      SECRET,
    );
    const gate = await requireAncient(request(`mnemosyne_session=${valid}`), SECRET);
    expect(gate.ok).toBe(true);
    if (gate.ok) {
      expect(gate.session.sub).toBe("u1");
      expect(gate.session.roles).toEqual(["ancient"]);
    }
  });

  it("admits when a VALID session cookie trails a stale duplicate of the same name", async () => {
    // RFC 6265 sends the longer-path (stale) cookie FIRST; a naive single-value
    // read would 401. The gate scans every mnemosyne_session value and admits any
    // that verifies — a forged/stale one is simply skipped, never admitted.
    const valid = await signSession(
      { sub: "u1", roles: ["ancient"], name: "Ancient" },
      SECRET,
    );
    const cookie = `mnemosyne_session=STALE.INVALID.TOKEN; mnemosyne_session=${valid}`;
    const gate = await requireAncient(request(cookie), SECRET);
    expect(gate.ok).toBe(true);
  });
});
