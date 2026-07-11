import { type NextRequest } from "next/server";

import { loadOidcConfig } from "@/lib/auth/oidcConfig";
import { readSessionTolerant } from "@/lib/auth/session";

// Force-dynamic + no-store: the auth state must NEVER be cached — a stale cached
// "authenticated" would show the UI as logged-in while the live session is gone
// (phantom login), and App-Router GET handlers are cacheable by default.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Report who (if anyone) is logged in — drives the header and the enabled state
 * of admin controls. No secrets, just identity + roles. Returns
 * `{authenticated:false}` when unconfigured or when no valid session is present.
 */
export async function GET(request: NextRequest) {
  const cfg = loadOidcConfig();
  if (!cfg) {
    return Response.json({ authenticated: false }, { headers: NO_STORE });
  }

  const { session } = await readSessionTolerant(
    request.headers.get("cookie"),
    cfg.sessionSecret,
  );
  if (!session) {
    return Response.json({ authenticated: false }, { headers: NO_STORE });
  }

  return Response.json(
    {
      authenticated: true,
      sub: session.sub,
      name: session.name,
      roles: session.roles,
    },
    { headers: NO_STORE },
  );
}
