import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { readAdminSettings, writeAdminSettings } from "@/lib/adminSettings";
import { normalizePythiaUrl } from "@/lib/pythiaUrl";

// Dynamic so the gate reads the live session on every request (never cached).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated: set (or clear) the Pythia gateway base URL that is injected as the
 * Codex `global` connection for all Mnemosyne users. `401` unauthenticated, `403`
 * non-ancient, `400` for a malformed URL, `200 {pythiaUrl}` on save. An empty
 * submission CLEARS the connector (both chains fall back to local). URLs only.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { pythiaUrl?: unknown };
  try {
    body = (await request.json()) as { pythiaUrl?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const raw = typeof body.pythiaUrl === "string" ? body.pythiaUrl : "";

  // Empty ⇒ explicit clear; a non-empty value must be a valid http/https URL.
  let pythiaUrl: string;
  if (raw.trim() === "") {
    pythiaUrl = "";
  } else {
    const normalized = normalizePythiaUrl(raw);
    if (normalized === null) {
      return Response.json(
        { error: "pythiaUrl must be a valid http(s) URL" },
        { status: 400, headers: NO_STORE },
      );
    }
    pythiaUrl = normalized;
  }

  writeAdminSettings({ ...readAdminSettings(), pythiaUrl });
  return Response.json({ ok: true, pythiaUrl }, { headers: NO_STORE });
}
