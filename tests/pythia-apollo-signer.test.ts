import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptStringV2 } from "@stoachain/stoa-core/crypto";
import { Apollo } from "@stoachain/stoa-core/dalos";
import { buildApolloOwnershipMessage } from "@ancientpantheon/codex/ui";

import { MnemosyneApolloSigner, createMnemosyneApolloSigner } from "../lib/pythia/apolloSigner";
import { getOrCreateCodexPassword, saveBackup } from "../lib/mnemosyneCodexStore";

/**
 * `MnemosyneApolloSigner` — the off-chain proof-of-possession seam Pythia's
 * connector-auth challenge/verify protocol needs (organs/06 §1c). Exercised
 * against a REAL sealed codex in a temp dir, mirroring
 * `tests/khronoton-key-resolver.test.ts`'s fixture-building approach exactly:
 * a machine password is minted, fixture secrets are encrypted under it with
 * `encryptStringV2` (the same envelope `smartDecrypt` reverses), and the
 * signer must decrypt precisely the requested entry and produce a signature
 * that verifies against the account's REAL Apollo public key — not just "was
 * called", but a genuine cryptographic round trip.
 *
 * Two fixture entry shapes are covered, since `lib/pythia/apolloSigner.ts`
 * mirrors `keyResolver.ts`'s multi-source lookup:
 *   - an `ouroAccounts` entry (the shape `signApolloOwnership` is directly
 *     typed for: `address`/`isSmart` already present, secret is seed words).
 *   - a `pureKeypairs` entry shaped like `lib/pythia/apolloIdentity.ts`'s
 *     `ensureConnectorApolloPair` output (`publicKey` is the raw base-49
 *     Apollo public key, NOT a `₱./Π.` address; the encrypted secret is the
 *     raw base-49 private scalar, NOT seed words) — proving the signer
 *     correctly re-derives the prefixed address and decodes the secret in
 *     `integerBase49` mode rather than misreading it as seed-word text.
 */

const OURO_WORDS = ["mnemosyne", "codex", "apollo", "ownership", "ouro", "account", "fixture", "words"];
const OURO_FULL = Apollo.generateFromSeedWords(OURO_WORDS);

const SMART_HALF = Apollo.generateFromSeedWords(["pythia", "connector", "smart", "half", "seed", "fixture"]);
const SMART_ADDRESS = Apollo.publicKeyToAddress(SMART_HALF.keyPair.publ, true);

/** `CryptographicPrimitive.verify` is optional on the interface; `Apollo`'s
 * concrete instance always implements it. Narrows that for the assertions
 * below without a non-null-assertion at every call site. */
function apolloVerify(signature: string, message: string, publicKey: string): boolean {
  if (!Apollo.verify) throw new Error("Apollo primitive has no verify() in this build.");
  return Apollo.verify(signature, message, publicKey);
}

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mnemo-pythia-apollo-signer-"));
  process.env.MNEMOSYNE_CODEX_DIR = dir;
  process.env.MNEMOSYNE_MASTER_KEY = randomBytes(32).toString("base64");

  const password = await getOrCreateCodexPassword();
  const snapshot = {
    kadenaSeeds: [],
    ouroAccounts: [
      {
        id: "ouro-1",
        publicKey: OURO_FULL.keyPair.publ,
        secret: await encryptStringV2(OURO_WORDS.join(" "), password),
        backup: await encryptStringV2(OURO_WORDS.join(" "), password),
        address: OURO_FULL.standardAddress,
        isSmart: false,
        version: "1",
        guard: null,
        stoaChainLedger: null,
      },
    ],
    pureKeypairs: [
      {
        id: randomUUID(),
        label: "pythia-connector-smart",
        publicKey: SMART_HALF.keyPair.publ,
        encryptedPrivateKey: await encryptStringV2(SMART_HALF.keyPair.priv, password),
        createdAt: new Date().toISOString(),
      },
    ],
    addressBook: [],
    watchList: [],
    uiSettings: {},
    schemaVersion: 1,
    lastUpdatedAt: null,
    lastUpdatedDevice: "main",
  };
  await saveBackup(JSON.stringify(snapshot));
});

afterAll(() => {
  delete process.env.MNEMOSYNE_CODEX_DIR;
  delete process.env.MNEMOSYNE_MASTER_KEY;
  rmSync(dir, { recursive: true, force: true });
});

describe("pythia apollo signer — sealed operator codex off-chain proof-of-possession", () => {
  it("signs a real, verifiable proof for an ouroAccounts-held Apollo account", async () => {
    const signer = new MnemosyneApolloSigner();
    const { signature } = await signer.sign({
      apolloAccount: OURO_FULL.standardAddress,
      nonce: "nonce-ouro-1",
      rp: "https://pythia.example",
    });

    const message = buildApolloOwnershipMessage(
      OURO_FULL.standardAddress,
      "nonce-ouro-1",
      "https://pythia.example",
    );
    expect(apolloVerify(signature, message, OURO_FULL.keyPair.publ)).toBe(true);
  });

  it("signs a real, verifiable proof for a pureKeypairs-held connector identity half, keyed by its ₱./Π. address", async () => {
    const signer = new MnemosyneApolloSigner();
    const { signature } = await signer.sign({
      apolloAccount: SMART_ADDRESS,
      nonce: "nonce-smart-1",
      rp: "https://pythia.example",
    });

    // The signed message must be built from the ADDRESS that was actually
    // asked to be signed for (`input.apolloAccount`, verbatim) — this is what
    // Pythia's real `/connectors/auth/*` endpoints require (162-char,
    // `₱./Π.`-prefixed), not the raw base-49 public key stored in the codex.
    const message = buildApolloOwnershipMessage(SMART_ADDRESS, "nonce-smart-1", "https://pythia.example");
    expect(apolloVerify(signature, message, SMART_HALF.keyPair.publ)).toBe(true);
  });

  it("no longer matches a pureKeypairs entry by its RAW public key — only by its derived address", async () => {
    // Regression guard for the confirmed bug: the raw base-49 public key is
    // NOT a valid `apolloAccount` on Pythia's wire protocol (it rejects
    // anything that isn't exactly a 162-char `₱./Π.`-prefixed address), so
    // the signer must not silently accept it as a match either.
    const signer = new MnemosyneApolloSigner();
    await expect(
      signer.sign({
        apolloAccount: SMART_HALF.keyPair.publ,
        nonce: "nonce-raw-pubkey",
        rp: "https://pythia.example",
      }),
    ).rejects.toThrow(/not held by the Mnemosyne operator codex/);
  });

  it("the factory produces an equivalent working signer", async () => {
    const signer = createMnemosyneApolloSigner();
    const { signature } = await signer.sign({
      apolloAccount: OURO_FULL.standardAddress,
      nonce: "nonce-factory",
      rp: "https://pythia.example",
    });
    expect(typeof signature).toBe("string");
    expect(signature.length).toBeGreaterThan(0);
  });

  it("throws a clear error when no account in the codex matches the requested apolloAccount", async () => {
    const signer = new MnemosyneApolloSigner();
    await expect(
      signer.sign({ apolloAccount: "₱.does-not-exist", nonce: "n", rp: "https://pythia.example" }),
    ).rejects.toThrow(/not held by the Mnemosyne operator codex/);
  });

  it("throws a clear error when the codex is not initialized", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "mnemo-pythia-apollo-signer-empty-"));
    const priorDir = process.env.MNEMOSYNE_CODEX_DIR;
    process.env.MNEMOSYNE_CODEX_DIR = emptyDir;
    try {
      const signer = new MnemosyneApolloSigner();
      await expect(
        signer.sign({ apolloAccount: OURO_FULL.standardAddress, nonce: "n", rp: "https://pythia.example" }),
      ).rejects.toThrow(/codex is not initialized/);
    } finally {
      process.env.MNEMOSYNE_CODEX_DIR = priorDir;
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
