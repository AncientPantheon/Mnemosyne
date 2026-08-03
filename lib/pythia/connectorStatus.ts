import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The server-side store for the pasted Pythia dual-link-key. The connector is
 * driven by an operator-pasted composite key — the two Apollo account addresses
 * joined by `|` (2×APOLLO_ACCOUNT_LEN+1 = 325 chars). These are PUBLIC account
 * identifiers, NOT secret material, so they live in a plain gitignored JSON file
 * (the ephemeral `x-pythia-key` secret is held in memory by `DualLinkConnector`
 * and never persisted here). Deliberately its own file, not folded into
 * `AdminSettings` (`lib/adminSettings.ts`), since that object is served verbatim
 * and unauthenticated by `GET /api/config`. Every read/write is fail-safe: a
 * missing or corrupt file returns defaults rather than crashing the app, and a
 * write failure is swallowed. The live `not-linked | pending | active` status is
 * derived at read time from `DualLinkConnector.status()`, not stored here.
 */
export interface ConnectorState {
  /** The pasted composite key (both public Apollo account addresses joined by `|`). */
  dualLinkKey: string | null;
  /** The Standard half's Apollo account address (split from the key, for display). */
  standardApollo: string | null;
  /** The Smart half's Apollo account address (split from the key, for display). */
  smartApollo: string | null;
  /** ISO timestamp of when the key was stored. */
  linkedAt: string | null;
}

const DEFAULTS: ConnectorState = {
  dualLinkKey: null,
  standardApollo: null,
  smartApollo: null,
  linkedAt: null,
};

/** The on-disk location of the connector state file (gitignored `data/`). */
export const CONNECTOR_STATUS_PATH = join(
  process.cwd(),
  "data",
  "pythia-connector-status.json",
);

/**
 * Read the persisted connector state, defaulting per field. Never throws: a
 * missing file, a malformed file, or a hand-edited file with the wrong types all
 * collapse to the all-null (not-linked) default. `filePath` is injectable for
 * tests.
 */
export function readConnectorState(
  filePath: string = CONNECTOR_STATUS_PATH,
): ConnectorState {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ConnectorState>;
    return {
      dualLinkKey:
        typeof parsed.dualLinkKey === "string" ? parsed.dualLinkKey : DEFAULTS.dualLinkKey,
      standardApollo:
        typeof parsed.standardApollo === "string" ? parsed.standardApollo : DEFAULTS.standardApollo,
      smartApollo:
        typeof parsed.smartApollo === "string" ? parsed.smartApollo : DEFAULTS.smartApollo,
      linkedAt:
        typeof parsed.linkedAt === "string" ? parsed.linkedAt : DEFAULTS.linkedAt,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Persist the connector state, creating the parent directory if needed (a
 * first-ever save must not fail on a missing `data/` dir). Never throws — a write
 * failure (read-only FS / quota) is swallowed so the request still completes.
 */
export function writeConnectorState(
  state: ConnectorState,
  filePath: string = CONNECTOR_STATUS_PATH,
): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  } catch {
    /* read-only FS / quota — the value is still live for the current request */
  }
}

/**
 * Remove the stored key, returning the store to the all-null (not-linked)
 * default. Used when the operator un-links the connector. Never throws — a
 * missing file or a write failure is swallowed.
 */
export function clearConnectorState(
  filePath: string = CONNECTOR_STATUS_PATH,
): void {
  try {
    rmSync(filePath, { force: true });
  } catch {
    /* already gone / read-only FS — the store is (or stays) not-linked */
  }
}
