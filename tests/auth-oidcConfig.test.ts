import { describe, it, expect } from "vitest";

import { loadOidcConfig } from "../lib/auth/oidcConfig";

const SECRET = "x".repeat(32);

describe("loadOidcConfig", () => {
  it("returns null when any required secret is absent so the login surface stays inert", () => {
    expect(loadOidcConfig({})).toBeNull();
    expect(loadOidcConfig({ OIDC_CLIENT_ID: "a" })).toBeNull();
    expect(
      loadOidcConfig({ OIDC_CLIENT_ID: "a", OIDC_CLIENT_SECRET: "b" }),
    ).toBeNull();
  });

  it("treats a REPLACE_ME placeholder client id as unconfigured (login boots dark, no crash)", () => {
    // The .env.local ships placeholder creds until the hub registers the client;
    // a placeholder must read as "not configured", not as a real client.
    expect(
      loadOidcConfig({
        OIDC_CLIENT_ID: "REPLACE_ME_client_id",
        OIDC_CLIENT_SECRET: "REPLACE_ME_client_secret",
        SESSION_SECRET: SECRET,
      }),
    ).toBeNull();
  });

  it("treats a REPLACE_ME placeholder client secret as unconfigured", () => {
    expect(
      loadOidcConfig({
        OIDC_CLIENT_ID: "mnemosyne",
        OIDC_CLIENT_SECRET: "REPLACE_ME_client_secret",
        SESSION_SECRET: SECRET,
      }),
    ).toBeNull();
  });

  it("throws when the session secret is too short to sign cookies safely", () => {
    expect(() =>
      loadOidcConfig({
        OIDC_CLIENT_ID: "mnemosyne",
        OIDC_CLIENT_SECRET: "sec",
        SESSION_SECRET: "short",
      }),
    ).toThrow(/at least 32/);
  });

  it("builds config, strips a trailing slash from the issuer, and keeps the redirect byte-for-byte", () => {
    const cfg = loadOidcConfig({
      OIDC_ISSUER: "https://hub.test/",
      OIDC_CLIENT_ID: "mnemosyne",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "http://localhost:3005/admin/callback",
      SESSION_SECRET: SECRET,
    });
    expect(cfg).toMatchObject({
      issuer: "https://hub.test",
      clientId: "mnemosyne",
      clientSecret: "sec",
      redirectUri: "http://localhost:3005/admin/callback",
      sessionSecret: SECRET,
    });
  });

  it("marks cookies insecure for an http localhost redirect so the browser keeps them in dev", () => {
    const cfg = loadOidcConfig({
      OIDC_CLIENT_ID: "mnemosyne",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "http://localhost:3005/admin/callback",
      SESSION_SECRET: SECRET,
    });
    expect(cfg?.secureCookies).toBe(false);
  });

  it("marks cookies Secure for an https deployment redirect", () => {
    const cfg = loadOidcConfig({
      OIDC_CLIENT_ID: "mnemosyne",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "https://codex.ancientholdings.eu/admin/callback",
      SESSION_SECRET: SECRET,
    });
    expect(cfg?.secureCookies).toBe(true);
  });

  it("marks cookies Secure in production even behind an http redirect (TLS-terminating proxy)", () => {
    const cfg = loadOidcConfig({
      OIDC_CLIENT_ID: "mnemosyne",
      OIDC_CLIENT_SECRET: "sec",
      OIDC_REDIRECT_URI: "http://internal:3005/admin/callback",
      SESSION_SECRET: SECRET,
      NODE_ENV: "production",
    });
    expect(cfg?.secureCookies).toBe(true);
  });
});
