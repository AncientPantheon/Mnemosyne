import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-contract for the React landing (app/page.tsx + app/landing.css). The page
// mounts a browser tree (PantheonHeader → useMe → fetch), untestable in this node-env
// vitest, so each assertion pins a concrete regression in the landing's contract:
// a landing that stops using the ONE shared header, a Tailwind-CDN dependency creeping
// back in, a lost section anchor the header can no longer scroll to, or dropped copy.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");
const publicDir = join(root, "public");

describe("React landing route", () => {
  const page = () => read("app", "page.tsx");
  const css = () => read("app", "landing.css");

  it("renders the ONE shared PantheonHeader (full variant) so the landing stops re-inventing a 4th header", () => {
    const src = page();
    expect(src).toMatch(/from ["']@\/components\/PantheonHeader["']/);
    expect(src).toMatch(/<PantheonHeader\b/);
    expect(src).toMatch(/variant=["']full["']/);
  });

  it("feeds the header the package version so the version chip stays the single source (no stale hardcoded string)", () => {
    const src = page();
    expect(src).toMatch(/from ["']@\/package\.json["']/);
    expect(src).toMatch(/version=\{[^}]*version\s*\}/);
  });

  it("ships NO Tailwind Play CDN — regression guard against the ~3MB runtime compiler returning to the landing", () => {
    expect(page()).not.toContain("cdn.tailwindcss.com");
    expect(css()).not.toContain("cdn.tailwindcss.com");
  });

  it("carries no Tailwind palette-utility classes — proves the styling actually moved to real CSS, not left half-ported", () => {
    const src = page();
    // These utilities are keyed to the old bespoke Tailwind config; their presence
    // would mean the CDN dependency still silently governs the look.
    expect(src).not.toMatch(/\btext-bronze\b/);
    expect(src).not.toMatch(/\btext-parchment\b/);
    expect(src).not.toMatch(/\bbg-stoa-/);
  });

  it("exposes a Launch Codex affordance wired to /codex so operators can reach the Codex mount", () => {
    const src = page();
    expect(src).toMatch(/Launch Codex/);
    expect(src).toMatch(/href:\s*["']\/codex["']|href=["']\/codex["']/);
  });

  it("keeps every tier-1 section as an in-page anchor id AND a header nav item so the buttons scroll to a real target", () => {
    const src = page();
    for (const id of [
      "what",
      "codex",
      "modes",
      "storage",
      "identity",
      "stoictags",
      "security",
    ]) {
      expect(src).toMatch(new RegExp(`id=["']${id}["']`)); // the scroll target section
      expect(src).toMatch(new RegExp(`href:\\s*["']#${id}["']`)); // the header nav anchor
    }
  });

  it("preserves the distinctive marketing copy so the HTML→JSX port didn't paraphrase away the content", () => {
    const src = page();
    expect(src).toContain("What Mnemosyne is");
    expect(src).toContain("What is the Codex?");
    expect(src).toContain("Three-layer storage architecture");
  });

  it("styles via the canonical Pantheonic tokens (not Tailwind palette names) so the landing shares the one :root", () => {
    const c = css();
    // Multiple canonical tokens across the palette prove the landing is on the shared
    // :root, not a private set. (Content width uses rem readability measures + the
    // shared header's --maxw; the no-old-fixed-width contract is pinned in
    // tests/pantheon-tokens.test.ts.)
    expect(c).toMatch(/var\(--accent\)/);
    expect(c).toMatch(/var\(--ink\b/);
    expect(c).toMatch(/var\(--panel\b/);
    expect(c).not.toMatch(/parchment|bronze|stoa-stone/);
  });
});

describe("folded marketing assets", () => {
  it("serves the doc index and shared stylesheet from public so intra-site links resolve", () => {
    expect(existsSync(join(publicDir, "docs", "index.html"))).toBe(true);
    expect(existsSync(join(publicDir, "assets", "styles.css"))).toBe(true);
  });

  it("keeps the doc pages pointing at the shared stylesheet (styling preserved verbatim)", () => {
    const docIndex = read("public", "docs", "index.html");
    expect(docIndex).toContain('href="/assets/styles.css"');
  });
});
