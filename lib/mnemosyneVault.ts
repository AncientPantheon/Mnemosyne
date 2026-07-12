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
 *
 * The `*Sync` cores exist so master-key ROTATION (lib/mnemosyneRotation.ts) can
 * run its plan+apply as ONE synchronous critical section after a single
 * `await ensureSodiumReady()` — on this single-process app that means no other
 * request can interleave an unseal between the file re-seal and the in-memory key
 * flip (which would otherwise read a new-key file under the old env key).
 */

let sodiumReady: Promise<void> | null = null;

/** Await libsodium's WASM init once. Must be called before any `*Sync` core. */
export async function ensureSodiumReady(): Promise<void> {
  if (!sodiumReady) sodiumReady = sodium.ready;
  await sodiumReady;
}

/** Parse a base64 master key into exactly 32 bytes, or throw a clear error. */
export function parseMasterKey(base64: string | undefined): Uint8Array {
  if (!base64) {
    throw new Error(
      'MNEMOSYNE_MASTER_KEY must be set (32 bytes, base64-encoded). Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  const key = Buffer.from(base64, "base64");
  if (key.length !== 32) {
    throw new Error(`master key must decode to exactly 32 bytes (got ${key.length})`);
  }
  return new Uint8Array(key);
}

function readMasterKey(): Uint8Array {
  return parseMasterKey(process.env.MNEMOSYNE_MASTER_KEY);
}

/** Seal with an EXPLICIT key; assumes sodium is ready. Returns base64(nonce‖ct). */
export function sealSync(key: Uint8Array, plaintext: string): string {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key);
  const combined = new Uint8Array(nonce.length + ciphertext.length);
  combined.set(nonce, 0);
  combined.set(ciphertext, nonce.length);
  return Buffer.from(combined).toString("base64");
}

/** Unseal with an EXPLICIT key; assumes sodium is ready. Throws on wrong key/tamper. */
export function unsealSync(key: Uint8Array, sealed: string): string {
  const combined = new Uint8Array(Buffer.from(sealed, "base64"));
  const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
  const plaintext = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
  return sodium.to_string(plaintext);
}

/** Seal a plaintext under the env master key, returning `base64(nonce || ciphertext)`. */
export async function seal(plaintext: string): Promise<string> {
  await ensureSodiumReady();
  return sealSync(readMasterKey(), plaintext);
}

/** Unseal a `base64(nonce || ciphertext)` blob with the env master key. Throws on wrong key/tamper. */
export async function unseal(sealed: string): Promise<string> {
  await ensureSodiumReady();
  return unsealSync(readMasterKey(), sealed);
}
