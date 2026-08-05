import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The server-side store for ancient-set admin configuration. Persisted to a
 * gitignored JSON file so operator config (currently just the Pythia gateway URL)
 * survives restarts. URLs only — never secrets. Every read/write is fail-safe: a
 * missing or corrupt file returns defaults rather than crashing the app, and a
 * write failure is swallowed (the value is still live in memory for the request).
 */
/** Transport mode: `pythia` = all chain traffic through Pythia (default, metered);
 *  `direct-node` = the admin-gated break-glass path straight to a Stoa node
 *  (UNMETERED). See `HANDOFF-mnemosyne-network-fallback.md`. */
export type TransportFallback = "pythia" | "direct-node";

/** The default direct-node target (embedded StoaChain node), used the instant an
 *  ancient flips the fallback on. A URL, never a secret. */
export const DEFAULT_FALLBACK_NODE_URL = "https://node2.stoachain.com";

export interface AdminSettings {
  /** The operator-injected Pythia gateway base URL. Empty = no global connector. */
  pythiaUrl: string;
  /** Break-glass transport toggle. `pythia` (default) routes all chain traffic
   *  through Pythia; `direct-node` bypasses her (UNMETERED, admin-gated). */
  transportFallback: TransportFallback;
  /** The direct-node base URL used while `transportFallback === "direct-node"`. */
  nodeUrl: string;
}

const DEFAULTS: AdminSettings = {
  pythiaUrl: "",
  transportFallback: "pythia",
  nodeUrl: DEFAULT_FALLBACK_NODE_URL,
};

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
      transportFallback:
        parsed.transportFallback === "direct-node" ? "direct-node" : DEFAULTS.transportFallback,
      nodeUrl:
        typeof parsed.nodeUrl === "string" && parsed.nodeUrl.trim().length > 0
          ? parsed.nodeUrl
          : DEFAULTS.nodeUrl,
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
