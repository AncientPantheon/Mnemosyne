import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { getOrCreateCodexPassword, saveBackup } from "@/lib/mnemosyneCodexStore";
import { rejectIfNotSnapshot, rekeyBackupBlob } from "@/lib/mnemosyneCodexRekey";

// Dynamic so the gate reads the live session on every request (never cached).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Load an existing codex INTO Mnemosyne's server custody and adopt it.
 *
 * The uploaded codex's secrets are encrypted under its own password. We re-key it
 * `filePassword → machine-password` (so it decrypts under the same machine password the
 * codex-ui auto-unlocks with) and seal the result under the master key — the loaded
 * codex is now a first-class Mnemosyne codex. This REPLACES the current codex (the UI
 * confirms + suggests a Download first).
 *
 * POST body `{ backup: string, filePassword: string }` → `{ ok, skipped }`.
 *
 * `401` unauthenticated, `403` non-ancient, `400` bad body / wrong password / envelope.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { backup?: unknown; filePassword?: unknown };
  try {
    body = (await request.json()) as { backup?: unknown; filePassword?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  if (typeof body.backup !== "string" || body.backup === "") {
    return Response.json(
      { error: "backup must be a non-empty string" },
      { status: 400, headers: NO_STORE },
    );
  }
  if (typeof body.filePassword !== "string" || body.filePassword === "") {
    return Response.json(
      { error: "filePassword is required to decrypt the uploaded codex" },
      { status: 400, headers: NO_STORE },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.backup);
  } catch {
    return Response.json(
      { error: "the uploaded file is not valid JSON" },
      { status: 400, headers: NO_STORE },
    );
  }
  const shapeError = rejectIfNotSnapshot(parsed);
  if (shapeError) {
    return Response.json({ error: shapeError }, { status: 400, headers: NO_STORE });
  }

  try {
    const machinePassword = await getOrCreateCodexPassword();
    const { blob, skipped } = await rekeyBackupBlob(
      body.backup,
      body.filePassword,
      machinePassword,
    );
    await saveBackup(blob);
    return Response.json({ ok: true, skipped }, { headers: NO_STORE });
  } catch (err) {
    // WrongPasswordError from rekeyCodex = the operator typed the wrong file password.
    const name = err instanceof Error ? err.name : "";
    const detail = err instanceof Error ? err.message : String(err);
    if (/WrongPassword/i.test(name) || /password/i.test(detail)) {
      return Response.json(
        { error: "wrong password for the uploaded codex — nothing was changed" },
        { status: 400, headers: NO_STORE },
      );
    }
    return Response.json(
      { error: `import failed (${detail}) — nothing was changed` },
      { status: 500, headers: NO_STORE },
    );
  }
}
