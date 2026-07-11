import { describe, it, expect, afterEach } from "vitest";

import { seal, unseal } from "../lib/mnemosyneVault";

// Two distinct valid 32-byte master keys, base64-encoded (the format the env
// var carries). Deterministic so the "different key cannot open" assertion is
// reproducible.
const KEY_A = Buffer.alloc(32, 7).toString("base64");
const KEY_B = Buffer.alloc(32, 9).toString("base64");

const original = process.env.MNEMOSYNE_MASTER_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.MNEMOSYNE_MASTER_KEY;
  else process.env.MNEMOSYNE_MASTER_KEY = original;
});

describe("mnemosyneVault — at-rest seal/unseal under the master key", () => {
  it("round-trips a plaintext so a sealed blob unseals back to the exact input", async () => {
    process.env.MNEMOSYNE_MASTER_KEY = KEY_A;
    const secret = '{"codex":"opaque-json-export"}';
    const sealed = await seal(secret);
    // The sealed form must NOT be the plaintext (it is nonce+ciphertext, base64).
    expect(sealed).not.toContain("codex");
    expect(await unseal(sealed)).toBe(secret);
  });

  it("uses a fresh random nonce so sealing the same plaintext twice yields different blobs", async () => {
    process.env.MNEMOSYNE_MASTER_KEY = KEY_A;
    const a = await seal("same-input");
    const b = await seal("same-input");
    expect(a).not.toBe(b);
    // ...yet both still unseal to the original (nonce is prepended, not lost).
    expect(await unseal(a)).toBe("same-input");
    expect(await unseal(b)).toBe("same-input");
  });

  it("cannot unseal a blob under a DIFFERENT master key (the seal is key-bound)", async () => {
    process.env.MNEMOSYNE_MASTER_KEY = KEY_A;
    const sealed = await seal("top-secret");
    process.env.MNEMOSYNE_MASTER_KEY = KEY_B;
    await expect(unseal(sealed)).rejects.toThrow();
  });

  it("rejects a tampered blob rather than returning corrupted plaintext (auth tag catches it)", async () => {
    process.env.MNEMOSYNE_MASTER_KEY = KEY_A;
    const sealed = await seal("integrity-matters");
    const bytes = Buffer.from(sealed, "base64");
    bytes[bytes.length - 1] ^= 0xff; // flip the last ciphertext byte
    const tampered = bytes.toString("base64");
    await expect(unseal(tampered)).rejects.toThrow();
  });

  it("throws a clear error when MNEMOSYNE_MASTER_KEY is unset (a seal must never be a no-op)", async () => {
    delete process.env.MNEMOSYNE_MASTER_KEY;
    await expect(seal("x")).rejects.toThrow(/MNEMOSYNE_MASTER_KEY/);
  });

  it("throws when the key does not decode to exactly 32 bytes (guards a mis-generated key)", async () => {
    process.env.MNEMOSYNE_MASTER_KEY = Buffer.alloc(16, 1).toString("base64");
    await expect(seal("x")).rejects.toThrow(/32 bytes/);
  });
});
