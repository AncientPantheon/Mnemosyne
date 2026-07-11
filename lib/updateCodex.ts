import { exec } from "node:child_process";

/**
 * "Update Codex" server action.
 *
 * PHASE 3 (local/dev — this file): the five `@ancientpantheon/codex-*` packages are
 * consumed via `file:` links, so there is NO published semver pin to bump. The
 * update action re-installs/re-links them ({@link CODEX_REBUILD_COMMAND}) and reports
 * the command's exit code + output back to the operator. It deliberately does NOT
 * restart the running dev server — a restart from within the server would crash the
 * very admin session that triggered it. A codex change picked up here is reflected
 * after the operator's next reload.
 *
 * PHASE 6 (prod — not here): the action instead advances the PUBLISHED codex-ui
 * version pin + rebuilds/redeploys the app (the hub self-deploy analogue). That
 * version-advance behavior is a Phase-6 criterion; Phase 3 delivers the gated action
 * + the local `file:`-rebuild path only.
 */

/** The bounded, safe local rebuild command. Re-links the `file:` deps; never restarts. */
export const CODEX_REBUILD_COMMAND = "npm install --no-audit --no-fund";

/** How long the rebuild may run before it is abandoned (bounded, non-hanging). */
const REBUILD_TIMEOUT_MS = 5 * 60 * 1000;
/** Cap the captured output so a huge install log can't bloat the JSON response. */
const OUTPUT_LIMIT = 8_000;

export interface RebuildResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  /** The command that ran, echoed so the UI can show exactly what happened. */
  command: string;
  /** The Phase-3-vs-Phase-6 note surfaced next to the result in the UI. */
  note: string;
}

/** A runner is injectable so the action is testable without a real npm spawn. */
export type CommandRunner = (
  command: string,
) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

const PHASE_NOTE =
  "Local (dev) rebuild: re-links the file: codex packages. It does NOT restart " +
  "the server (that would end this admin session) — reload to pick up changes. " +
  "Advancing the published codex version + redeploy is the Phase-6 behavior.";

/** The default runner: spawn the bounded command and capture stdout/stderr/exit. */
const defaultRunner: CommandRunner = (command) =>
  new Promise((resolve) => {
    exec(
      command,
      { timeout: REBUILD_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const exitCode =
          error && typeof (error as { code?: unknown }).code === "number"
            ? ((error as { code: number }).code)
            : error
              ? 1
              : 0;
        resolve({ exitCode, stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
  });

const truncate = (s: string): string =>
  s.length > OUTPUT_LIMIT ? `${s.slice(0, OUTPUT_LIMIT)}\n…(truncated)` : s;

/**
 * Run the local codex rebuild. Always resolves (never throws) so the route can
 * always answer: a thrown/failed runner is reported as `ok:false` with the error in
 * `stderr`, not propagated.
 */
export async function runCodexRebuild(
  runner: CommandRunner = defaultRunner,
): Promise<RebuildResult> {
  try {
    const { exitCode, stdout, stderr } = await runner(CODEX_REBUILD_COMMAND);
    return {
      ok: exitCode === 0,
      exitCode,
      stdout: truncate(stdout),
      stderr: truncate(stderr),
      command: CODEX_REBUILD_COMMAND,
      note: PHASE_NOTE,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr: err instanceof Error ? err.message : String(err),
      command: CODEX_REBUILD_COMMAND,
      note: PHASE_NOTE,
    };
  }
}
