import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

import type { SecretStorage } from "@ancientpantheon/pythia-client";

import { atomicWriteFileSync } from "../envFile";
import { defaultCodexDir } from "../mnemosyneCodexStore";
import { seal, unseal } from "../mnemosyneVault";

/**
 * Sealed, on-disk `SecretStorage` for the Pythia connector's live secret
 * (`x-pythia-key` + its expiry), implementing the SDK's own `SecretStorage`
 * interface. Modelled on `lib/mnemosyneCodexStore.ts`'s sealed-file pattern:
 * one JSON-stringified `{secret, expiresAt}` blob, sealed/unsealed via
 * `lib/mnemosyneVault.ts` under `MNEMOSYNE_MASTER_KEY`, living alongside
 * `password.sealed`/`backup.sealed` in the same codex directory so it rotates
 * under the same master-key lifecycle. `load()` never throws — a missing
 * file, an unseal failure (wrong/rotated key), or a JSON-parse failure all
 * simply resolve to `null`, the same defensive posture every other store in
 * this codebase takes. `save()` writes atomically via `lib/envFile.ts`'s
 * `atomicWriteFileSync` (stage to a sibling temp file, `fsync` it, then
 * `rename` over the target, then `chmod 0o600`) so a crash/kill mid-write can
 * never leave a truncated/corrupt `.sealed` file, and the file stays
 * restricted to the owner even if the codex directory's own permissions are
 * looser.
 */

const SECRET_FILE = "pythia-connector-secret.sealed";

interface StoredSecret {
  secret: string;
  expiresAt: number;
}

export class MnemosyneConnectorSecretStore implements SecretStorage {
  private readonly path: string;

  constructor(baseDir: string = defaultCodexDir()) {
    this.path = join(baseDir, SECRET_FILE);
  }

  async load(): Promise<StoredSecret | null> {
    if (!existsSync(this.path)) return null;
    try {
      const unsealed = await unseal(readFileSync(this.path, "utf8"));
      const parsed = JSON.parse(unsealed) as Partial<StoredSecret>;
      if (typeof parsed.secret === "string" && typeof parsed.expiresAt === "number") {
        return { secret: parsed.secret, expiresAt: parsed.expiresAt };
      }
      return null;
    } catch {
      return null;
    }
  }

  async save(entry: StoredSecret): Promise<void> {
    const sealed = await seal(JSON.stringify(entry));
    // atomicWriteFileSync assumes the parent directory already exists (it
    // only stages a sibling temp file inside it); this is the first write
    // for a fresh codex dir, so ensure it exists first.
    mkdirSync(dirname(this.path), { recursive: true });
    atomicWriteFileSync(this.path, sealed);
  }

  async clear(): Promise<void> {
    rmSync(this.path, { force: true });
  }
}
