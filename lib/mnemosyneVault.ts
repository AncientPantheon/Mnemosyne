import sodium from "libsodium-wrappers";

/**
 * At-rest sealing for Mnemosyne's own operator custody, ported from the hub's
 * lib/vault.ts. Unlike the hub (which seals INTO a SQLite row) Mnemosyne has no
 * database: `seal` returns the sealed STRING and the caller persists it to a
 * file. Uses libsodium `crypto_secretbox_easy` (XSalsa20-Poly1305) with a random
 * 24-byte nonce PREPENDED to the ciphertext; the whole nonce+ciphertext is
 * base64-encoded. The 32-byte master key is read per-operation from
 * `MNEMOSYNE_MASTER_KEY` — never cached in a module-level variable, and the
 * plaintext never outlives the call.
 */

let sodiumReady: Promise<void> | null = null;
async function ready(): Promise<void> {
  if (!sodiumReady) sodiumReady = sodium.ready;
  await sodiumReady;
}

function readMasterKey(): Uint8Array {
  const raw = process.env.MNEMOSYNE_MASTER_KEY;
  if (!raw) {
    throw new Error(
      'MNEMOSYNE_MASTER_KEY must be set (32 bytes, base64-encoded). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`MNEMOSYNE_MASTER_KEY must decode to exactly 32 bytes (got ${key.length})`);
  }
  return new Uint8Array(key);
}

/** Seal a plaintext, returning `base64(nonce || ciphertext)`. */
export async function seal(plaintext: string): Promise<string> {
  await ready();
  const key = readMasterKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key);

  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return Buffer.from(combined).toString("base64");
}

/** Unseal a `base64(nonce || ciphertext)` blob. Throws on a wrong key or tamper. */
export async function unseal(sealed: string): Promise<string> {
  await ready();
  const key = readMasterKey();
  const combined = new Uint8Array(Buffer.from(sealed, "base64"));
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  return sodium.to_string(plaintext);
}
