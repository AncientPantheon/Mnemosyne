import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getOrCreateCodexPassword,
  loadBackup,
  saveBackup,
  isProvisioned,
  isInitialized,
  clearCodex,
  codexMeta,
} from "../lib/mnemosyneCodexStore";

// A valid 32-byte base64 key so the underlying vault seal/unseal works.
beforeAll(() => {
  process.env.MNEMOSYNE_MASTER_KEY = Buffer.alloc(32, 3).toString("base64");
});

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mnemo-codex-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("mnemosyneCodexStore — file-based sealed custody of the operator codex", () => {
  it("provisions once and returns the SAME machine password on every call (auto-unlock stability)", async () => {
    const dir = tempDir();
    expect(isProvisioned(dir)).toBe(false);
    const first = await getOrCreateCodexPassword(dir);
    // A real 32-byte base64 password, not an empty string.
    expect(first.length).toBeGreaterThan(0);
    expect(isProvisioned(dir)).toBe(true);
    const second = await getOrCreateCodexPassword(dir);
    expect(second).toBe(first); // idempotent — same password decrypts prior entries
  });

  it("round-trips an opaque backup blob through disk (sealed then unsealed unchanged)", async () => {
    const dir = tempDir();
    const backup = '{"schemaVersion":3,"entries":["opaque-ciphertext"]}';
    await saveBackup(backup, dir);
    expect(await loadBackup(dir)).toBe(backup);
  });

  it("returns null from loadBackup before anything has been saved (empty-codex signal)", async () => {
    const dir = tempDir();
    await getOrCreateCodexPassword(dir); // provisioned but no content yet
    expect(await loadBackup(dir)).toBeNull();
  });

  it("provisions the password before writing so a save can never land without one", async () => {
    const dir = tempDir();
    // saveBackup called on a pristine dir — it must provision the password itself.
    await saveBackup("first-backup", dir);
    expect(isProvisioned(dir)).toBe(true);
    // ...and the password is stable afterwards.
    const pw = await getOrCreateCodexPassword(dir);
    expect(pw.length).toBeGreaterThan(0);
  });

  it("tracks isInitialized separately from isProvisioned (password ≠ content)", async () => {
    const dir = tempDir();
    expect(isInitialized(dir)).toBe(false);
    await getOrCreateCodexPassword(dir);
    expect(isInitialized(dir)).toBe(false); // provisioned, still no content
    await saveBackup("payload", dir);
    expect(isInitialized(dir)).toBe(true);
  });

  it("overwrites a prior backup with the latest one (last write wins)", async () => {
    const dir = tempDir();
    await saveBackup("v1", dir);
    await saveBackup("v2", dir);
    expect(await loadBackup(dir)).toBe("v2");
  });

  it("clears both sealed files so the codex reads unprovisioned and empty afterwards", async () => {
    const dir = tempDir();
    await saveBackup("payload", dir);
    expect(isProvisioned(dir)).toBe(true);
    expect(isInitialized(dir)).toBe(true);
    clearCodex(dir);
    expect(isProvisioned(dir)).toBe(false);
    expect(isInitialized(dir)).toBe(false);
    expect(await loadBackup(dir)).toBeNull();
  });

  it("mints a fresh password after clearCodex (old custody is gone)", async () => {
    const dir = tempDir();
    const before = await getOrCreateCodexPassword(dir);
    clearCodex(dir);
    const after = await getOrCreateCodexPassword(dir);
    expect(after).not.toBe(before);
  });

  it("codexMeta returns a secret-free summary (no password, no backup plaintext leaks)", async () => {
    const dir = tempDir();
    await saveBackup('{"secret":"must-not-leak"}', dir);
    const meta = codexMeta(dir);
    expect(meta.provisioned).toBe(true);
    expect(meta.initialized).toBe(true);
    expect(typeof meta.createdAt).toBe("string");
    expect(typeof meta.lastModifiedAt).toBe("string");
    const serialized = JSON.stringify(meta);
    expect(serialized).not.toContain("must-not-leak");
    expect(serialized).not.toContain("password");
  });

  it("writes the backup atomically leaving no stray .tmp file behind", async () => {
    const dir = tempDir();
    await saveBackup("payload", dir);
    expect(existsSync(join(dir, "backup.sealed.tmp"))).toBe(false);
    expect(existsSync(join(dir, "backup.sealed"))).toBe(true);
  });
});
