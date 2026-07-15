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

/** Start a dev deploy for `id`. Never throws — failures land in the log + status. */
export function startDevDeploy(id: string): void {
  ensureSpoolDir();
  writeFileSync(deployStatusPath(id), "running");
  const command = `npm install ${PACKAGES.join(" ")} --no-audit --no-fund`;
  append(id, `$ ${command}`);
  append(id, "");

  let child;
  try {
    child = spawn(
      "npm",
      ["install", ...PACKAGES, "--no-audit", "--no-fund"],
      { cwd: process.cwd(), shell: process.platform === "win32", env: process.env },
    );
  } catch (err) {
    append(id, `spawn failed: ${err instanceof Error ? err.message : String(err)}`);
    writeFileSync(deployStatusPath(id), "failed");
    return;
  }

  child.stdout?.on("data", (b: Buffer) => append(id, b.toString()));
  child.stderr?.on("data", (b: Buffer) => append(id, b.toString()));
  child.on("error", (err) => {
    append(id, `error: ${err.message}`);
    writeFileSync(deployStatusPath(id), "failed");
  });
  child.on("close", (code) => {
    append(id, "");
    if (code === 0) {
      append(id, "✓ Constructors pulled. Reload the page to pick up the new build.");
      writeFileSync(deployStatusPath(id), "success");
    } else {
      append(id, `✗ npm exited with code ${code ?? "unknown"}.`);
      writeFileSync(deployStatusPath(id), "failed");
    }
  });
}
