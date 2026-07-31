import { randomBytes, randomUUID } from "node:crypto";

import { encryptStringV2 } from "@stoachain/stoa-core/crypto";
import { Apollo } from "@stoachain/stoa-core/dalos";
import { deriveDoubleApollo } from "@ancientpantheon/codex/ouronet";
import type { IPureKeypair } from "@ancientpantheon/codex/ouronet";

import { getOrCreateCodexPassword, saveBackup } from "../mnemosyneCodexStore";
import { loadCodexSnapshot, pureKeypairsOf } from "./codexSnapshot";

/**
 * Mints (or finds) the dedicated Standard(₱)+Smart(Π) Apollo pair Mnemosyne's
 * sealed codex holds for the Pythia connector's own identity — the protocol
 * assumes the consumer already owns both halves in its own wallet before
 * deploying them on-chain (organs/06 §1a/§1c).
 *
 * Recipe, mirroring `lib/khronoton/keyResolver.ts`'s sealed-codex read/write
 * seam (via the shared `./codexSnapshot` helper): unseal the codex backup →
 * parse the raw `CodexSnapshot` → look for the two `pureKeypairs` entries
 * already tagged by label. Idempotent: a second call finds the existing pair
 * instead of minting a new one.
 *
 * Returns BOTH representations of each half: the raw base-49 `publicKey`
 * (`"{prefixLen}.{xyBase49}"`, what the on-chain Pact calls in `onboardingChain.ts`
 * need — see that file's own signer/keypair-resolution convention) and the
 * `₱./Π.`-prefixed 162-char `address` (what Pythia's HTTP wire protocol
 * — `connectorClient.ts`, `apolloSigner.ts` — needs; its `/connectors/auth/*`
 * endpoints reject anything that isn't exactly that shape). The address is
 * derived via `Apollo.publicKeyToAddress(publicKey, isSmart)`
 * (`@stoachain/stoa-core/dalos`) rather than stored, so it is always in sync
 * with whatever public key is on record.
 *
 * If absent, fresh seed material comes from `node:crypto`'s `randomBytes`
 * (codex exports no seed generator of its own — confirmed by investigation),
 * derived via `deriveDoubleApollo`'s `"bitstring"` mode, which requires
 * EXACTLY a 2048-bit ('0'/'1') string (`APOLLO_BITS_TOTAL` in the package's
 * own derivation source) — the default split point (1024/1024) is used, no
 * `splitOverride`. Each half's private key is encrypted for storage via
 * `encryptStringV2` (`@stoachain/stoa-core/crypto`) under the SAME codex
 * password `keyResolver.ts` already decrypts every other entry with via
 * `smartDecrypt` — `encryptStringV2`/`smartDecrypt` are the package's own
 * matched encrypt/decrypt pair (confirmed via its type declarations' own
 * doc comments: "New writes always go through `encryptStringV2`"; the V2
 * envelope is exactly what `smartDecrypt` auto-detects and reverses), and is
 * the SAME primitive `tests/khronoton-key-resolver.test.ts` already uses to
 * build its fixture entries that `smartDecrypt` reads back.
 */

const STANDARD_LABEL = "pythia-connector-standard";
const SMART_LABEL = "pythia-connector-smart";

/** `deriveDoubleApollo`'s `"bitstring"` mode requires exactly this many bits. */
const APOLLO_SEED_BITS = 2048;

/** Fresh, uniformly random `'0'`/`'1'` seed material of exactly `bits` length. */
function randomBitstring(bits: number): string {
  const bytes = randomBytes(Math.ceil(bits / 8));
  return Array.from(bytes)
    .map((byte) => byte.toString(2).padStart(8, "0"))
    .join("")
    .slice(0, bits);
}

export interface ConnectorApolloPair {
  /** Raw base-49 public key (`"{prefixLen}.{xyBase49}"`) — for the on-chain
   * Pact calls in `onboardingChain.ts`, which resolve signers by this same
   * raw form (`createMnemosyneKeyResolver().getKeyPairByPublicKey`). */
  standardPublicKey: string;
  smartPublicKey: string;
  /** `₱./Π.`-prefixed 162-char address — for Pythia's HTTP wire protocol
   * (`connectorClient.ts`, `apolloSigner.ts`), which rejects anything else. */
  standardAddress: string;
  smartAddress: string;
}

export async function ensureConnectorApolloPair(): Promise<ConnectorApolloPair> {
  const snapshot = await loadCodexSnapshot(
    "pythia connector identity: the Mnemosyne operator codex is not initialized — " +
      "populate it under /admin/codex before onboarding the Pythia connector.",
  );

  const existingStandard = pureKeypairsOf(snapshot).find((kp) => kp.label === STANDARD_LABEL);
  const existingSmart = pureKeypairsOf(snapshot).find((kp) => kp.label === SMART_LABEL);
  if (existingStandard && existingSmart) {
    return {
      standardPublicKey: existingStandard.publicKey,
      smartPublicKey: existingSmart.publicKey,
      standardAddress: Apollo.publicKeyToAddress(existingStandard.publicKey, false),
      smartAddress: Apollo.publicKeyToAddress(existingSmart.publicKey, true),
    };
  }

  const codexPassword = await getOrCreateCodexPassword();
  const derivation = deriveDoubleApollo(randomBitstring(APOLLO_SEED_BITS), "bitstring");
  const now = new Date().toISOString();

  const standardEntry: IPureKeypair = {
    id: randomUUID(),
    label: STANDARD_LABEL,
    publicKey: derivation.standard.publicKey,
    encryptedPrivateKey: await encryptStringV2(derivation.standard.privateKey, codexPassword),
    createdAt: now,
  };
  const smartEntry: IPureKeypair = {
    id: randomUUID(),
    label: SMART_LABEL,
    publicKey: derivation.smart.publicKey,
    encryptedPrivateKey: await encryptStringV2(derivation.smart.privateKey, codexPassword),
    createdAt: now,
  };

  snapshot.pureKeypairs = [...pureKeypairsOf(snapshot), standardEntry, smartEntry];
  await saveBackup(JSON.stringify(snapshot));

  return {
    standardPublicKey: standardEntry.publicKey,
    smartPublicKey: smartEntry.publicKey,
    standardAddress: Apollo.publicKeyToAddress(standardEntry.publicKey, false),
    smartAddress: Apollo.publicKeyToAddress(smartEntry.publicKey, true),
  };
}
