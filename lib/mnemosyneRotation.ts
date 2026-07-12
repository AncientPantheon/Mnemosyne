import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ensureSodiumReady,
  parseMasterKey,
  sealSync,
  unsealSync,
} from "./mnemosyneVault";
import { defaultCodexDir, sealedFilePaths } from "./mnemosyneCodexStore";
import { atomicWriteFileSync, upsertEnvVar } from "./envFile";

/**
 * Master-key rotation for Mnemosyne's file-based operator codex, per automaton
 * handoff 02 (§4–5). Rotation is a GENERIC RE-SEAL of the whole vault (every
 * `*.sealed` file), NOT a key swap — a raw swap would orphan the old ciphertext
 * and brick the codex. Ordered so a mid-run failure is recoverable:
 *
 *   1. Validate: new key is 32 bytes and different from the current one.
 *   2. PLAN (read-only): unseal EVERY sealed file with the OLD key. If any fails,
 *      abort before writing anything.
 *   3. APPLY: re-seal each file under the NEW key + write atomically. Keep the
 *      originals in memory for rollback.
 *   4. Persist the new key to `.env.local` (atomic) — AFTER the re-seal.
 *   5. Flip the in-process key LAST.
 *   Rollback: on any failure after step 3 starts, restore the original files.
 *
 * The plan+apply+persist+flip run as ONE synchronous critical section (after a
 * single `await ensureSodiumReady()`), so on this single-process app no concurrent
 * request can unseal a half-rotated file under the wrong key.
 */

export interface RotationResult {
  /** How many sealed vault files were re-sealed under the new key. */
  rotatedFiles: number;
}

/** The `.env.local` the app persists the master key to (parent dir in prod). */
export function envFilePath(): string {
  return process.env.MNEMOSYNE_ENV_FILE || join(process.cwd(), ".env.local");
}

export async function rotateMnemosyneMasterKey(
  newKeyBase64: string,
  opts: { baseDir?: string; envPath?: string } = {},
): Promise<RotationResult> {
  const baseDir = opts.baseDir ?? defaultCodexDir();
  const envPath = opts.envPath ?? envFilePath();

  // 1. Validate (throws before touching anything).
  const currentB64 = process.env.MNEMOSYNE_MASTER_KEY;
  const oldKey = parseMasterKey(currentB64); // throws if the current key is unset/bad
  const newKey = parseMasterKey(newKeyBase64); // throws if the new key isn't 32 bytes
  if (Buffer.compare(Buffer.from(oldKey), Buffer.from(newKey)) === 0) {
    throw new Error("the new master key equals the current one — rotation is a no-op");
  }

  await ensureSodiumReady();

  // ── synchronous critical section (no await below → no event-loop interleave) ──

  // 2. PLAN — unseal every sealed file with the OLD key. Abort on ANY failure
  //    BEFORE writing a single byte, so a foreign/corrupt row can never leave the
  //    store half-rotated.
  const files = sealedFilePaths(baseDir);
  const plan: { path: string; original: string; resealed: string }[] = [];
  for (const path of files) {
    const original = readFileSync(path, "utf8");
    const plaintext = unsealSync(oldKey, original); // throws → whole rotation aborts
    const resealed = sealSync(newKey, plaintext);
    plan.push({ path, original, resealed });
  }

  // 3. APPLY — re-seal each file atomically. Track written files for rollback.
  const written: { path: string; original: string }[] = [];
  try {
    for (const { path, original, resealed } of plan) {
      atomicWriteFileSync(path, resealed);
      written.push({ path, original });
    }
    // 4. Persist the new key AFTER the re-seal succeeds (atomic env upsert).
    upsertEnvVar(envPath, "MNEMOSYNE_MASTER_KEY", newKeyBase64);
    // 5. Flip the in-process key LAST so this process uses the new key immediately.
    process.env.MNEMOSYNE_MASTER_KEY = newKeyBase64;
    return { rotatedFiles: plan.length };
  } catch (err) {
    // Rollback any re-sealed files to their originals. The env key was only
    // written on the success path, so a failure here leaves the OLD key on disk +
    // the OLD ciphertext restored → nothing orphaned.
    for (const w of written) {
      try {
        atomicWriteFileSync(w.path, w.original);
      } catch {
        /* best-effort restore; the throw below still surfaces the real cause */
      }
    }
    throw err;
  }
}
