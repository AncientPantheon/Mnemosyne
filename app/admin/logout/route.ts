import { NextResponse, type NextRequest } from "next/server";

import { loadOidcConfig } from "@/lib/auth/oidcConfig";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Clear the site-wide session cookie and return home. */
export async function GET(request: NextRequest) {
  // Match the set-time path/secure so the browser actually clears the cookie;
  // fall back to a plain non-secure clear when unconfigured.
  const secure = loadOidcConfig()?.secureCookies ?? false;
  const res = NextResponse.redirect(new URL("/", request.url), 302);
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(secure), maxAge: 0 });
  return res;
}
