import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { seal, unseal } from "./mnemosyneVault";

/**
 * File-based sealed custody of Mnemosyne's own operator Codex, modelled on the
 * hub's hub-codex-store.ts but with NO database — everything lives under a
 * gitignored `data/mnemosyne-codex/` directory.
 *
 * Two sealed blobs:
 *   - `password.sealed` — a machine-generated 32-byte codex password (base64),
 *     sealed under the master key. Handed to the ancient admin's browser on load
 *     so the codex-ui auto-unlocks with no operator password prompt.
 *   - `backup.sealed`   — the codex-ui export/import codec output, an OPAQUE JSON
 *     string. Its per-entry secrets are ALREADY encrypted under the codex
 *     password; the master-key seal is a SECOND at-rest layer over the whole
 *     blob. This module never touches @ancientpantheon/@stoachain runtime code.
 *
 * `meta.json` carries only a secret-free timestamp summary.
 */

const PASSWORD_FILE = "password.sealed";
const BACKUP_FILE = "backup.sealed";
const META_FILE = "meta.json";

interface CodexMetaFile {
  createdAt: string;
  lastModifiedAt: string;
}

/**
 * The default custody directory. Resolved per-call (not captured at module load)
 * so tests can redirect it via `MNEMOSYNE_CODEX_DIR` and the API route always
 * sees the live value.
 */
export function defaultCodexDir(): string {
  return process.env.MNEMOSYNE_CODEX_DIR || join(process.cwd(), "data", "mnemosyne-codex");
}

function passwordPath(baseDir: string): string {
  return join(baseDir, PASSWORD_FILE);
}
function backupPath(baseDir: string): string {
  return join(baseDir, BACKUP_FILE);
}
function metaPath(baseDir: string): string {
  return join(baseDir, META_FILE);
}

/** Atomic write: stage to `<file>.tmp` then rename over the target. */
function atomicWrite(path: string, contents: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, contents, "utf8");
  renameSync(tmp, path);
}

function readMeta(baseDir: string): CodexMetaFile | null {
  try {
    const parsed = JSON.parse(readFileSync(metaPath(baseDir), "utf8")) as Partial<CodexMetaFile>;
    if (typeof parsed.createdAt === "string" && typeof parsed.lastModifiedAt === "string") {
      return { createdAt: parsed.createdAt, lastModifiedAt: parsed.lastModifiedAt };
    }
    return null;
  } catch {
    return null;
  }
}

/** True once the machine password has been provisioned (codex may still be empty). */
export function isProvisioned(baseDir: string = defaultCodexDir()): boolean {
  return existsSync(passwordPath(baseDir));
}

/** True once a real backup has been saved (the codex has content). */
export function isInitialized(baseDir: string = defaultCodexDir()): boolean {
  return existsSync(backupPath(baseDir));
}

/**
 * Get-or-create the machine codex password. Mints a 32-byte random password on
 * first call, seals it under the master key, and writes `password.sealed`.
 * Idempotent — later calls unseal and return the SAME password so the codex-ui
 * can always decrypt entries it previously encrypted.
 */
export async function getOrCreateCodexPassword(baseDir: string = defaultCodexDir()): Promise<string> {
  const path = passwordPath(baseDir);
  if (existsSync(path)) {
    return unseal(readFileSync(path, "utf8"));
  }
  const password = crypto.randomBytes(32).toString("base64");
  atomicWrite(path, await seal(password));
  return password;
}

/** Load the stored backup, or null if the codex has no content yet. */
export async function loadBackup(baseDir: string = defaultCodexDir()): Promise<string | null> {
  const path = backupPath(baseDir);
  if (!existsSync(path)) return null;
  return unseal(readFileSync(path, "utf8"));
}

/**
 * Seal and persist the opaque backup blob. Provisions the password first so a
 * save can never land without one, then writes `backup.sealed` atomically and
 * refreshes `meta.json` (createdAt on first save, lastModifiedAt always).
 */
export async function saveBackup(backup: string, baseDir: string = defaultCodexDir()): Promise<void> {
  await getOrCreateCodexPassword(baseDir);
  atomicWrite(backupPath(baseDir), await seal(backup));

  const now = new Date().toISOString();
  const existing = readMeta(baseDir);
  atomicWrite(
    metaPath(baseDir),
    JSON.stringify({ createdAt: existing?.createdAt ?? now, lastModifiedAt: now }, null, 2),
  );
}

/** Delete both sealed blobs + meta. The next password get-or-create mints anew. */
export function clearCodex(baseDir: string = defaultCodexDir()): void {
  rmSync(passwordPath(baseDir), { force: true });
  rmSync(backupPath(baseDir), { force: true });
  rmSync(metaPath(baseDir), { force: true });
}

/**
 * Every master-key-sealed file in the store — the "vault rows" a master-key
 * rotation must re-seal (currently `password.sealed` + `backup.sealed`). Returned
 * generically (all `*.sealed` that exist) so a sealed artifact added later is
 * covered by the rotation re-seal automatically, per the automaton handoff.
 * `meta.json` is NOT included — it holds only secret-free timestamps.
 */
export function sealedFilePaths(baseDir: string = defaultCodexDir()): string[] {
  return [passwordPath(baseDir), backupPath(baseDir)].filter((p) => existsSync(p));
}

/** Secret-free summary for surfacing in audit / debug details. */
export function codexMeta(baseDir: string = defaultCodexDir()): {
  provisioned: boolean;
  initialized: boolean;
  createdAt: string | null;
  lastModifiedAt: string | null;
} {
  const meta = readMeta(baseDir);
  return {
    provisioned: isProvisioned(baseDir),
    initialized: isInitialized(baseDir),
    createdAt: meta?.createdAt ?? null,
    lastModifiedAt: meta?.lastModifiedAt ?? null,
  };
}
