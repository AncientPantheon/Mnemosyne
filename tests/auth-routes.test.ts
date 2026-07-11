import { describe, it, expect } from "vitest";

import { GET as meGET } from "../app/api/me/route";
import { GET as pingGET } from "../app/api/admin/ping/route";
import { GET as loginGET } from "../app/admin/login/route";
import { GET as logoutGET } from "../app/admin/logout/route";

// The test process has no real OIDC env (and .env.local ships REPLACE_ME_*
// placeholders), so loadOidcConfig() returns null — the login surface is inert.
// These assertions pin exactly that "boots dark, never crashes" contract.

function req(path: string): Request {
  return new Request(`http://localhost:3005${path}`);
}

describe("/api/me — inert + non-cacheable when unconfigured", () => {
  it("reports {authenticated:false} rather than crashing", async () => {
    const res = await meGET(req("/api/me") as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it("sets Cache-Control: no-store so a phantom logged-in state cannot be cached", async () => {
    const res = await meGET(req("/api/me") as never);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});

describe("/api/admin/ping — ancient gate closed when unconfigured", () => {
  it("401s (no configured secret ⇒ no session can exist)", async () => {
    const res = await pingGET(req("/api/admin/ping") as never);
    expect(res.status).toBe(401);
  });
});

describe("/admin/login — inert redirect when unconfigured", () => {
  it("redirects home with an error flag instead of erroring", async () => {
    const res = await loginGET(req("/admin/login") as never);
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("/?auth_error=unconfigured");
  });
});

describe("/admin/logout", () => {
  it("clears the session cookie and redirects home", async () => {
    const res = await logoutGET(req("/admin/logout") as never);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location") ?? "", "http://x").pathname).toBe("/");
    // The Set-Cookie clears the session (maxAge 0 ⇒ Expires in the past / Max-Age=0).
    expect(res.headers.get("set-cookie")).toContain("mnemosyne_session=");
  });
});
