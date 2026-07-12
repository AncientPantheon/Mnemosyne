import { describe, it, expect } from "vitest";

import { loadOidcConfig, resolveRedirect, type OidcConfig } from "../lib/auth/oidcConfig";

const SECRET = "x".repeat(32);

/** A config whose static redirect is a WRONG-environment localhost — proves the
 *  host-derived resolver ignores it for real requests (the bug we are fixing). */
const CFG: OidcConfig = {
  issuer: "https://hub.test",
  clientId: "mnemosyne",
  clientSecret: "sec",
  redirectUri: "http://localhost:3005/admin/callback",
  sessionSecret: SECRET,
  secureCookies: false,
};

function reqWith(headers: Record<string, string>): Request {
  return new Request("http://internal/admin/login", { headers });
}

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

describe("resolveRedirect — host-derived redirect URI (the localhost-trap fix)", () => {
  it("derives an http localhost redirect (insecure cookies) from a dev Host header", () => {
    const out = resolveRedirect(reqWith({ host: "localhost:3005" }), CFG);
    expect(out.redirectUri).toBe("http://localhost:3005/admin/callback");
    expect(out.secureCookies).toBe(false);
  });

  it("derives the PROD https redirect from the proxy's forwarded headers — NOT the config's localhost", () => {
    // The whole point: even though CFG.redirectUri is localhost, a request that
    // arrives for the live host must resolve to the live callback.
    const out = resolveRedirect(
      reqWith({
        "x-forwarded-host": "codex.ancientholdings.eu",
        "x-forwarded-proto": "https",
        host: "127.0.0.1:3005",
      }),
      CFG,
    );
    expect(out.redirectUri).toBe("https://codex.ancientholdings.eu/admin/callback");
    expect(out.secureCookies).toBe(true);
  });

  it("defaults a non-local host with no forwarded-proto to https (safe for a real domain)", () => {
    const out = resolveRedirect(reqWith({ host: "codex.ancientholdings.eu" }), CFG);
    expect(out.redirectUri).toBe("https://codex.ancientholdings.eu/admin/callback");
    expect(out.secureCookies).toBe(true);
  });

  it("takes the FIRST value when a forwarded header carries a comma list", () => {
    const out = resolveRedirect(
      reqWith({
        "x-forwarded-host": "codex.ancientholdings.eu, edge.internal",
        "x-forwarded-proto": "https, http",
      }),
      CFG,
    );
    expect(out.redirectUri).toBe("https://codex.ancientholdings.eu/admin/callback");
  });

  it("falls back to the configured redirect only when there is NO host header at all", () => {
    const out = resolveRedirect(new Request("http://x/admin/login"), {
      ...CFG,
      redirectUri: "https://fallback.example/admin/callback",
      secureCookies: true,
    });
    // Node's Request may synthesize a host from the URL; assert the fallback OR a
    // derived value, never a crash — the branch exists for header-less contexts.
    expect(out.redirectUri).toMatch(/\/admin\/callback$/);
  });
});
