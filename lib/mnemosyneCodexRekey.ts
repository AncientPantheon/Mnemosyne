import { rekeyCodex } from "@ancientpantheon/codex/ouronet";
import type { CodexSnapshot } from "@ancientpantheon/codex/ouronet";

/**
 * Server-side codex re-key for the Mnemosyne own-codex portability flows (Download +
 * Load). Both are a re-encryption of the stored snapshot from one codex password to
 * another; the actual per-secret crypto + the drift-proof field-walk are owned by the
 * codex package's `rekeyCodex` (handoff 07). We only ferry the opaque `backup.sealed`
 * blob (which is `JSON.stringify(snapshot)`, see MnemosyneServerCodexAdapter) in and
 * out and never touch plaintext key material ourselves.
 *
 * `rekeyCodex` is imported from `/ouronet` (its runtime home in codex 0.6.0; the root
 * `.d.ts` re-exports it but the root JS entry omits it — a codex packaging slip to fix
 * upstream). It runs in pure Node — no store, no DOM.
 *
 * Throws the codex package's `WrongPasswordError` when `oldPassword` does not decrypt
 * the snapshot (verified pre-flight, before any field is re-keyed).
 */
export interface RekeyOutcome {
  /** The re-keyed snapshot, serialized back to the `backup.sealed` blob format. */
  blob: string;
  /** Secrets that could not be re-keyed (kept verbatim under the old password). */
  skipped: { slice: string; id?: string; field: string; reason: string }[];
}

export async function rekeyBackupBlob(
  blobJson: string,
  oldPassword: string,
  newPassword: string,
): Promise<RekeyOutcome> {
  const snapshot = JSON.parse(blobJson) as CodexSnapshot;
  const result = await rekeyCodex(snapshot, oldPassword, newPassword);
  return { blob: JSON.stringify(result.snapshot), skipped: result.skipped };
}

/**
 * Guard: a Mnemosyne codex backup is a RAW SNAPSHOT (`kadenaSeeds`/`ouroAccounts`
 * field names), not a wallet `exportForCloud` ENVELOPE (`kadenaWallets`/`ouronetWallets`
 * + a `version` stamp). Re-keying an envelope would silently find no secrets (they live
 * under the renamed fields) and adopt a codex still locked under the file's password —
 * so reject it up front with a clear message instead of corrupting the store.
 * Returns null when the parsed object is an acceptable snapshot, or an error string.
 */
export function rejectIfNotSnapshot(parsed: unknown): string | null {
  if (typeof parsed !== "object" || parsed === null) {
    return "not a codex backup (expected a JSON object)";
  }
  const o = parsed as Record<string, unknown>;
  if ("kadenaWallets" in o || "ouronetWallets" in o) {
    return "this looks like a wallet-export (envelope) codex; Mnemosyne Load currently accepts a Mnemosyne codex backup (raw snapshot). Envelope import is a follow-up.";
  }
  if (!("kadenaSeeds" in o) && !("schemaVersion" in o)) {
    return "not a recognizable codex snapshot (no kadenaSeeds/schemaVersion)";
  }
  return null;
}
