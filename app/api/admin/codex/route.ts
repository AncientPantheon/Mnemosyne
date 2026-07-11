import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import {
  clearCodex,
  getOrCreateCodexPassword,
  isInitialized,
  loadBackup,
  saveBackup,
} from "@/lib/mnemosyneCodexStore";

// Dynamic so the gate reads the live session on every request (never cached).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated custody of Mnemosyne's own sealed operator Codex.
 *
 * GET  → `{ initialized, password, backup }`. Provisions the machine codex
 *        password on first load and hands it to the ancient admin's browser so
 *        the codex-ui auto-unlocks; `backup` is null until the first save.
 * POST → body `{ backup: string }` (a non-empty opaque export blob) → seals it.
 * DELETE → clears the whole codex.
 *
 * `401` unauthenticated, `403` non-ancient in every method.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const password = await getOrCreateCodexPassword();
  const backup = await loadBackup();
  return Response.json(
    { initialized: isInitialized(), password, backup },
    { headers: NO_STORE },
  );
}

export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { backup?: unknown };
  try {
    body = (await request.json()) as { backup?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  if (typeof body.backup !== "string" || body.backup === "") {
    return Response.json(
      { error: "backup must be a non-empty string" },
      { status: 400, headers: NO_STORE },
    );
  }

  await saveBackup(body.backup);
  return Response.json({ ok: true, initialized: true }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  clearCodex();
  return Response.json({ ok: true }, { headers: NO_STORE });
}
