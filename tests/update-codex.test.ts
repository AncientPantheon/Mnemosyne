import { describe, it, expect } from "vitest";

import { runCodexRebuild, CODEX_REBUILD_COMMAND } from "../lib/updateCodex";

describe("runCodexRebuild — the local (Phase-3) file:-link rebuild action", () => {
  it("runs the bounded rebuild command and reports its exit code + stdout back to the operator", async () => {
    const calls: string[] = [];
    const result = await runCodexRebuild(async (command) => {
      calls.push(command);
      return { exitCode: 0, stdout: "up to date, audited 1 package", stderr: "" };
    });
    // The injected runner proves the command actually invoked is the bounded rebuild,
    // not a server-killing restart.
    expect(calls).toEqual([CODEX_REBUILD_COMMAND]);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("audited");
  });

  it("reports ok:false with the exit code when the rebuild command fails (surfaced to the UI, not swallowed)", async () => {
    const result = await runCodexRebuild(async () => ({
      exitCode: 1,
      stdout: "",
      stderr: "npm ERR! could not resolve",
    }));
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("npm ERR!");
  });

  it("never restarts the running dev server — the command is a package install/rebuild only", () => {
    // Guards the safety invariant: a restart from within the dev server would crash
    // the very admin session that triggered it.
    expect(CODEX_REBUILD_COMMAND).not.toMatch(/next (dev|start|build)|restart|pm2|kill/);
    expect(CODEX_REBUILD_COMMAND).toMatch(/npm/);
  });

  it("catches a thrown runner and returns ok:false rather than propagating (the route must always answer)", async () => {
    const result = await runCodexRebuild(async () => {
      throw new Error("spawn ENOENT");
    });
    expect(result.ok).toBe(false);
    expect(result.stderr).toContain("spawn ENOENT");
  });
});
