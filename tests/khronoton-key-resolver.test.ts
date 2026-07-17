import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encryptStringV2 } from "@stoachain/stoa-core/crypto";

import {
  createMnemosyneKeyResolver,
  createMnemosyneSignerSource,
} from "../lib/khronoton/keyResolver";
import { getOrCreateCodexPassword, saveBackup } from "../lib/mnemosyneCodexStore";

/**
 * The sealed-codex KeyResolver — the seam where Khronoton signs autonomously.
 * Exercised against a REAL sealed store in a temp dir: a machine password is
 * minted, fixture secrets are encrypted under it exactly like the codex-ui does
 * (encryptStringV2), and the resolver must decrypt precisely the requested entry.
 */

const PURE_PUB = "a".repeat(64);
const PURE_SECRET = "b".repeat(64);
const OURO_PUB = "c".repeat(64);
const OURO_SECRET = "d".repeat(64);

let dir: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mnemo-khronoton-resolver-"));
  process.env.MNEMOSYNE_CODEX_DIR = dir;
  process.env.MNEMOSYNE_MASTER_KEY = randomBytes(32).toString("base64");

  const password = await getOrCreateCodexPassword();
  const snapshot = {
    kadenaSeeds: [],
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
  it("lists every codex-held public key", async () => {
    const pubs = await createMnemosyneKeyResolver().listCodexPubs();
    expect(pubs.has(PURE_PUB)).toBe(true);
    expect(pubs.has(OURO_PUB)).toBe(true);
  });

  it("decrypts a pure keypair's secret for the engine", async () => {
    const kp = await createMnemosyneKeyResolver().getKeyPairByPublicKey(PURE_PUB);
    expect(kp.publicKey).toBe(PURE_PUB);
    expect(kp.privateKey).toBe(PURE_SECRET);
  });

  it("decrypts an ouro account's secret, matching a k:-prefixed request too", async () => {
    const kp = await createMnemosyneKeyResolver().getKeyPairByPublicKey(`k:${OURO_PUB}`);
    expect(kp.publicKey).toBe(OURO_PUB);
    expect(kp.privateKey).toBe(OURO_SECRET);
  });

  it("REJECTS a public key the codex does not hold (the engine contract)", async () => {
    await expect(
      createMnemosyneKeyResolver().getKeyPairByPublicKey("f".repeat(64)),
    ).rejects.toThrow(/not held by the Mnemosyne operator codex/);
  });

  it("exposes a secret-free signer source with provenance displays", async () => {
    const descriptors = await createMnemosyneSignerSource().listSignerDescriptors();
    const byPub = new Map(descriptors.map((d) => [d.publicKey, d.display]));
    expect(byPub.get(PURE_PUB)).toBe("foreign");
    expect(byPub.get(OURO_PUB)).toBe("foreign");
    // The invariant: no descriptor ever carries key material.
    for (const d of descriptors) {
      expect(JSON.stringify(d)).not.toContain(PURE_SECRET);
      expect(JSON.stringify(d)).not.toContain(OURO_SECRET);
    }
  });
});
