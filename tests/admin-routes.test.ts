import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { rmSync } from "node:fs";
import { join } from "node:path";

import { GET as configGET } from "../app/api/config/route";
import { POST as pythiaPOST } from "../app/api/admin/pythia/route";
import { POST as updateCodexPOST } from "../app/api/admin/update-codex/route";
import { ADMIN_SETTINGS_PATH } from "../lib/adminSettings";
import { signSession } from "../lib/auth/session";

// A 40-char secret so loadOidcConfig() accepts it (>=32) and can verify the
// signed session cookies below — this exercises the REAL requireAncient path.
const SECRET = "admin-routes-test-session-secret-40chars!!";

function post(path: string, body: unknown, cookie?: string): Request {
  return new Request(`http://localhost:3005${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function ancientCookie(): Promise<string> {
  const token = await signSession(
    { sub: "a1", roles: ["ancient"], name: "Ancient" },
    SECRET,
  );
  return `mnemosyne_session=${token}`;
}

async function modernCookie(): Promise<string> {
  const token = await signSession(
    { sub: "m1", roles: ["modern"], name: "Modern" },
    SECRET,
  );
  return `mnemosyne_session=${token}`;
}

function clearSettings() {
  rmSync(ADMIN_SETTINGS_PATH, { force: true });
}

describe("GET /api/config — the PUBLIC operator-injected connector config", () => {
  afterEach(clearSettings);

  it("returns the pythiaUrl shape with no-store so every user's browser reads the live operator value", async () => {
    clearSettings();
    const res = await configGET();
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toEqual({ pythiaUrl: "" });
  });
});

describe("POST /api/admin/pythia — ancient-gated Pythia connector config", () => {
  afterEach(clearSettings);

  it("401s with no session (the gate is closed when unconfigured / unauthenticated)", async () => {
    const res = await pythiaPOST(post("/api/admin/pythia", { pythiaUrl: "https://p" }));
    expect(res.status).toBe(401);
  });

  describe("with a configured deployment", () => {
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

    it("403s a valid non-ancient session (only ancients may set the global connector)", async () => {
      const res = await pythiaPOST(
        post("/api/admin/pythia", { pythiaUrl: "https://p" }, await modernCookie()),
      );
      expect(res.status).toBe(403);
    });

    it("saves a valid URL for an ancient and reflects it through GET /api/config (the injection path)", async () => {
      const setRes = await pythiaPOST(
        post(
          "/api/admin/pythia",
          { pythiaUrl: "https://pythia.ancientholdings.eu" },
          await ancientCookie(),
        ),
      );
      expect(setRes.status).toBe(200);
      expect((await setRes.json()).pythiaUrl).toBe("https://pythia.ancientholdings.eu");

      const cfg = await configGET();
      expect((await cfg.json()).pythiaUrl).toBe("https://pythia.ancientholdings.eu");
    });

    it("400s an invalid URL from an ancient rather than persisting a broken global connection", async () => {
      const res = await pythiaPOST(
        post("/api/admin/pythia", { pythiaUrl: "not-a-url" }, await ancientCookie()),
      );
      expect(res.status).toBe(400);
    });

    it("clears the connector when an ancient submits an empty value (both chains fall back to local)", async () => {
      await pythiaPOST(
        post("/api/admin/pythia", { pythiaUrl: "https://p" }, await ancientCookie()),
      );
      const res = await pythiaPOST(
        post("/api/admin/pythia", { pythiaUrl: "" }, await ancientCookie()),
      );
      expect(res.status).toBe(200);
      expect((await configGET().json()).pythiaUrl).toBe("");
    });
  });
});

describe("POST /api/admin/update-codex — ancient-gated rebuild action", () => {
  it("401s with no session (the rebuild trigger is ancient-only)", async () => {
    const res = await updateCodexPOST(post("/api/admin/update-codex", {}));
    expect(res.status).toBe(401);
  });
});
