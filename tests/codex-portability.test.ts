import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { emptySnapshot } from "@ancientpantheon/codex/ouronet";

import { rejectIfNotSnapshot, rekeyBackupBlob } from "../lib/mnemosyneCodexRekey";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("mnemosyneCodexRekey — the server-side re-key primitive", () => {
  it("rejectIfNotSnapshot flags wallet envelopes + garbage, accepts a raw snapshot", () => {
    // envelope (kadenaWallets/ouronetWallets) → rejected, so a wallet export can't
    // silently corrupt the store (its secrets live under the renamed fields).
    expect(rejectIfNotSnapshot({ kadenaWallets: [], version: "1.3" })).toMatch(/envelope/i);
    expect(rejectIfNotSnapshot(null)).toBeTruthy();
    expect(rejectIfNotSnapshot("nope")).toBeTruthy();
    expect(rejectIfNotSnapshot(emptySnapshot("main"))).toBeNull();
  });

  it("rekeyBackupBlob round-trips a snapshot server-side (in Node, no store/DOM)", async () => {
    const blob = JSON.stringify(emptySnapshot("main"));
    const { blob: out, skipped } = await rekeyBackupBlob(blob, "machine-pw", "userpw12");
    expect(skipped).toEqual([]);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed).toHaveProperty("kadenaSeeds");
    expect(parsed).toHaveProperty("schemaVersion");
  });
});

describe("codex portability routes + UI (source contract)", () => {
  it("export route is ancient-gated and re-keys machine → newPassword", () => {
    const r = read("app", "api", "admin", "codex", "export", "route.ts");
    expect(r).toMatch(/requireAncient/);
    expect(r).toMatch(/rekeyBackupBlob/);
    expect(r).toMatch(/newPassword/);
    expect(r).toMatch(/getOrCreateCodexPassword/); // the machine password is the OLD key
  });

  it("import route is ancient-gated, guards the envelope shape, re-keys file → machine, seals", () => {
    const r = read("app", "api", "admin", "codex", "import", "route.ts");
    expect(r).toMatch(/requireAncient/);
    expect(r).toMatch(/rejectIfNotSnapshot/);
    expect(r).toMatch(/rekeyBackupBlob/);
    expect(r).toMatch(/saveBackup/); // adopt = seal under the master key
    expect(r).toMatch(/WrongPassword/); // wrong file password → 400, nothing changed
  });

  it("mounts Download + Load on the Mnemosyne codex topbar, with a replace confirm on Load", () => {
    expect(read("app", "admin", "codex", "MnemosyneCodex.tsx")).toMatch(
      /CodexPortabilityControls/,
    );
    expect(existsSync(join(root, "app", "admin", "codex", "CodexPortabilityControls.tsx"))).toBe(
      true,
    );
    const c = read("app", "admin", "codex", "CodexPortabilityControls.tsx");
    expect(c).toMatch(/\/api\/admin\/codex\/export/);
    expect(c).toMatch(/\/api\/admin\/codex\/import/);
    expect(c).toMatch(/replaces/i); // the destructive-load warning
    expect(c).toMatch(/ackReplace/); // must confirm before loading
  });

  it("does NOT duplicate a Lock Codex control in the topbar — the sole lock is the package identity row", () => {
    // Automaton codex-mount convention (arch: automaton master-key doc): server-held
    // auto-unlock means the ONE lock/unlock affordance is the codex package's identity-row
    // control; the automaton wrapper must not add a second Lock button in the top bar.
    const src = read("app", "admin", "codex", "MnemosyneCodex.tsx");
    expect(src).not.toMatch(/MnemosyneLockControl/);
    expect(src).not.toMatch(/Lock Codex/);
    // Topbar actions are portability only.
    expect(src).toMatch(/topbarActions=\{<CodexPortabilityControls \/>\}/);
  });
});
