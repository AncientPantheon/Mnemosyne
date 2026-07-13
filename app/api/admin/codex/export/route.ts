import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { getOrCreateCodexPassword, loadBackup } from "@/lib/mnemosyneCodexStore";
import { rekeyBackupBlob } from "@/lib/mnemosyneCodexRekey";

// Dynamic so the gate reads the live session on every request (never cached).
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Download the Mnemosyne codex re-encrypted under an operator-chosen password.
 *
 * The codex is server-custody: its inner secrets are encrypted under a machine password
 * the operator never sees, so a plain export would be unusable to them. Instead we
 * re-key the snapshot `machine-password → newPassword` (server-side, so the machine
 * password + master key never leave the box) and hand back a portable backup the
 * operator can restore with the password THEY chose. The live codex is untouched.
 *
 * POST body `{ newPassword: string }` → `{ ok, filename, backup }` (the re-keyed
 * raw-snapshot blob; the client turns it into a file download).
 *
 * `401` unauthenticated, `403` non-ancient, `400` bad password / empty codex.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { newPassword?: unknown };
  try {
    body = (await request.json()) as { newPassword?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const newPassword = body.newPassword;
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return Response.json(
      { error: "newPassword must be a string of at least 8 characters" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const backup = await loadBackup();
    if (!backup) {
      return Response.json(
        { error: "the codex is empty — nothing to export yet" },
        { status: 400, headers: NO_STORE },
      );
    }
    const machinePassword = await getOrCreateCodexPassword();
    const { blob, skipped } = await rekeyBackupBlob(backup, machinePassword, newPassword);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    return Response.json(
      { ok: true, filename: `mnemosyne-codex-${stamp}.json`, backup: blob, skipped },
      { headers: NO_STORE },
    );
  } catch (err) {
    // rekeyCodex only throws WrongPasswordError on a bad OLD password; here the old
    // password is the machine password we just read, so a throw is a server fault.
    const detail = err instanceof Error ? err.message : String(err);
    return Response.json(
      { error: `export failed on the server (${detail})` },
      { status: 500, headers: NO_STORE },
    );
  }
}
