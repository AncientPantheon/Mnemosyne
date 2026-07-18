import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract for the sidebar + content-pane admin shell. AdminShell mounts a
// browser tree (hash routing + the codex/khronoton client panes), untestable in this
// node-env vitest, so each assertion pins a structural regression: a lost section from
// the config, a shell that stops hash-routing, or a missing empty-state prompt.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("admin section config", () => {
  const src = () => read("app", "admin", "adminSections.ts");

  it("declares the static section-config array with all six sections", () => {
    const s = src();
    expect(s).toMatch(/ADMIN_SECTIONS/);
    for (const id of ["codex", "update-deploy", "khronoton", "pythia", "security", "network"]) {
      expect(s).toMatch(new RegExp(`hash:\\s*["']${id}["']`));
    }
  });

  it("each entry carries id, icon, label, hash, enabled, and a Pane component", () => {
    const s = src();
    for (const key of ["id:", "icon:", "label:", "hash:", "enabled:", "Pane:"]) {
      expect(s).toMatch(new RegExp(key));
    }
  });
});

describe("AdminShell — sidebar + content pane with hash routing", () => {
  const src = () => read("app", "admin", "AdminShell.client.tsx");

  it("is a client component driven by the section config", () => {
    expect(src()).toMatch(/^["']use client["'];?/m);
    expect(src()).toMatch(/ADMIN_SECTIONS/);
  });

  it("routes off the URL hash and re-renders on hashchange (deep-linkable, back-navigable)", () => {
    expect(src()).toMatch(/location\.hash/);
    expect(src()).toMatch(/hashchange/);
  });

  it("shows the unselected empty prompt at bare /admin", () => {
    expect(src()).toMatch(/Select a section from the left to begin\./);
  });

  it("renders disabled sections inert (aria-disabled), never a broken view", () => {
    expect(src()).toMatch(/aria-disabled/);
    expect(src()).toMatch(/enabled/);
  });
});
