import { NextResponse, type NextRequest } from "next/server";

import { loadOidcConfig, resolveOrigin, siteUrl } from "@/lib/auth/oidcConfig";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Clear the site-wide session cookie and return home. */
export async function GET(request: NextRequest) {
  // Secure flag from the request's real origin (https prod / http localhost), so
  // the clear-cookie attributes match what was set — and the redirect goes to the
  // PUBLIC host, not the internal localhost:3005 request.url reflects behind nginx.
  const secure = resolveOrigin(request)?.startsWith("https:")
    ?? loadOidcConfig()?.secureCookies
    ?? false;
  const res = NextResponse.redirect(siteUrl(request, "/"), 302);
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(secure), maxAge: 0 });
  return res;
}
