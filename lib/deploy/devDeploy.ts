import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

import { KHRONOTON_PACKAGE } from "../codexVersion";
import { CODEX_PACKAGE } from "../updateCodex";
import { deployLogPath, deployStatusPath, ensureSpoolDir } from "./spool";

/**
 * The dev-mode "Deploy": on localhost there is no container to swap, so a deploy is
 * just re-pulling the constructors at `@latest` and letting the operator reload. We
 * run it here (in-process) and stream npm's output into the same `<id>.log`/`<id>.
 * status` files the host deployer writes on live — so the SSE terminal renders both
 * identically. Fire-and-forget: the POST returns the id immediately and this keeps
 * appending to the log until npm exits.
 *
 * Both wired constructors are pulled: Codex (the aggregate) and Khronoton (the engine
 * package). Pulling Khronoton at `@latest` keeps the installed engine current even
 * before its autonomous-signing seams are switched on (that wire-in is Pythia-gated).
 */
const PACKAGES = [`${CODEX_PACKAGE}@latest`, `${KHRONOTON_PACKAGE}@latest`];

function append(id: string, line: string): void {
  appendFileSync(deployLogPath(id), line.endsWith("\n") ? line : `${line}\n`);
}

/**
 * Heartbeat interval (ms). Pantheonic §3 (automaton/05): while a deploy runs, the
 * deployer MUST emit a line on a fixed ~6s cadence for the WHOLE run, so the panel's
 * motion is caused by the deploy being alive rather than being decorative. Dev mode
 * writes the same contract as the host deployer, so the client's stall watchdog
 * (>20s, ≥3× this interval) and progress display work identically on localhost.
 */
const HEARTBEAT_MS = 6_000;

/** `8m18s` — the host deployer's `printf '%dm%02ds'` format, matched exactly. */
function formatElapsed(sinceMs: number): string {
  const total = Math.floor((Date.now() - sinceMs) / 1000);
  return `${Math.floor(total / 60)}m${String(total % 60).padStart(2, "0")}s`;
}

/** Start a dev deploy for `id`. Never throws — failures land in the log + status. */
export function startDevDeploy(id: string): void {
  ensureSpoolDir();
  writeFileSync(deployStatusPath(id), "running");
  const command = `npm install ${PACKAGES.join(" ")} --no-audit --no-fund`;
  append(id, `$ ${command}`);
  append(id, "");

  const startedAt = Date.now();
  // Started before the spawn so even a spawn that hangs still shows motion; stopped on
  // EVERY exit path below (spawn throw, child error, close) — the equivalent of the
  // host deployer's `trap stop_heartbeat EXIT`. Idempotent.
  let beat: ReturnType<typeof setInterval> | null = setInterval(() => {
    append(id, `  · still working · elapsed ${formatElapsed(startedAt)}`);
  }, HEARTBEAT_MS);
  const stopHeartbeat = (): void => {
    if (beat !== null) {
      clearInterval(beat);
      beat = null;
    }
  };

  let child;
  try {
    child = spawn(
      "npm",
      ["install", ...PACKAGES, "--no-audit", "--no-fund"],
      { cwd: process.cwd(), shell: process.platform === "win32", env: process.env },
    );
  } catch (err) {
    stopHeartbeat();
    append(id, `spawn failed: ${err instanceof Error ? err.message : String(err)}`);
    writeFileSync(deployStatusPath(id), "failed");
    return;
  }

  child.stdout?.on("data", (b: Buffer) => append(id, b.toString()));
  child.stderr?.on("data", (b: Buffer) => append(id, b.toString()));
  child.on("error", (err) => {
    stopHeartbeat();
    append(id, `error: ${err.message}`);
    writeFileSync(deployStatusPath(id), "failed");
  });
  child.on("close", (code) => {
    stopHeartbeat();
    append(id, "");
    if (code === 0) {
      // Success states the TOTAL elapsed (§3), same as the host deployer.
      append(
        id,
        `✓ Constructors pulled in ${formatElapsed(startedAt)}. Reload the page to pick up the new build.`,
      );
      writeFileSync(deployStatusPath(id), "success");
    } else {
      append(id, `✗ npm exited with code ${code ?? "unknown"}.`);
      writeFileSync(deployStatusPath(id), "failed");
    }
  });
}
