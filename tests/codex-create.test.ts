import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `/codex` "create a new codex from scratch" flow. Source-contract tests (the
 * interactive kickstart → recovery-phrase → dashboard flow needs a real browser
 * mount, recorded as owner-verify-in-browser). Each assertion pins a concrete
 * regression in the create wiring.
 */
const app = () => readFileSync(join(process.cwd(), "app", "codex", "CodexApp.tsx"), "utf8");

describe("create-a-new-codex flow", () => {
  it("offers all three Stoa seed types (koala / chainweaver / eckowallet)", () => {
    const src = app();
    expect(src).toMatch(/type SeedType = "koala" \| "chainweaver" \| "eckowallet"/);
    for (const t of ["koala", "chainweaver", "eckowallet"]) {
      expect(src).toMatch(new RegExp(`value: "${t}"`));
    }
  });

  it("drives kickstart with ONE mnemonic → prime seed (pos0/pos1) + prime Ouronet (reuse-codexid-whole)", () => {
    const src = app();
    // A fresh mnemonic is generated locally (no secret leaves the device).
    expect(src).toMatch(/KadenaWalletBuilder\.generateMnemonic\(/);
    expect(src).toMatch(/useCodexLifecycle/);
    // The exact v3 kickstart shape the operator specified: one seed drives both.
    expect(src).toMatch(/codexIdSeed:\s*\{\s*mode:\s*"words",\s*value:\s*mnemonic\s*\}/);
    expect(src).toMatch(/codexPrimeSeed:\s*\{\s*source:\s*"reuse-codexid-whole"\s*\}/);
    expect(src).toMatch(/duoPrime:\s*\{\s*mode:\s*"kadena-seed",\s*seedType,\s*mnemonic\s*\}/);
  });

  it("sets the password BEFORE kickstart (kickstart reads the cached password)", () => {
    const src = app();
    const authIdx = src.indexOf("authenticate(password");
    const kickIdx = src.indexOf("kickstart({");
    expect(authIdx).toBeGreaterThan(-1);
    expect(kickIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(kickIdx); // authenticate precedes kickstart
  });

  it("shows the recovery phrase ONCE, gated behind a save-confirmation before the dashboard", () => {
    const src = app();
    expect(src).toMatch(/recovery phrase/i);
    expect(src).toMatch(/cxpg-mnemo-grid/); // the words are displayed
    // "Open Codex" is disabled until the user confirms they saved the phrase.
    expect(src).toMatch(/disabled=\{!saved\}/);
    // Download the encrypted codex too (the other recovery path).
    expect(src).toMatch(/downloadAsJson/);
  });

  it("mounts the create session under CodexProvider (empty adapter), like the upload flow", () => {
    const src = app();
    expect(src).toMatch(/kind: "creating"/);
    expect(src).toMatch(/<CreateSession\b/);
    expect(src).toMatch(/new MemoryCodexAdapter\(/);
  });

  it("the load screen exposes both a Load and a Create tab", () => {
    const src = app();
    expect(src).toMatch(/Create a new Codex/);
    expect(src).toMatch(/onCreate/);
  });

  it("gates Create behind a live password-requirements checklist (disabled until all rules pass)", () => {
    const src = app();
    // A visible checklist of concrete rules that tick as they're met.
    expect(src).toMatch(/cxpg-pwrules/);
    expect(src).toMatch(/At least 8 characters/);
    expect(src).toMatch(/uppercase/i);
    expect(src).toMatch(/lowercase/i);
    expect(src).toMatch(/number/i);
    expect(src).toMatch(/symbol/i);
    // The button is truly disabled until every rule + the confirm match pass.
    expect(src).toMatch(/const canCreate = rules\.every\(\(r\) => r\.ok\) && matchOk/);
    expect(src).toMatch(/disabled=\{!canCreate\}/);
  });
});
