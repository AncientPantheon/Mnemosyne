import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { smartDecrypt } from "@stoachain/stoa-core/crypto";
import { Apollo } from "@stoachain/stoa-core/dalos";
import type { CodexSnapshot } from "@ancientpantheon/codex/ouronet";

import { ensureConnectorApolloPair } from "../lib/pythia/apolloIdentity";
import { getOrCreateCodexPassword, loadBackup, saveBackup } from "../lib/mnemosyneCodexStore";

/**
 * `ensureConnectorApolloPair` mints (or finds) the dedicated Standard+Smart
 * Apollo pair the Pythia connector identity needs, inside Mnemosyne's own
 * sealed codex. Exercised against a REAL sealed store in a temp dir, mirroring
 * `tests/khronoton-key-resolver.test.ts`'s fixture pattern for the identical
 * sealed-codex read/write path.
 */

let dir: string;

function emptyFixtureSnapshot(): CodexSnapshot {
  return {
    kadenaSeeds: [],
    ouroAccounts: [],
    pureKeypairs: [],
    addressBook: [],
    watchList: [],
    uiSettings: {},
    schemaVersion: 1,
    lastUpdatedAt: null,
    lastUpdatedDevice: "main",
  } as unknown as CodexSnapshot;
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mnemo-pythia-apollo-identity-"));
  process.env.MNEMOSYNE_CODEX_DIR = dir;
  process.env.MNEMOSYNE_MASTER_KEY = randomBytes(32).toString("base64");

  await saveBackup(JSON.stringify(emptyFixtureSnapshot()));
});

afterAll(() => {
  delete process.env.MNEMOSYNE_CODEX_DIR;
  delete process.env.MNEMOSYNE_MASTER_KEY;
  rmSync(dir, { recursive: true, force: true });
});

describe("ensureConnectorApolloPair — pythia connector Apollo identity", () => {
  it("creates both halves on first call, returning two distinct public keys", async () => {
    const result = await ensureConnectorApolloPair();
    expect(typeof result.standardPublicKey).toBe("string");
    expect(result.standardPublicKey.length).toBeGreaterThan(0);
    expect(typeof result.smartPublicKey).toBe("string");
    expect(result.smartPublicKey.length).toBeGreaterThan(0);
    expect(result.standardPublicKey).not.toBe(result.smartPublicKey);
  });

  it("returns correctly-prefixed ₱./Π. addresses (162 chars) derived from each half's raw public key", async () => {
    const result = await ensureConnectorApolloPair();

    // Independently re-derived via the SAME primitive `Apollo.publicKeyToAddress`
    // the connectors' wire protocol relies on — not a hardcoded fixture, driven
    // by this call's own raw public keys.
    expect(result.standardAddress).toBe(Apollo.publicKeyToAddress(result.standardPublicKey, false));
    expect(result.smartAddress).toBe(Apollo.publicKeyToAddress(result.smartPublicKey, true));

    expect(result.standardAddress.startsWith("₱.")).toBe(true);
    expect(result.smartAddress.startsWith("Π.")).toBe(true);
    expect(result.standardAddress).toHaveLength(162);
    expect(result.smartAddress).toHaveLength(162);

    // The raw public keys and the addresses are genuinely different
    // representations, not the same string under two field names — this is
    // the exact distinction the connector-auth wire protocol depends on.
    expect(result.standardAddress).not.toBe(result.standardPublicKey);
    expect(result.smartAddress).not.toBe(result.smartPublicKey);
  });

  it("is idempotent — a second call returns the SAME two public keys, no duplicate entries", async () => {
    const first = await ensureConnectorApolloPair();
    const second = await ensureConnectorApolloPair();

    expect(second.standardPublicKey).toBe(first.standardPublicKey);
    expect(second.smartPublicKey).toBe(first.smartPublicKey);
    expect(second.standardAddress).toBe(first.standardAddress);
    expect(second.smartAddress).toBe(first.smartAddress);

    const backup = await loadBackup();
    const snapshot = JSON.parse(backup as string) as CodexSnapshot;
    const connectorEntries = snapshot.pureKeypairs.filter(
      (kp) => kp.label === "pythia-connector-standard" || kp.label === "pythia-connector-smart",
    );
    // Exactly one standard + one smart entry across both calls, never four.
    expect(connectorEntries).toHaveLength(2);
  });

  it("stores each half's private key encrypted so it round-trips via smartDecrypt with the codex password", async () => {
    const { standardPublicKey, smartPublicKey } = await ensureConnectorApolloPair();
    const password = await getOrCreateCodexPassword();
    const backup = await loadBackup();
    const snapshot = JSON.parse(backup as string) as CodexSnapshot;

    const standardEntry = snapshot.pureKeypairs.find((kp) => kp.publicKey === standardPublicKey);
    const smartEntry = snapshot.pureKeypairs.find((kp) => kp.publicKey === smartPublicKey);
    expect(standardEntry).toBeDefined();
    expect(smartEntry).toBeDefined();

    const standardPlain = await smartDecrypt(standardEntry!.encryptedPrivateKey, password);
    const smartPlain = await smartDecrypt(smartEntry!.encryptedPrivateKey, password);
    expect(standardPlain.length).toBeGreaterThan(0);
    expect(smartPlain.length).toBeGreaterThan(0);
    expect(standardPlain).not.toBe(smartPlain);

    // A wrong password must NOT decrypt it — proves this is genuinely sealed
    // via a compatible symmetric primitive, not stored as/alongside plaintext.
    await expect(smartDecrypt(standardEntry!.encryptedPrivateKey, "wrong-password")).rejects.toThrow();
  });
});
