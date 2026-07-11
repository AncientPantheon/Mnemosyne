import { describe, it, expect } from "vitest";

import {
  signLoginState,
  readLoginState,
  signSession,
  readSession,
  loginCookieOptions,
  sessionCookieOptions,
} from "../lib/auth/session";

const SECRET = "y".repeat(32);
const OTHER = "z".repeat(32);

describe("admin cookies", () => {
  it("round-trips transient login state (state + nonce + PKCE verifier survive the redirect)", async () => {
    const token = await signLoginState(
      { state: "s", nonce: "n", codeVerifier: "v" },
      SECRET,
    );
    expect(await readLoginState(token, SECRET)).toMatchObject({
      purpose: "login",
      state: "s",
      nonce: "n",
      codeVerifier: "v",
    });
  });

  it("round-trips an authenticated session (sub + roles + name)", async () => {
    const token = await signSession(
      { sub: "u1", roles: ["ancient"], name: "Ancient One" },
      SECRET,
    );
    expect(await readSession(token, SECRET)).toMatchObject({
      purpose: "session",
      sub: "u1",
      roles: ["ancient"],
      name: "Ancient One",
    });
  });

  it("rejects a cookie signed with a different secret (forged/tampered cookie denied)", async () => {
    const token = await signSession({ sub: "u1", roles: [], name: "x" }, SECRET);
    expect(await readSession(token, OTHER)).toBeNull();
  });

  it("does not accept a login cookie as a session (purpose separation blocks confusion)", async () => {
    const token = await signLoginState(
      { state: "s", nonce: "n", codeVerifier: "v" },
      SECRET,
    );
    expect(await readSession(token, SECRET)).toBeNull();
  });

  it("does not accept a session cookie as login state", async () => {
    const token = await signSession({ sub: "u", roles: [], name: "x" }, SECRET);
    expect(await readLoginState(token, SECRET)).toBeNull();
  });

  it("returns null for absent or malformed cookies", async () => {
    expect(await readSession(undefined, SECRET)).toBeNull();
    expect(await readSession("not.a.jwt", SECRET)).toBeNull();
  });
});

describe("cookie posture (REVIEW H5 re-scope)", () => {
  it("scopes the login-state cookie to /admin (the callback path), short-lived and HttpOnly/Lax", () => {
    const opts = loginCookieOptions(true);
    // Re-scoped from the reference's /admin: the callback lives under /auth, so a
    // /admin-scoped cookie would never be sent and every login would silently fail.
    expect(opts.path).toBe("/admin");
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.maxAge).toBe(10 * 60);
  });

  it("scopes the session cookie to / so the whole site (header + gated APIs) sees the login", () => {
    const opts = sessionCookieOptions(true);
    expect(opts.path).toBe("/");
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
  });

  it("sets Secure only when the deployment is https, else the browser drops it on http://localhost", () => {
    expect(loginCookieOptions(true).secure).toBe(true);
    expect(loginCookieOptions(false).secure).toBe(false);
    expect(sessionCookieOptions(true).secure).toBe(true);
    expect(sessionCookieOptions(false).secure).toBe(false);
  });
});
