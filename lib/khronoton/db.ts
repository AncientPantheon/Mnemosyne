import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { installSchema } from "@ancientpantheon/khronoton-core/server";
import type { Database } from "@ancientpantheon/khronoton-core/server";
import type BetterSqlite3Ctor from "better-sqlite3";

/**
 * The Khronoton engine's SQLite home. Server-only (better-sqlite3 is a native
 * module — see `serverExternalPackages` in next.config.ts).
 *
 * The directory sits under `data/` beside `mnemosyne-codex/`, so on the live box
 * it lives on the mounted `/app/data` volume and the cronoton store survives
 * blue-green redeploys exactly like the sealed codex does. `MNEMOSYNE_KHRONOTON_DIR`
 * redirects it for tests (mirrors `MNEMOSYNE_CODEX_DIR`).
 */
export function khronotonDir(): string {
  return process.env.MNEMOSYNE_KHRONOTON_DIR || join(process.cwd(), "data", "khronoton");
}

/**
 * `globalThis` holder so dev HMR / route-and-instrumentation double-imports share
 * ONE database handle (better-sqlite3 is synchronous; a second handle would work
 * but the singleton keeps WAL + memory use sane and makes `installSchema` run once).
 */
const g = globalThis as unknown as { __mnemosyneKhronotonDb?: Database };

/**
 * Open (once) and return the Khronoton database with the engine schema installed.
 * `installSchema` is idempotent (`IF NOT EXISTS`), so calling this on every boot
 * is safe. WAL mode keeps the admin reads from blocking the tick's writes.
 */
export function getKhronotonDb(): Database {
  if (g.__mnemosyneKhronotonDb) return g.__mnemosyneKhronotonDb;
  const dir = khronotonDir();
  mkdirSync(dir, { recursive: true });
  // Load the NATIVE module through a real runtime require so no bundler ever
  // statically analyzes it (webpack bundles the instrumentation entry even past
  // serverExternalPackages, and better-sqlite3's `bindings` loader cannot be
  // bundled). createRequire keeps the call opaque to webpack; Node resolves it
  // from node_modules at runtime, and output tracing still ships the package.
  const requireNative = createRequire(import.meta.url);
  const BetterSqlite3 = requireNative("better-sqlite3") as typeof BetterSqlite3Ctor;
  const db = new BetterSqlite3(join(dir, "khronoton.db"));
  db.pragma("journal_mode = WAL");
  // better-sqlite3 satisfies the engine's structural Database seam (exec/prepare).
  const seam = db as unknown as Database;
  installSchema(seam);
  g.__mnemosyneKhronotonDb = seam;
  return seam;
}
