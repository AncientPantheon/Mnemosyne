import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The server-side store for the Pythia connector-auth onboarding job's
 * non-secret status: current stage, both Apollo halves' public identifiers,
 * timing, and the last error (if any). Persisted to a gitignored JSON file so
 * the admin panel's status poll survives restarts. Deliberately its own file,
 * not folded into `AdminSettings` (`lib/adminSettings.ts`), since that object
 * is served verbatim and unauthenticated by `GET /api/config`. Non-secret
 * only — the live connector secret lives in `lib/pythia/connectorSecretStore.ts`
 * instead. Every read/write is fail-safe: a missing or corrupt file returns
 * defaults rather than crashing the app, and a write failure is swallowed.
 */
export type ConnectorStage =
  | "idle"
  | "ensuring-identity"
  | "deploying-standard"
  | "deploying-smart"
  | "linking"
  | "proving-standard"
  | "proving-smart"
  | "success"
  | "failed";

export interface ConnectorStatus {
  stage: ConnectorStage;
  standardApollo: string | null;
  smartApollo: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  lastError: string | null;
}

const DEFAULTS: ConnectorStatus = {
  stage: "idle",
  standardApollo: null,
  smartApollo: null,
  startedAt: null,
  updatedAt: null,
  lastError: null,
};

/** The on-disk location of the connector status file (gitignored `data/`). */
export const CONNECTOR_STATUS_PATH = join(
  process.cwd(),
  "data",
  "pythia-connector-status.json",
);

/**
 * Read the connector onboarding status, defaulting per field. Never throws: a
 * missing file, a malformed file, or a hand-edited file with the wrong types
 * all collapse to defaults. `filePath` is injectable for tests.
 */
export function readConnectorStatus(
  filePath: string = CONNECTOR_STATUS_PATH,
): ConnectorStatus {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ConnectorStatus>;
    return {
      stage: typeof parsed.stage === "string" ? (parsed.stage as ConnectorStage) : DEFAULTS.stage,
      standardApollo:
        typeof parsed.standardApollo === "string" ? parsed.standardApollo : DEFAULTS.standardApollo,
      smartApollo:
        typeof parsed.smartApollo === "string" ? parsed.smartApollo : DEFAULTS.smartApollo,
      startedAt:
        typeof parsed.startedAt === "string" ? parsed.startedAt : DEFAULTS.startedAt,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : DEFAULTS.updatedAt,
      lastError:
        typeof parsed.lastError === "string" ? parsed.lastError : DEFAULTS.lastError,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Persist the connector onboarding status, creating the parent directory if
 * needed (a first-ever save must not fail on a missing `data/` dir). Never
 * throws — a write failure (read-only FS / quota) is swallowed so the request
 * still completes.
 */
export function writeConnectorStatus(
  status: ConnectorStatus,
  filePath: string = CONNECTOR_STATUS_PATH,
): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(status, null, 2), "utf8");
  } catch {
    /* read-only FS / quota — the value is still live for the current request */
  }
}
