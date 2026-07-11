import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The server-side store for ancient-set admin configuration. Persisted to a
 * gitignored JSON file so operator config (currently just the Pythia gateway URL)
 * survives restarts. URLs only — never secrets. Every read/write is fail-safe: a
 * missing or corrupt file returns defaults rather than crashing the app, and a
 * write failure is swallowed (the value is still live in memory for the request).
 */
export interface AdminSettings {
  /** The operator-injected Pythia gateway base URL. Empty = no global connector. */
  pythiaUrl: string;
}

const DEFAULTS: AdminSettings = { pythiaUrl: "" };

/** The on-disk location of the settings file (gitignored `data/`). */
export const ADMIN_SETTINGS_PATH = join(
  process.cwd(),
  "data",
  "admin-settings.json",
);

/**
 * Read the admin settings, defaulting per field. Never throws: a missing file, a
 * malformed file, or a hand-edited file with the wrong types all collapse to
 * defaults. `filePath` is injectable for tests.
 */
export function readAdminSettings(
  filePath: string = ADMIN_SETTINGS_PATH,
): AdminSettings {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<AdminSettings>;
    return {
      pythiaUrl:
        typeof parsed.pythiaUrl === "string" ? parsed.pythiaUrl : DEFAULTS.pythiaUrl,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Persist the admin settings, creating the parent directory if needed (a first-ever
 * save must not fail on a missing `data/` dir). Never throws — a write failure
 * (read-only FS / quota) is swallowed so the request still completes.
 */
export function writeAdminSettings(
  settings: AdminSettings,
  filePath: string = ADMIN_SETTINGS_PATH,
): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf8");
  } catch {
    /* read-only FS / quota — the value is still live for the current request */
  }
}
