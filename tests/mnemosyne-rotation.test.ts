import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  getOrCreateCodexPassword,
  loadBackup,
  saveBackup,
} from "../lib/mnemosyneCodexStore";
import { rotateMnemosyneMasterKey } from "../lib/mnemosyneRotation";

// Handoff §6: prove the codex round-trips through a master-key rotation. This is
// the difference between "we think rotation is safe" and "rotation is proven not
// to brick the codex".

const OLD_KEY = Buffer.alloc(32, 1).toString("base64");
const NEW_KEY = Buffer.alloc(32, 2).toString("base64");

let dir: string;
let envPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mnemo-rot-"));
  envPath = join(dir, ".env.local");
  writeFileSync(envPath, `OIDC_CLIENT_ID=keep-me\nMNEMOSYNE_MASTER_KEY=${OLD_KEY}\n`);
  process.env.MNEMOSYNE_CODEX_DIR = join(dir, "codex");
  process.env.MNEMOSYNE_MASTER_KEY = OLD_KEY;
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.MNEMOSYNE_CODEX_DIR;
  delete process.env.MNEMOSYNE_MASTER_KEY;
});

function sealedFiles(): { password: string; backup: string } {
  const cdir = process.env.MNEMOSYNE_CODEX_DIR!;
  return {
    password: readFileSync(join(cdir, "password.sealed"), "utf8"),
    backup: readFileSync(join(cdir, "backup.sealed"), "utf8"),
  };
}

describe("rotateMnemosyneMasterKey — the codex survives a master-key rotation", () => {
  it("re-seals the codex under the new key so password + backup still decrypt, unchanged", async () => {
    // Provision a codex under the OLD key.
    const passwordBefore = await getOrCreateCodexPassword();
    const backupPayload = '{"snapshot":"opaque-inner-ciphertext"}';
    await saveBackup(backupPayload);
    const ciphertextBefore = sealedFiles();

    // Rotate → re-seal under the NEW key.
    const res = await rotateMnemosyneMasterKey(NEW_KEY, { envPath });
    expect(res.rotatedFiles).toBe(2); // password.sealed + backup.sealed

    // The in-process key flipped, and .env.local carries the new key (other vars kept).
    expect(process.env.MNEMOSYNE_MASTER_KEY).toBe(NEW_KEY);
    const env = readFileSync(envPath, "utf8");
    expect(env).toContain(`MNEMOSYNE_MASTER_KEY=${NEW_KEY}`);
    expect(env).toContain("OIDC_CLIENT_ID=keep-me");
    expect(env).not.toContain(OLD_KEY);

    // The secrets are UNCHANGED but now decrypt under the new key.
    expect(await getOrCreateCodexPassword()).toBe(passwordBefore);
    expect(await loadBackup()).toBe(backupPayload);

    // The stored ciphertext ACTUALLY changed (a genuine re-seal, not a no-op).
    const ciphertextAfter = sealedFiles();
    expect(ciphertextAfter.password).not.toBe(ciphertextBefore.password);
    expect(ciphertextAfter.backup).not.toBe(ciphertextBefore.backup);
  });

  it("rejects a new key equal to the current one (rotation would be a no-op)", async () => {
    await getOrCreateCodexPassword();
    await expect(rotateMnemosyneMasterKey(OLD_KEY, { envPath })).rejects.toThrow(/equals the current/);
  });

  it("rejects a new key that is not 32 bytes", async () => {
    await getOrCreateCodexPassword();
    await expect(
      rotateMnemosyneMasterKey(Buffer.alloc(16, 9).toString("base64"), { envPath }),
    ).rejects.toThrow(/32 bytes/);
  });

  it("ABORTS before any write when a sealed file can't be decrypted with the old key (no partial rotation)", async () => {
    await getOrCreateCodexPassword();
    await saveBackup('{"snapshot":"x"}');
    const before = sealedFiles();

    // Corrupt one sealed file so unseal-with-old-key throws during PLAN.
    const cdir = process.env.MNEMOSYNE_CODEX_DIR!;
    writeFileSync(join(cdir, "backup.sealed"), "not-a-valid-sealed-box");

    await expect(rotateMnemosyneMasterKey(NEW_KEY, { envPath })).rejects.toThrow();

    // Nothing was rewritten under the new key, and the env key stayed OLD.
    expect(process.env.MNEMOSYNE_MASTER_KEY).toBe(OLD_KEY);
    expect(readFileSync(envPath, "utf8")).toContain(`MNEMOSYNE_MASTER_KEY=${OLD_KEY}`);
    // The healthy file was NOT re-sealed (abort happened before any APPLY write).
    expect(sealedFiles().password).toBe(before.password);
  });
});
