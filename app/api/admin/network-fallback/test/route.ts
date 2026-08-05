import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { normalizePythiaUrl } from "@/lib/pythiaUrl";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated "Test Connection" for the Network Fallback panel: server-side
 * ping of a candidate Stoa node's `/info` (a chainweb node liveness endpoint), so
 * the admin can confirm a fallback target is reachable BEFORE flipping to it —
 * done server-side to avoid the browser CORS wall. `POST { nodeUrl }` →
 * `{ ok, status?, nodeVersion? }` or `{ ok:false, error }`. Never a secret; a URL.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { nodeUrl?: unknown };
  try {
    body = (await request.json()) as { nodeUrl?: unknown };
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const nodeUrl = normalizePythiaUrl(typeof body.nodeUrl === "string" ? body.nodeUrl : "");
  if (nodeUrl === null) {
    return Response.json({ ok: false, error: "nodeUrl must be a valid http(s) URL" }, { status: 400, headers: NO_STORE });
  }

  const infoUrl = `${nodeUrl.replace(/\/+$/, "")}/info`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(infoUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    let nodeVersion: string | undefined;
    try {
      const info = (await res.json()) as { nodeVersion?: unknown };
      if (typeof info.nodeVersion === "string") nodeVersion = info.nodeVersion;
    } catch {
      /* non-JSON body — still report the HTTP status */
    }
    return Response.json(
      { ok: res.ok, status: res.status, ...(nodeVersion ? { nodeVersion } : {}) },
      { headers: NO_STORE },
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : "unreachable";
    return Response.json({ ok: false, error }, { headers: NO_STORE });
  }
}
