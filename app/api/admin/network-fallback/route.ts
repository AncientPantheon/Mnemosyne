import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import {
  readAdminSettings,
  writeAdminSettings,
  type TransportFallback,
} from "@/lib/adminSettings";
import { normalizePythiaUrl } from "@/lib/pythiaUrl";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated: the break-glass Network Fallback control
 * (`HANDOFF-mnemosyne-network-fallback.md`).
 *
 * `GET`  → the current `{ transportFallback, nodeUrl }` (admin view; the public
 *          `/api/config` also carries these for the browser lanes).
 * `POST { transportFallback?, nodeUrl? }` → set either/both. `transportFallback`
 *          must be `"pythia" | "direct-node"`; `nodeUrl` a valid http(s) URL.
 *          Flipping to `direct-node` makes ALL chain traffic bypass Pythia
 *          (UNMETERED) — the UI warns; this route just persists the choice.
 *
 * `401` unauthenticated, `403` non-ancient, `400` invalid input.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;
  const { transportFallback, nodeUrl } = readAdminSettings();
  return Response.json({ transportFallback, nodeUrl }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { transportFallback?: unknown; nodeUrl?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return bad("invalid JSON body");
  }

  const current = readAdminSettings();
  const next = { ...current };

  if (body.transportFallback !== undefined) {
    if (body.transportFallback !== "pythia" && body.transportFallback !== "direct-node") {
      return bad('transportFallback must be "pythia" or "direct-node"');
    }
    next.transportFallback = body.transportFallback as TransportFallback;
  }

  if (body.nodeUrl !== undefined) {
    const raw = typeof body.nodeUrl === "string" ? body.nodeUrl : "";
    const normalized = normalizePythiaUrl(raw); // http/https URL validator (URLs only)
    if (normalized === null) {
      return bad("nodeUrl must be a valid http(s) URL");
    }
    next.nodeUrl = normalized;
  }

  writeAdminSettings(next);
  return Response.json(
    { ok: true, transportFallback: next.transportFallback, nodeUrl: next.nodeUrl },
    { headers: NO_STORE },
  );
}

function bad(error: string): Response {
  return Response.json({ error }, { status: 400, headers: NO_STORE });
}
