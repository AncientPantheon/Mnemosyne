import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The deploy spool — the container ↔ host-deployer handoff directory.
 *
 * The running Mnemosyne container CANNOT rebuild itself (it would terminate the very
 * process doing the rebuild) and MUST NOT hold Docker/nginx power (least privilege).
 * So a live "Deploy" drops a request file here; a privileged host-side deployer
 * (see `deploy/host/`) watches this directory, does the blue-green rebuild+swap, and
 * streams progress back into `<id>.log`/`<id>.status` — which the container tails
 * over SSE. Because the spool lives on the HOST volume (mounted into the container),
 * the log survives the container swap and the NEW container can resume the tail.
 *
 * Location: `MNEMOSYNE_DEPLOY_DIR` if set, else `<dataDir>/deploy`, where `<dataDir>`
 * is the parent of `MNEMOSYNE_CODEX_DIR` (so it sits beside the sealed codex on the
 * same persistent volume), falling back to `<cwd>/data/deploy` in dev.
 */
export function deploySpoolDir(): string {
  const explicit = process.env.MNEMOSYNE_DEPLOY_DIR;
  if (explicit && explicit.length > 0) return explicit;
  const codexDir = process.env.MNEMOSYNE_CODEX_DIR;
  const dataDir = codexDir ? dirname(codexDir) : join(process.cwd(), "data");
  return join(dataDir, "deploy");
}

/** Create the spool dir (idempotent) and return it. */
export function ensureSpoolDir(): string {
  const dir = deploySpoolDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A deploy id is a uuid; validate before using it in a path (traversal guard). */
export function isValidDeployId(id: string): boolean {
  return /^[a-f0-9-]{8,64}$/i.test(id);
}

export const deployLogPath = (id: string): string =>
  join(deploySpoolDir(), `${id}.log`);
export const deployStatusPath = (id: string): string =>
  join(deploySpoolDir(), `${id}.status`);
export const deployRequestPath = (id: string): string =>
  join(deploySpoolDir(), `${id}.request.json`);

/** The lifecycle of a single deploy, written one-word into `<id>.status`. */
export type DeployStatus = "queued" | "running" | "success" | "failed";

/** True once the deploy has reached a terminal state (the SSE tail may close). */
export function isTerminalStatus(s: string): s is "success" | "failed" {
  return s === "success" || s === "failed";
}

/**
 * The deploy currently in flight, as reported by `…/deploy/status` (`active`).
 * `startedAt` is the deploy's REAL start — the log file's birth time — so a browser
 * that opens the panel mid-deploy shows the true elapsed time, not time-since-mount.
 */
export interface ActiveDeploy {
  id: string;
  status: DeployStatus;
  startedAt: string;
}

/**
 * When the deploy behind these spool files actually started, in epoch ms. The log's
 * birth time is the truth; some filesystems don't populate `birthtime` (it comes back
 * as the epoch), so fall back to its mtime, then to the status file, then to now —
 * a missing/unreadable file must degrade, never throw, or the panel loses its readout.
 */
function startedAtMs(...candidates: string[]): number {
  for (const path of candidates) {
    try {
      const st = statSync(path);
      if (st.birthtimeMs > 0) return st.birthtimeMs;
      if (st.mtimeMs > 0) return st.mtimeMs;
    } catch {
      // Not there (yet) — try the next candidate.
    }
  }
  return Date.now();
}

/**
 * The newest deploy in the spool that has NOT reached a terminal state, or `null`
 * when the box is idle (no spool dir, no deploys, or every deploy finished).
 *
 * This is the `active` field of the status endpoint: it is what makes a running
 * deploy observable by *anyone* — an operator who opened the panel after someone
 * else (or an agent dropping a spool request) triggered it can still attach to the
 * stream and see the true elapsed time. Never throws: a missing spool directory is
 * the ordinary state of a freshly-provisioned box.
 */
export function latestDeploy(): ActiveDeploy | null {
  const dir = deploySpoolDir();
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  let newest: ActiveDeploy | null = null;
  let newestMs = -1;

  for (const entry of entries) {
    if (!entry.endsWith(".status")) continue;
    const statusPath = join(dir, entry);
    let status: string;
    try {
      status = readFileSync(statusPath, "utf8").trim();
    } catch {
      continue;
    }
    if (isTerminalStatus(status)) continue;

    const id = entry.slice(0, -".status".length);
    const startedMs = startedAtMs(deployLogPath(id), statusPath);
    if (startedMs <= newestMs) continue;
    newestMs = startedMs;
    newest = {
      id,
      // Non-terminal by the check above; the deployer only writes the four words.
      status: status as DeployStatus,
      startedAt: new Date(startedMs).toISOString(),
    };
  }

  return newest;
}
