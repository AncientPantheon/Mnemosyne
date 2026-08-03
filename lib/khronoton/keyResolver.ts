import { smartDecrypt } from "@stoachain/stoa-core/crypto";
import type {
  CodexSnapshot,
  IOuroAccount,
  IPureKeypair,
  IStoaChainSeed,
} from "@ancientpantheon/codex/ouronet";
import { createHeadlessKadenaResolver, CodexKeyMissingError } from "@ancientpantheon/codex/ouronet";
import type { IKadenaKeypair, KeyResolver } from "@ancientpantheon/khronoton-core/server";
import { descriptorSourceToDisplay } from "@ancientpantheon/khronoton-core/handlers";
import type { SignerSource } from "@ancientpantheon/khronoton-core/handlers";

import { getOrCreateCodexPassword, loadBackup } from "../mnemosyneCodexStore";

/**
 * The Khronoton `KeyResolver` backed by Mnemosyne's SEALED OPERATOR CODEX — the
 * seam where the automaton signs with no human in the loop (handoff 05).
 *
 * DELEGATION (headless-resolver delegation, Topic 2 of `pythia-verifier-alignment`):
 * all Kadena key DERIVATION is delegated to Codex's own canonical, seedType-complete
 * headless resolver (`createHeadlessKadenaResolver`, `@ancientpantheon/codex/ouronet`).
 * Mnemosyne reimplements NO derivation. This ends the class of bug where each
 * consumer hand-rolled a partial resolver that re-derived every HD-wallet seed with
 * the koala path only and refused to sign a chainweaver/eckowallet operator seed. The
 * snapshot + machine password are re-read FRESH per call (fire-time) inside Codex's
 * resolver, so a codex edit is picked up next fire and plaintext key material never
 * outlives the call.
 *
 * Two Mnemosyne-side concerns remain, NEITHER of which is derivation:
 *   1. The Kadena-only public-key filter ({@link isKadenaPublicKey}): the operator
 *      codex is mixed-curve, so Apollo-curve accounts (whose `publicKey` is a
 *      `<len>.<xy>` string, not 64-hex) must never enter the Kadena signer list —
 *      Apollo signing has its own seam.
 *   2. A thin OURO-account fallback: Codex's headless resolver reads only
 *      `{ kadenaSeeds, pureKeypairs }`, so a Kadena-format `ouroAccount` (if the
 *      codex holds one) is resolved here by a DIRECT DECRYPT of its stored secret —
 *      no derivation, so it cannot carry the seedType bug. Reached only when Codex
 *      reports the key genuinely not-held (a `CodexKeyMissingError`).
 */

/** Strip an account-address style `k:` prefix so pub comparisons are plain hex. */
function bareKey(pub: string): string {
  return pub.startsWith("k:") ? pub.slice(2) : pub;
}

/** A Kadena ed25519 public key is EXACTLY 32 bytes → 64 hex chars (bare, `k:`-prefix
 *  stripped). Nothing else is a valid Kadena signing key. */
const KADENA_PUBLIC_KEY = /^[0-9a-fA-F]{64}$/;

/** An ouro secret is a raw koala hex key — a minimal shape sanity check on the ONE
 *  non-delegated path (the delegated paths let Codex own all secret validation). */
const HEX_SECRET = /^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$/;

/** Discriminate a Kadena signer on the KEY FORMAT ITSELF (64-hex), not on Codex's
 *  optional `originCurve` metadata (which real Apollo accounts don't reliably set) —
 *  so an Apollo `<len>.<xy>` key can never enter the Kadena signer list regardless of
 *  metadata. */
function isKadenaPublicKey(publicKey: string): boolean {
  return KADENA_PUBLIC_KEY.test(bareKey(publicKey));
}

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

/** The sealed-codex-backed resolver the engine (tick loop + handlers) injects.
 *  Delegates all derivation to Codex; adds only the Kadena-only filter and the
 *  non-derivation ouro fallback. */
export function createMnemosyneKeyResolver(): KeyResolver {
  // Codex owns the ONE canonical, seedType-complete derivation (koala / chainweaver /
  // eckowallet / pure), re-reading snapshot + password fresh per call via these thunks
  // (Mnemosyne's async loadSnapshot/getOrCreateCodexPassword bind directly — the thunks
  // accept `T | Promise<T>`).
  const delegate = createHeadlessKadenaResolver({
    loadSnapshot: () => loadSnapshot(),
    getPassword: () => getOrCreateCodexPassword(),
  });

  /** Codex covers seeds + pures, NOT ouroAccounts — a Kadena-format ouro account is
   *  resolved here by a direct secret decrypt (no derivation). Returns null if no such
   *  ouro account holds the wanted key. */
  async function ouroFallback(wanted: string): Promise<IKadenaKeypair | null> {
    const [snap, codexPassword] = [await loadSnapshot(), await getOrCreateCodexPassword()];
    const acc = ouros(snap).find(
      (a) => a.publicKey && isKadenaPublicKey(a.publicKey) && bareKey(a.publicKey) === wanted,
    );
    if (!acc) return null;
    const plaintext = await smartDecrypt(acc.secret, codexPassword);
    if (!HEX_SECRET.test(plaintext)) {
      throw new Error(
        "khronoton key resolver: decrypted ouro-account secret is not a raw hex key — " +
          "the codex entry shape has drifted; refusing to sign.",
      );
    }
    return { publicKey: wanted, privateKey: plaintext, seedType: "koala" };
  }

  return {
    async listCodexPubs(): Promise<Set<string>> {
      // Read the snapshot FIRST, sequentially — never inside a `Promise.all` with
      // `delegate.listCodexPubs()`. `loadSnapshot` rejects when the codex is
      // uninitialized; sequencing it before the delegate call keeps the two awaits from
      // orphaning each other's promise (the unhandled-rejection hazard Pythia documents).
      const snap = await loadSnapshot();
      const delegated = await delegate.listCodexPubs(); // Codex's seed + pure pubs
      const set = new Set<string>();
      for (const p of delegated) set.add(bareKey(p));
      for (const acc of ouros(snap))
        if (acc.publicKey && isKadenaPublicKey(acc.publicKey)) set.add(bareKey(acc.publicKey));
      // Belt-and-braces: only Kadena-format pubkeys ever leave (Apollo never leaks).
      return new Set([...set].filter(isKadenaPublicKey));
    },

    async getKeyPairByPublicKey(publicKey: string): Promise<IKadenaKeypair> {
      const wanted = bareKey(publicKey);
      try {
        const kp = await delegate.getKeyPairByPublicKey(wanted);
        // Map Codex's `@stoachain/stoa-core/signing` IKadenaKeypair onto Khronoton's:
        //  - `seedType` is OPTIONAL in Codex's type, REQUIRED in Khronoton's — coerce a
        //    missing one to "koala" (the plain-hex nacl signing lane).
        //  - `encryptedSecretKey` is `unknown` in Codex's type (a branded @kadena
        //    EncryptedString) and `string` in Khronoton's; at runtime it IS a string, so
        //    the narrow cast is sound.
        return {
          publicKey: kp.publicKey,
          privateKey: kp.privateKey,
          seedType: kp.seedType ?? "koala",
          encryptedSecretKey: kp.encryptedSecretKey as string | undefined,
          password: kp.password,
        };
      } catch (err) {
        // ONLY a genuine "not held by any seed/pure" (Codex's CodexKeyMissingError)
        // falls through to the ouro fallback. Any other error — a real decrypt/
        // derivation failure, or Codex's own wrong-key refusal guard — propagates
        // unchanged (never silently masked by the fallback).
        if (!(err instanceof CodexKeyMissingError)) throw err;
        const ouro = await ouroFallback(wanted);
        if (ouro) return ouro;
        throw err;
      }
    },
  };
}

/**
 * The Builder's signer-picker source, with REAL provenance (unlike the package's
 * `defaultSignerSource`, which cannot know it): seed-derived accounts display as
 * `derived`, pure keypairs and ouro accounts as `foreign` — the same
 * source→display mapping the Hub uses (`descriptorSourceToDisplay`). Secret-free
 * by contract: only public keys leave this function, and only Kadena-format ones —
 * an Apollo `<len>.<xy>` key never enters the Kadena signer set.
 */
export function createMnemosyneSignerSource(): SignerSource {
  return {
    async listSignerDescriptors() {
      const snap = await loadSnapshot();
      const seen = new Set<string>();
      const descriptors: { publicKey: string; display: "derived" | "foreign" }[] = [];
      const push = (publicKey: string, source: string): void => {
        const pub = bareKey(publicKey);
        if (!isKadenaPublicKey(pub)) return;
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
