import { type NextRequest } from "next/server";
import crypto from "node:crypto";

import { requireAncient } from "@/lib/auth/guard";
import { rotateMnemosyneMasterKey } from "@/lib/mnemosyneRotation";
import { isProvisioned, isInitialized } from "@/lib/mnemosyneCodexStore";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated master-key status + rotation for Mnemosyne's operator codex.
 *
 * GET  → `{ configured, provisioned, initialized }` (no secrets) for the Security
 *        admin page.
 * POST → rotate the master key. Requires `{ acknowledgedExport: true }` (the
 *        operator affirms they hold a recoverable copy of the CURRENT key — a
 *        rotation without a backup is irreversible). Generates a fresh 32-byte key
 *        server-side and re-seals the whole codex vault under it before persisting
 *        it (handoff 02 §4). Never returns the key material.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  return Response.json(
    {
      configured: Boolean(process.env.MNEMOSYNE_MASTER_KEY),
      provisioned: isProvisioned(),
      initialized: isInitialized(),
    },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { acknowledgedExport?: unknown };
  try {
    body = (await request.json()) as { acknowledgedExport?: unknown };
  } catch {
    body = {};
  }

  if (body.acknowledgedExport !== true) {
    return Response.json(
      {
        error:
          "acknowledgedExport must be true — confirm you hold a recoverable backup of the CURRENT master key before rotating (rotation is irreversible).",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const newKey = crypto.randomBytes(32).toString("base64");
    const { rotatedFiles } = await rotateMnemosyneMasterKey(newKey);
    return Response.json({ ok: true, rotatedFiles }, { headers: NO_STORE });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: `rotation failed (${detail}); the codex was NOT changed` },
      { status: 500, headers: NO_STORE },
    );
  }
}
