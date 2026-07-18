import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract test for the canonical Pantheonic token sheet. The whole UI
// migration keys off this exact set of custom-property NAMES (values are Mnemosyne's
// own bronze/parchment theme). If a token is dropped or renamed, every surface that
// references it loses its colour/width — this pins the contract so that regression
// surfaces here instead of as silent unstyled UI across the app.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

const CANONICAL_TOKENS = [
  "--bg",
  "--bg-2",
  "--panel",
  "--panel-2",
  "--line",
  "--ink",
  "--ink-soft",
  "--ink-mute",
  "--accent",
  "--accent-dim",
  "--danger",
  "--radius",
];

describe("canonical Pantheonic token sheet", () => {
  const sheetPath = ["public", "assets", "pantheon-tokens.css"];

  it("ships at public/assets/pantheon-tokens.css", () => {
    expect(existsSync(join(root, ...sheetPath))).toBe(true);
  });

  it("declares every canonical token on :root", () => {
    const css = read(...sheetPath);
    const root = css.match(/:root\s*\{([^}]*)\}/s)?.[1] ?? "";
    for (const token of CANONICAL_TOKENS) {
      // Each token must be DECLARED (name followed by a colon), not merely referenced.
      expect(root).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it("sets the single content width --maxw to 1536px", () => {
    const css = read(...sheetPath);
    expect(css).toMatch(/--maxw\s*:\s*1536px/);
  });

  it("carries Mnemosyne's bronze/parchment values (not a foreign theme)", () => {
    const css = read(...sheetPath).toLowerCase();
    // Parchment ink + a bronze/gold accent are Mnemosyne's identity; guards against a
    // copy-paste of another site's palette.
    expect(css).toMatch(/#f5ecd9/); // parchment ink
    expect(css).toMatch(/#b8860b|#d4a04a/); // bronze / gold accent
  });
});

// The migration's ACs are ABSENCE contracts (AC1: no old token-namespace declarations;
// AC2: no old content-width literals). Presence of the canonical set is pinned above;
// these guard the removal half — the regression the migration exists to prevent.
describe("migration removal contract (AC1/AC2)", () => {
  it("declares no old --admin-* token namespace anywhere in the admin sheet", () => {
    // A stray `--admin-bg:` re-declaration would resurrect the parallel namespace.
    expect(read("app", "admin", "admin.css")).not.toMatch(/--admin-[a-z0-9-]+\s*:/);
  });

  it("declares none of the nine migrated --cxpg-* colour/width tokens in the codex sheet", () => {
    const css = read("app", "codex", "app.css");
    expect(css).not.toMatch(
      /--cxpg-(bg|surface|surface-2|border|text|text-dim|accent|danger|radius)\s*:/,
    );
  });

  it("leaves no 860/1080/1200/1280 content-width literal on the migrated sheets", () => {
    // The single content width is --maxw:1536px; the old per-surface widths are gone.
    for (const sheet of [
      ["app", "admin", "admin.css"],
      ["app", "codex", "app.css"],
      ["app", "landing.css"],
    ]) {
      expect(read(...sheet)).not.toMatch(/max-width:\s*(?:860|1080|1200|1280)px/);
    }
  });
});
