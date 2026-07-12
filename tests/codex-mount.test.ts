import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The /codex mount is CSR-only: the codex tree pulls Buffer/window/browser-crypto
// and crashes if it executes during SSR (REVIEW H2). These are source-contract
// tests because the SSR-safety wiring cannot be exercised in a node/jsdom test
// without a real browser mount (the interactive upload -> unlock -> dashboard
// flow is recorded as owner-verify-in-browser). Each assertion pins a concrete
// regression that would break the mount if the wiring were removed.

const codexDir = join(process.cwd(), "app", "codex");
const read = (f: string) => readFileSync(join(codexDir, f), "utf8");

describe("/codex route files", () => {
  it("has the server page + client wrapper + heavy tree + unlock split so the codex tree is isolated behind a boundary", () => {
    for (const f of ["page.tsx", "CodexMount.client.tsx", "CodexApp.tsx", "UnlockScreen.tsx"]) {
      expect(existsSync(join(codexDir, f)), `${f} must exist`).toBe(true);
    }
  });
});

describe("SSR-safety boundary (REVIEW H2)", () => {
  it("keeps the server page free of any codex import so the codex tree never enters the SSR bundle", () => {
    const page = read("page.tsx");
    // The page delegates to the client wrapper; a static @ancientpantheon import
    // here would drag the browser-only codex tree into the server render.
    expect(page).not.toMatch(/@ancientpantheon\//);
    expect(page).toMatch(/CodexMount/);
  });

  it("marks the dynamic wrapper 'use client' because App Router forbids ssr:false in a server component", () => {
    const wrapper = read("CodexMount.client.tsx");
    expect(wrapper).toMatch(/^["']use client["'];?/m);
  });

  it("mounts CodexApp via dynamic(import, { ssr: false }) — the guard that stops the codex tree from executing during SSR", () => {
    const wrapper = read("CodexMount.client.tsx");
    // Lazy loader (not a static import) so importing the wrapper never pulls CodexApp.
    expect(wrapper).toMatch(/dynamic\(\s*\(\)\s*=>\s*import\(\s*["']\.\/CodexApp["']\s*\)/);
    // ssr:false is the load-bearing flag; without it the codex tree SSRs and crashes.
    expect(wrapper).toMatch(/ssr:\s*false/);
  });

  it("supplies a loading fallback so the initial SSR HTML is the fallback, not the un-hydrated codex tree", () => {
    const wrapper = read("CodexMount.client.tsx");
    expect(wrapper).toMatch(/loading:/);
  });
});

describe("product flow port (REQ-04: upload -> unlock -> dashboard)", () => {
  it("mounts an empty MemoryCodexAdapter under CodexProvider so the restore has a store to hydrate into", () => {
    const app = read("CodexApp.tsx");
    expect(app).toMatch(/new MemoryCodexAdapter\(/);
    expect(app).toMatch(/<CodexProvider\b/);
  });

  it("restores the uploaded backup via useCodexBackup().importFromCloud gated on isReady (adapter wired only after the provider init effect)", () => {
    const app = read("CodexApp.tsx");
    expect(app).toMatch(/importFromCloud\(/);
    expect(app).toMatch(/isReady/);
  });

  it("gates the dashboard behind the UnlockScreen until the password unlocks the store", () => {
    const app = read("CodexApp.tsx");
    expect(app).toMatch(/isLocked/);
    expect(app).toMatch(/<UnlockScreen\b/);
  });

  it("renders the real dashboard slots (CodexUiRoot + tabs + settings) — now in the shared CodexShell", () => {
    // The dashboard layout was extracted to CodexShell.tsx, rendered by BOTH the
    // consumer /codex Dashboard and the server /admin/codex surface.
    const shell = read("CodexShell.tsx");
    for (const slot of ["CodexUiRoot", "CodexTabs", "CodexSettingsSection"]) {
      expect(shell, `the shared shell must render ${slot}`).toMatch(new RegExp(slot));
    }
    // The consumer Dashboard delegates to the shell.
    expect(read("CodexApp.tsx")).toMatch(/CodexShell/);
  });

  it("drives the unlock through the real useCodexAuth().authenticate path with an empty-password guard", () => {
    const unlock = read("UnlockScreen.tsx");
    expect(unlock).toMatch(/authenticate\(/);
    expect(unlock).toMatch(/password\.length === 0/);
  });
});

describe("secret hygiene (N-06)", () => {
  it("never logs a password or backup blob from the mount code", () => {
    const app = read("CodexApp.tsx");
    const unlock = read("UnlockScreen.tsx");
    expect(app).not.toMatch(/console\.(log|info|debug)\([^)]*(password|backupText|snapshot)/i);
    expect(unlock).not.toMatch(/console\.(log|info|debug)\([^)]*password/i);
  });
});
