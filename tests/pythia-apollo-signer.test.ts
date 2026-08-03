import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptStringV2 } from "@stoachain/stoa-core/crypto";
import { Apollo } from "@stoachain/stoa-core/dalos";
import { buildApolloOwnershipMessage } from "@ancientpantheon/codex/ouronet";

import { createMnemosyneApolloSigner } from "../lib/pythia/apolloSigner";
import { getOrCreateCodexPassword, saveBackup } from "../lib/mnemosyneCodexStore";

/**
 * `createMnemosyneApolloSigner` — the connector-auth off-chain
 * proof-of-possession seam (Pythia's `/connectors/auth/*` challenge/verify
 * protocol). Post-rework it is a THIN delegate to Codex's own
 * `autoSignApolloChallenge` (`@ancientpantheon/codex/ouronet`), mirroring
 * Pythia's `createCodexApolloSigner`: no hand-rolled `@stoachain` derivation.
 *
 * The whole guarantee is exercised against a REAL sealed codex in a temp dir
 * (same fixture idiom as `tests/khronoton-key-resolver.test.ts`): a machine
 * password is minted, the fixture Apollo secret is encrypted under it with
 * `encryptStringV2` (the envelope `autoSignApolloChallenge`'s `smartDecrypt`
 * reverses), and the signer must run the REAL delegate to produce a signature
 * that verifies against the account's REAL Apollo public key for the canonical
 * ownership message — a genuine cryptographic round trip, not a mocked call.
 *
 * `autoSignApolloChallenge` locates the account in `snapshot.ouroAccounts` by
 * `.address`, so both a Standard (`₱.`) and a Smart (`Π.`) `ouroAccounts`
 * entry are covered — the two halves a dual-link pair signs for.
 */

const STANDARD_WORDS = ["mnemosyne", "codex", "apollo", "ownership", "standard", "half", "fixture", "words"];
const STANDARD_FULL = Apollo.generateFromSeedWords(STANDARD_WORDS);
const STANDARD_ADDRESS = STANDARD_FULL.standardAddress;

const SMART_WORDS = ["pythia", "connector", "smart", "half", "seed", "fixture", "words", "here"];
const SMART_FULL = Apollo.generateFromSeedWords(SMART_WORDS);
const SMART_ADDRESS = SMART_FULL.smartAddress;

const RP = "https://pythia.example";

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
        id: "ouro-standard",
        publicKey: STANDARD_FULL.keyPair.publ,
        secret: await encryptStringV2(STANDARD_WORDS.join(" "), password),
        backup: await encryptStringV2(STANDARD_WORDS.join(" "), password),
        address: STANDARD_ADDRESS,
        isSmart: false,
        version: "1",
        guard: null,
        stoaChainLedger: null,
      },
      {
        id: "ouro-smart",
        publicKey: SMART_FULL.keyPair.publ,
        secret: await encryptStringV2(SMART_WORDS.join(" "), password),
        backup: await encryptStringV2(SMART_WORDS.join(" "), password),
        address: SMART_ADDRESS,
        isSmart: true,
        version: "1",
        guard: null,
        stoaChainLedger: null,
      },
    ],
    pureKeypairs: [],
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

describe("pythia apollo signer — Codex autoSignApolloChallenge delegate", () => {
  it("signs a real, verifiable proof for a Standard (₱.) Apollo account held in the codex", async () => {
    const signer = createMnemosyneApolloSigner(STANDARD_ADDRESS);
    const { signature } = await signer.sign({
      apolloAccount: STANDARD_ADDRESS,
      nonce: "nonce-standard",
      rp: RP,
    });

    const message = buildApolloOwnershipMessage(STANDARD_ADDRESS, "nonce-standard", RP);
    expect(apolloVerify(signature, message, STANDARD_FULL.keyPair.publ)).toBe(true);
  });

  it("signs a real, verifiable proof for a Smart (Π.) Apollo account, using the smart-half public key", async () => {
    const signer = createMnemosyneApolloSigner(SMART_ADDRESS);
    const { signature } = await signer.sign({
      apolloAccount: SMART_ADDRESS,
      nonce: "nonce-smart",
      rp: RP,
    });

    const message = buildApolloOwnershipMessage(SMART_ADDRESS, "nonce-smart", RP);
    expect(apolloVerify(signature, message, SMART_FULL.keyPair.publ)).toBe(true);
  });

  it("is scoped to its factory account — refuses to sign for a different apolloAccount", async () => {
    // The connector builds one signer per half (`createMnemosyneApolloSigner(halves.standardApollo)`
    // etc.); a signer must never mint a proof for an account it wasn't scoped to,
    // even if that other account is also held by the codex.
    const signer = createMnemosyneApolloSigner(STANDARD_ADDRESS);
    await expect(
      signer.sign({ apolloAccount: SMART_ADDRESS, nonce: "n", rp: RP }),
    ).rejects.toThrow(/scoped to/);
  });

  it("propagates a clear error when the scoped account is not held by the codex", async () => {
    // `autoSignApolloChallenge` throws a named error (never a silent no-op) when
    // the account isn't in the snapshot — the delegate must surface it.
    const signer = createMnemosyneApolloSigner("₱.does-not-exist");
    await expect(
      signer.sign({ apolloAccount: "₱.does-not-exist", nonce: "n", rp: RP }),
    ).rejects.toThrow(/isn't in this Codex snapshot|does-not-exist/);
  });

  it("throws a clear error when the operator codex is not initialized", async () => {
    const emptyDir = mkdtempSync(join(tmpdir(), "mnemo-pythia-apollo-signer-empty-"));
    const priorDir = process.env.MNEMOSYNE_CODEX_DIR;
    process.env.MNEMOSYNE_CODEX_DIR = emptyDir;
    try {
      const signer = createMnemosyneApolloSigner(STANDARD_ADDRESS);
      await expect(
        signer.sign({ apolloAccount: STANDARD_ADDRESS, nonce: "n", rp: RP }),
      ).rejects.toThrow(/not initialized/);
    } finally {
      process.env.MNEMOSYNE_CODEX_DIR = priorDir;
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });
});
