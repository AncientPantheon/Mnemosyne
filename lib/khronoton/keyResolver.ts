import { randomBytes } from "node:crypto";

import { smartDecrypt } from "@stoachain/stoa-core/crypto";
import {
  kadenaDecrypt,
  kadenaGenKeypairFromSeed,
  kadenaMnemonicToSeed,
} from "@stoachain/kadena-stoic-legacy/hd-wallet";
import type {
  CodexSnapshot,
  IOuroAccount,
  IPureKeypair,
  IStoaChainSeed,
} from "@ancientpantheon/codex/ouronet";
import type { IKadenaKeypair, KeyResolver } from "@ancientpantheon/khronoton-core/server";
import { descriptorSourceToDisplay } from "@ancientpantheon/khronoton-core/handlers";
import type { SignerSource } from "@ancientpantheon/khronoton-core/handlers";

import { getOrCreateCodexPassword, loadBackup } from "../mnemosyneCodexStore";

/**
 * The Khronoton `KeyResolver` backed by Mnemosyne's SEALED OPERATOR CODEX — the
 * seam where the automaton signs with no human in the loop (handoff 05).
 *
 * Recipe per call: unseal the codex backup (master key) → parse the raw
 * `CodexSnapshot` → unseal the machine codex password → `smartDecrypt` exactly
 * the one entry that owns the requested public key. The snapshot is re-read on
 * EVERY call (fire-time frequency, not hot-path) so a codex edit in the admin UI
 * is picked up by the next fire with no cache invalidation, and plaintext key
 * material never outlives the call.
 *
 * Key slices, in lookup order:
 *  - `pureKeypairs[]`  — `encryptedPrivateKey` decrypts straight to the hex secret.
 *  - `ouroAccounts[]`  — `secret` decrypts to the account's hex secret.
 *  - `kadenaSeeds[]`   — `secret` decrypts to the mnemonic; the account keypair is
 *    re-derived at the account's index (SLIP10). Chainweaver/eckowallet seeds are
 *    returned on the native encrypted path (`encryptedSecretKey` + password → the
 *    signer's kadena-WASM lane); koala seeds decrypt to a plaintext hex secret
 *    (the signer's nacl lane). A derived public key that does not match the
 *    requested one throws instead of signing with the wrong key.
 *
 * The engine contract: `getKeyPairByPublicKey` REJECTS for a pub the codex does
 * not own; the executor treats that as a structured fire failure (never a crash).
 */

/** Strip an account-address style `k:` prefix so pub comparisons are plain hex. */
function bareKey(pub: string): string {
  return pub.startsWith("k:") ? pub.slice(2) : pub;
}

const HEX_SECRET = /^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$/;

async function loadSnapshot(): Promise<CodexSnapshot> {
  const backup = await loadBackup();
  if (backup === null) {
    throw new Error(
      "khronoton key resolver: the Mnemosyne operator codex is not initialized — " +
        "populate it under /admin/codex before scheduling signed transactions.",
    );
  }
  return JSON.parse(backup) as CodexSnapshot;
}

function pures(snap: CodexSnapshot): IPureKeypair[] {
  return Array.isArray(snap.pureKeypairs) ? snap.pureKeypairs : [];
}
function ouros(snap: CodexSnapshot): IOuroAccount[] {
  return Array.isArray(snap.ouroAccounts) ? snap.ouroAccounts : [];
}
function seeds(snap: CodexSnapshot): IStoaChainSeed[] {
  return Array.isArray(snap.kadenaSeeds) ? snap.kadenaSeeds : [];
}

/** Decrypted ouro/pure secrets must be a raw hex key — anything else is a shape drift. */
function assertHexSecret(plaintext: string, origin: string): string {
  if (HEX_SECRET.test(plaintext)) return plaintext;
  throw new Error(
    `khronoton key resolver: decrypted ${origin} secret is not a raw hex key — ` +
      "the codex entry shape has drifted; refusing to sign.",
  );
}

/**
 * Re-derive a seed account's keypair at its recorded index and hand it to the
 * signer on the lane native to the seed type. The derived public key MUST equal
 * the requested one — a mismatch (foreign derivation scheme, index drift) throws.
 */
async function fromSeedAccount(
  seed: IStoaChainSeed,
  accountIndex: number,
  wantedPub: string,
  codexPassword: string,
): Promise<IKadenaKeypair> {
  const mnemonic = await smartDecrypt(seed.secret, codexPassword);
  // Transient password for the in-memory encrypted-seed handoff; never persisted.
  const tempPassword = randomBytes(32).toString("base64");
  const encSeed = await kadenaMnemonicToSeed(tempPassword, mnemonic);
  const [derivedPub, encSecret] = await kadenaGenKeypairFromSeed(
    tempPassword,
    encSeed,
    accountIndex,
  );
  if (bareKey(derivedPub) !== wantedPub) {
    throw new Error(
      `khronoton key resolver: seed "${seed.name ?? seed.id}" derived a different key at ` +
        `index ${accountIndex} than the codex recorded — refusing to sign.`,
    );
  }
  if (seed.seedType === "chainweaver" || seed.seedType === "eckowallet") {
    // Native encrypted lane: universalSignTransaction routes encryptedSecretKey +
    // password through the kadena WASM signer for these seed types.
    return {
      publicKey: wantedPub,
      privateKey: "",
      seedType: seed.seedType,
      encryptedSecretKey: encSecret,
      password: tempPassword,
    };
  }
  // Koala (stoa-native) lane signs via nacl and needs the plaintext hex secret.
  const raw = await kadenaDecrypt(tempPassword, encSecret);
  return {
    publicKey: wantedPub,
    privateKey: Buffer.from(raw).toString("hex"),
    seedType: seed.seedType,
  };
}

/** Build the sealed-codex-backed resolver the engine (tick loop + handlers) injects. */
export function createMnemosyneKeyResolver(): KeyResolver {
  return {
    async listCodexPubs(): Promise<Set<string>> {
      const snap = await loadSnapshot();
      const set = new Set<string>();
      for (const kp of pures(snap)) set.add(bareKey(kp.publicKey));
      for (const acc of ouros(snap)) if (acc.publicKey) set.add(bareKey(acc.publicKey));
      for (const seed of seeds(snap))
        for (const acc of seed.accounts ?? []) set.add(bareKey(acc.publicKey));
      return set;
    },

    async getKeyPairByPublicKey(publicKey: string): Promise<IKadenaKeypair> {
      const wanted = bareKey(publicKey);
      const [snap, codexPassword] = await Promise.all([
        loadSnapshot(),
        getOrCreateCodexPassword(),
      ]);

      const pure = pures(snap).find((kp) => bareKey(kp.publicKey) === wanted);
      if (pure) {
        const plaintext = await smartDecrypt(pure.encryptedPrivateKey, codexPassword);
        return {
          publicKey: wanted,
          privateKey: assertHexSecret(plaintext, "pure-keypair"),
          seedType: "koala",
        };
      }

      const ouro = ouros(snap).find(
        (acc) => acc.publicKey && bareKey(acc.publicKey) === wanted,
      );
      if (ouro) {
        const plaintext = await smartDecrypt(ouro.secret, codexPassword);
        return {
          publicKey: wanted,
          privateKey: assertHexSecret(plaintext, "ouro-account"),
          seedType: "koala",
        };
      }

      for (const seed of seeds(snap)) {
        const account = (seed.accounts ?? []).find((a) => bareKey(a.publicKey) === wanted);
        if (account) return fromSeedAccount(seed, account.index, wanted, codexPassword);
      }

      throw new Error(
        `khronoton key resolver: public key ${wanted} is not held by the Mnemosyne ` +
          "operator codex.",
      );
    },
  };
}

/**
 * The Builder's signer-picker source, with REAL provenance (unlike the package's
 * `defaultSignerSource`, which cannot know it): seed-derived accounts display as
 * `derived`, pure keypairs and ouro accounts as `foreign` — the same
 * source→display mapping the Hub uses (`descriptorSourceToDisplay`). Secret-free
 * by contract: only public keys leave this function.
 */
export function createMnemosyneSignerSource(): SignerSource {
  return {
    async listSignerDescriptors() {
      const snap = await loadSnapshot();
      const seen = new Set<string>();
      const descriptors: { publicKey: string; display: "derived" | "foreign" }[] = [];
      const push = (publicKey: string, source: string): void => {
        const pub = bareKey(publicKey);
        if (seen.has(pub)) return;
        seen.add(pub);
        descriptors.push({ publicKey: pub, display: descriptorSourceToDisplay(source) });
      };
      for (const seed of seeds(snap))
        for (const acc of seed.accounts ?? []) push(acc.publicKey, "seed");
      for (const kp of pures(snap)) push(kp.publicKey, "pure");
      for (const acc of ouros(snap)) if (acc.publicKey) push(acc.publicKey, "ouro");
      return descriptors;
    },
  };
}
