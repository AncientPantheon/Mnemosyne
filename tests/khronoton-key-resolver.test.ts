import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptStringV2 } from "@stoachain/stoa-core/crypto";
import {
  kadenaGenKeypairFromSeed,
  kadenaGenMnemonic,
  kadenaMnemonicToSeed,
} from "@stoachain/kadena-stoic-legacy/hd-wallet";
import {
  kadenaGenKeypair as kadenaGenChainweaverKeypair,
  kadenaGenMnemonic as kadenaGenChainweaverMnemonic,
  kadenaMnemonicToRootKeypair,
} from "@stoachain/kadena-stoic-legacy/hd-wallet/chainweaver";
import { CodexKeyMissingError } from "@ancientpantheon/codex/ouronet";

import {
  createMnemosyneKeyResolver,
  createMnemosyneSignerSource,
} from "../lib/khronoton/keyResolver";
import { getOrCreateCodexPassword, saveBackup } from "../lib/mnemosyneCodexStore";

/**
 * The sealed-codex KeyResolver — the seam where Khronoton signs autonomously.
 * As of the headless-resolver delegation (Topic 2) all Kadena key DERIVATION is
 * delegated to Codex's own `createHeadlessKadenaResolver`; this file only owns the
 * ouro-account fallback (which Codex's resolver does not read) and the Kadena-only
 * pubkey filter. Exercised against a REAL sealed store in a temp dir: a machine
 * password is minted, fixture secrets are encrypted under it exactly like the
 * codex-ui does (encryptStringV2), and — for the seed path — a REAL koala mnemonic
 * is derived so the delegate's wrong-key guard sees a self-consistent pubkey.
 */

// Pure keypair + ouro account are resolved WITHOUT derivation (pure → direct decrypt
// inside Codex; ouro → this file's fallback decrypt), so fabricated pub↔secret pairs
// resolve correctly for them.
const PURE_PUB = "a".repeat(64);
const PURE_SECRET = "b".repeat(64);
const OURO_PUB = "c".repeat(64);
const OURO_SECRET = "d".repeat(64);
// A real Apollo-format public key (`<len>.<xy>`) — NOT 64-hex. Must be filtered out
// of the Kadena signer set / listCodexPubs by publicKey shape, regardless of source.
const APOLLO_FORMAT_PUBKEY =
  "9G.17Kd3BJuvMaocH5g6v5GMdKa6vejnH23Lqmotlpeas8Aluiqzmsbdwoo4jJJlw9e0xtGce2vcyfwKsc5xk267";

let dir: string;
// A REAL koala seed account — derived (not fabricated) so the delegate re-derives an
// identical pubkey and its wrong-key guard passes. The recorded pubkey is derived with
// a transient password (koala pubkeys are password-independent), matching how Pythia's
// own keyResolver test builds its seed fixture.
let SEED_PUB: string;
// A REAL chainweaver (12-word, BIP32-Ed25519 WASM) seed account — the EXACT case the
// old koala-only hand-roll refused to sign ("derived a different key … refusing to
// sign"). Derived through the chainweaver scheme so the delegate reproduces the same
// pubkey; the whole point of the delegation is that this now resolves.
let CHAINWEAVER_PUB: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mnemo-khronoton-resolver-"));
  process.env.MNEMOSYNE_CODEX_DIR = dir;
  process.env.MNEMOSYNE_MASTER_KEY = randomBytes(32).toString("base64");

  const password = await getOrCreateCodexPassword();

  const mnemonic = kadenaGenMnemonic();
  const encSeed = await kadenaMnemonicToSeed("record-pw", mnemonic);
  const [recordedPub] = await kadenaGenKeypairFromSeed("record-pw", encSeed, 0);
  SEED_PUB = recordedPub;

  // Chainweaver seed: derive the recorded pubkey the CHAINWEAVER way (root keypair →
  // account 0), exactly how Codex records it. A transient record password is fine —
  // the pubkey is password-independent — matching Pythia's own keyResolver fixture.
  const cwMnemonic = kadenaGenChainweaverMnemonic();
  const cwRoot = await kadenaMnemonicToRootKeypair("record-pw", cwMnemonic);
  const cwRecordedPub = (await kadenaGenChainweaverKeypair("record-pw", cwRoot, 0)).publicKey;
  CHAINWEAVER_PUB = cwRecordedPub;

  const snapshot = {
    kadenaSeeds: [
      {
        id: "seed-koala",
        name: "Operator",
        seedType: "koala",
        secret: await encryptStringV2(mnemonic, password),
        main: recordedPub,
        accounts: [{ index: 0, publicKey: recordedPub, derivationPath: "m'/44'/626'/0'" }],
      },
      {
        id: "seed-chainweaver",
        name: "Operator (chainweaver)",
        seedType: "chainweaver",
        secret: await encryptStringV2(cwMnemonic, password),
        main: cwRecordedPub,
        accounts: [{ index: 0, publicKey: cwRecordedPub, derivationPath: "m'/44'/626'/0'" }],
      },
    ],
    ouroAccounts: [
      {
        id: "ouro-1",
        publicKey: OURO_PUB,
        secret: await encryptStringV2(OURO_SECRET, password),
        backup: await encryptStringV2(OURO_SECRET, password),
        address: `k:${OURO_PUB}`,
      },
    ],
    pureKeypairs: [
      {
        id: "pure-1",
        publicKey: PURE_PUB,
        encryptedPrivateKey: await encryptStringV2(PURE_SECRET, password),
        createdAt: new Date().toISOString(),
      },
      // An Apollo-curve pure keypair — its `<len>.<xy>` publicKey must never enter the
      // Kadena signer set (Apollo signing has its own seam).
      {
        id: "pure-apollo",
        publicKey: APOLLO_FORMAT_PUBKEY,
        encryptedPrivateKey: await encryptStringV2(randomBytes(32).toString("hex"), password),
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

describe("khronoton key resolver — sealed operator codex signing seam", () => {
  it("lists every Kadena codex-held public key, excluding Apollo-format ones", async () => {
    const pubs = await createMnemosyneKeyResolver().listCodexPubs();
    expect(pubs.has(PURE_PUB)).toBe(true);
    expect(pubs.has(OURO_PUB)).toBe(true);
    expect(pubs.has(SEED_PUB)).toBe(true);
    expect(pubs.has(CHAINWEAVER_PUB)).toBe(true);
    // The Kadena-only filter: an Apollo `<len>.<xy>` key never leaks into the signer set.
    expect(pubs.has(APOLLO_FORMAT_PUBKEY)).toBe(false);
  });

  it("resolves a pure keypair's secret via the headless delegate", async () => {
    const kp = await createMnemosyneKeyResolver().getKeyPairByPublicKey(PURE_PUB);
    expect(kp.publicKey).toBe(PURE_PUB);
    expect(kp.privateKey).toBe(PURE_SECRET);
  });

  it("resolves an ouro account's secret via the fallback, matching a k:-prefixed request too", async () => {
    const kp = await createMnemosyneKeyResolver().getKeyPairByPublicKey(`k:${OURO_PUB}`);
    expect(kp.publicKey).toBe(OURO_PUB);
    expect(kp.privateKey).toBe(OURO_SECRET);
    expect(kp.seedType).toBe("koala");
  });

  it("re-derives a koala seed account and signs (delegated, not the deleted hand-roll)", async () => {
    const kp = await createMnemosyneKeyResolver().getKeyPairByPublicKey(SEED_PUB);
    expect(kp.publicKey).toBe(SEED_PUB);
    expect(kp.privateKey).toMatch(/^[0-9a-fA-F]{64}$/); // koala → a plain hex Ed25519 secret
  });

  it("re-derives a CHAINWEAVER seed account and signs — the exact case the old koala-only hand-roll REFUSED", async () => {
    // The whole reason this topic exists: the pre-delegation resolver ran EVERY seed
    // through the koala SLIP-10 lane, so a chainweaver seed derived a different key,
    // tripped the wrong-key guard, and could not sign. Delegation routes it through
    // Codex's chainweaver lane, and it resolves.
    const kp = await createMnemosyneKeyResolver().getKeyPairByPublicKey(CHAINWEAVER_PUB);
    expect(kp.publicKey).toBe(CHAINWEAVER_PUB);
    expect(kp.seedType).toBe("chainweaver");
    // Chainweaver signs via the WASM lane: the encrypted extended key + its password,
    // NOT a plain hex privateKey (that's the koala lane).
    expect(kp.encryptedSecretKey).toBeTruthy();
    expect(kp.password).toBeTruthy();
  });

  it("REJECTS a public key the codex does not hold with CodexKeyMissingError (the engine contract)", async () => {
    await expect(
      createMnemosyneKeyResolver().getKeyPairByPublicKey("f".repeat(64)),
    ).rejects.toBeInstanceOf(CodexKeyMissingError);
  });

  it("exposes a secret-free signer source with provenance displays, filtering out Apollo keys", async () => {
    const descriptors = await createMnemosyneSignerSource().listSignerDescriptors();
    const byPub = new Map(descriptors.map((d) => [d.publicKey, d.display]));
    expect(byPub.get(PURE_PUB)).toBe("foreign");
    expect(byPub.get(OURO_PUB)).toBe("foreign");
    expect(byPub.get(SEED_PUB)).toBe("derived");
    // The Apollo-format pure keypair must never appear in the Kadena signer set.
    expect(byPub.has(APOLLO_FORMAT_PUBKEY)).toBe(false);
    // The invariant: no descriptor ever carries key material.
    for (const d of descriptors) {
      expect(JSON.stringify(d)).not.toContain(PURE_SECRET);
      expect(JSON.stringify(d)).not.toContain(OURO_SECRET);
    }
  });
});
