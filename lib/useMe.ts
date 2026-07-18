"use client";

import { useEffect, useState } from "react";

/**
 * The shape `GET /api/me` returns — the ONE authoritative client-side type for the
 * session, imported everywhere instead of being re-declared per component. Mirrors the
 * route handler payload (`app/api/me/route.ts`).
 */
export interface MeResponse {
  authenticated: boolean;
  sub?: string;
  name?: string;
  roles?: string[];
}

/**
 * Fetch + parse the current session. Factored out of the hook so it is unit-testable
 * in a node env (inject a stub `fetchImpl`). Always `no-store` — the header must never
 * render a stale session. A network/parse failure degrades to a signed-out state
 * rather than throwing, so the header can't crash the page.
 */
export async function fetchMe(fetchImpl: typeof fetch = fetch): Promise<MeResponse> {
  try {
    const res = await fetchImpl("/api/me", { cache: "no-store" });
    return (await res.json()) as MeResponse;
  } catch {
    return { authenticated: false };
  }
}

/**
 * Coalesce CONCURRENT `/api/me` fetches: when several hook instances mount together
 * (e.g. the admin gate + the header both consume the session on one page), they share
 * ONE request instead of each firing its own. The in-flight promise is cleared the
 * moment it settles, so a later mount (a new navigation) always fetches fresh — no
 * cross-time caching, so the session never goes stale.
 */
let inFlightMe: Promise<MeResponse> | null = null;
function sharedFetchMe(): Promise<MeResponse> {
  if (!inFlightMe) {
    inFlightMe = fetchMe().finally(() => {
      inFlightMe = null;
    });
  }
  return inFlightMe;
}

/**
 * The single `/api/me` consumption point for the whole app. Every header/identity
 * surface uses this hook instead of its own fetch, so there is one source of session
 * truth AND (via {@link sharedFetchMe}) one request per page load. `me` stays `null`
 * until the first response resolves (callers render nothing until then — no flash of
 * the wrong auth state); `loading` flips false once resolved.
 */
export function useMe(): { me: MeResponse | null; loading: boolean } {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void sharedFetchMe().then((data) => {
      if (!active) return;
      setMe(data);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return { me, loading };
}
