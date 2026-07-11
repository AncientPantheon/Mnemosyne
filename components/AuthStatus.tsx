"use client";

import { useEffect, useState } from "react";

/** The shape `/api/me` returns; mirrors the route handler's payload. */
interface MeResponse {
  authenticated: boolean;
  sub?: string;
  name?: string;
  roles?: string[];
}

/** Pick the role to surface in the header — ancient first, else the first role. */
function primaryRole(roles: string[] | undefined): string | null {
  if (!roles || roles.length === 0) return null;
  return roles.includes("ancient") ? "ancient" : roles[0];
}

/**
 * Header auth widget. Fetches `/api/me` (no-store) and shows either a "Login with
 * AncientHub" link (→ `/admin/login`) when signed out, or "Signed in as {name} ·
 * {role}" plus a Logout link (→ `/admin/logout`) when signed in. Used by the
 * Phase-3 admin page. Renders nothing until the first fetch resolves to avoid a
 * flash of the wrong state.
 */
export function AuthStatus() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: MeResponse) => {
        if (active) setMe(data);
      })
      .catch(() => {
        if (active) setMe({ authenticated: false });
      });
    return () => {
      active = false;
    };
  }, []);

  if (me === null) return null;

  if (!me.authenticated) {
    return (
      <a href="/admin/login" className="mnemosyne-auth-login">
        Login with AncientHub
      </a>
    );
  }

  const role = primaryRole(me.roles);
  return (
    <span className="mnemosyne-auth-status">
      Signed in as {me.name}
      {role ? ` · ${role}` : ""}
      {" · "}
      <a href="/admin/logout">Logout</a>
    </span>
  );
}

export default AuthStatus;
