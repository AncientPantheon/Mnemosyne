import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { MnemosyneConnectorSecretStore } from "../lib/pythia/connectorSecretStore";

// node:fs's ESM namespace isn't spy-able directly (its export properties
// aren't configurable), so `renameSync` is wrapped in a vi.fn() that forwards
// to the real implementation by default. Individual tests can override it
// with mockImplementationOnce to simulate a crash between the staged write
// and the publish rename, then it snaps back to the real behavior.
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual, renameSync: vi.fn(actual.renameSync) };
});
const mockedRenameSync = vi.mocked(renameSync);

// A valid 32-byte base64 key so the underlying vault seal/unseal works, mirroring
// tests/mnemosyne-codex-store.test.ts's own beforeAll idiom.
const original = process.env.MNEMOSYNE_MASTER_KEY;
beforeAll(() => {
  process.env.MNEMOSYNE_MASTER_KEY = Buffer.alloc(32, 5).toString("base64");
});
afterAll(() => {
  if (original === undefined) delete process.env.MNEMOSYNE_MASTER_KEY;
  else process.env.MNEMOSYNE_MASTER_KEY = original;
});

const dirs: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "mnemo-pythia-secret-"));
  dirs.push(dir);
  return dir;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("MnemosyneConnectorSecretStore — sealed SecretStorage for the Pythia connector", () => {
  it("returns null from load() before any save() has happened", async () => {
    const dir = tempDir();
    const store = new MnemosyneConnectorSecretStore(dir);
    expect(await store.load()).toBeNull();
  });

  it("round-trips the exact {secret, expiresAt} through save() then load()", async () => {
    const dir = tempDir();
    const store = new MnemosyneConnectorSecretStore(dir);
    const entry = { secret: "x-pythia-key-abc123", expiresAt: Date.now() + 3 * 60 * 60 * 1000 };
    await store.save(entry);
    expect(await store.load()).toEqual(entry);
  });

  it("never writes the plaintext secret to disk (the sealed file's bytes exclude it)", async () => {
    const dir = tempDir();
    const store = new MnemosyneConnectorSecretStore(dir);
    const secret = "super-secret-pythia-key-should-not-appear-in-plaintext";
    await store.save({ secret, expiresAt: Date.now() + 1000 });
    const raw = readFileSync(join(dir, "pythia-connector-secret.sealed"), "utf8");
    expect(raw).not.toContain(secret);
  });

  it("clear() removes the stored entry so a subsequent load() returns null again", async () => {
    const dir = tempDir();
    const store = new MnemosyneConnectorSecretStore(dir);
    await store.save({ secret: "some-secret", expiresAt: Date.now() + 1000 });
    expect(await store.load()).not.toBeNull();
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("clear() is a no-op when no file exists yet (does not throw)", async () => {
    const dir = tempDir();
    const store = new MnemosyneConnectorSecretStore(dir);
    await expect(store.clear()).resolves.toBeUndefined();
  });

  it("leaves the previously-saved sealed file untouched if the publish step fails mid-save", async () => {
    // Regression guard for the tmp-file+rename atomic-write pattern (mirrors
    // lib/mnemosyneCodexStore.ts's atomicWrite): save() must stage the new
    // sealed bytes to a temp file and only publish them via rename. If the
    // rename step itself fails (simulating a crash/kill between the staged
    // write and the publish), the previously-saved file must survive intact
    // rather than being overwritten in place — a bare writeFileSync straight
    // to the target would have no such guard and would already show the
    // failed save's effects (or a truncated file) on disk.
    const dir = tempDir();
    const store = new MnemosyneConnectorSecretStore(dir);
    const path = join(dir, "pythia-connector-secret.sealed");

    await store.save({ secret: "v1", expiresAt: 1000 });
    const before = readFileSync(path, "utf8");

    mockedRenameSync.mockImplementationOnce(() => {
      throw new Error("simulated crash before rename completes");
    });
    await expect(store.save({ secret: "v2", expiresAt: 2000 })).rejects.toThrow(
      "simulated crash before rename completes",
    );

    const after = readFileSync(path, "utf8");
    expect(after).toBe(before); // target still holds the last successfully-published save
  });
});
