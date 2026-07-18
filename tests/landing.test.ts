import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-contract for the React landing (app/page.tsx + app/landing.css). The page
// mounts a browser tree (PantheonHeader → useMe → fetch) plus imperative wheel/key/touch
// listeners, untestable in this node-env vitest, so each assertion pins a concrete
// regression in the landing's contract: a landing that stops using the ONE shared header,
// a Tailwind-CDN dependency creeping back in, the fixed-stage page-turn deck losing its
// stage/pages scaffold or its navigation handlers, the seven Tier-1 topics or the
// Documentation link going missing, or dropped marketing copy.

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

  it("mounts the fixed-stage page-turn deck (stage + translating pages layer) so one topic shows at a time", () => {
    const src = page();
    // The deck scaffold: the stage clips, the pages layer translates.
    expect(src).toMatch(/lp-stage/);
    expect(src).toMatch(/lp-pages/);
    // The pages layer is driven by the current index via a transform.
    expect(src).toMatch(/translateY/);
  });

  it("wires the hard page-turn input handlers so wheel/keys/touch advance exactly one page", () => {
    const src = page();
    // A source-contract proxy for the imperative listeners (untestable headless):
    // dropping any handler is the regression that silently breaks navigation — wheel
    // + keys on desktop, touchstart/touchend on mobile.
    expect(src).toMatch(/["']wheel["']/);
    expect(src).toMatch(/["']keydown["']/);
    expect(src).toMatch(/["']touchstart["']/);
    expect(src).toMatch(/["']touchend["']/);
  });

  it("keeps the fixed-stage deck mechanism in CSS (else it degrades to a long scroll)", () => {
    // AC1: the deck only works because .lp is a fixed-height, overflow-hidden viewport
    // and .lp-stage clips. If either is dropped, all pages stack and the body scrolls —
    // the exact pre-v0.7.1 behaviour. This is the most behaviorally load-bearing CSS.
    const lpBlock = css().match(/\.lp\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(lpBlock).toMatch(/height:\s*100dvh/);
    expect(lpBlock).toMatch(/overflow:\s*hidden/);
    const stageBlock = css().match(/\.lp-stage\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(stageBlock).toMatch(/overflow:\s*hidden/);
  });

  it("derives the active Tier-1/Tier-2 highlight from the current page (AC5)", () => {
    const src = page();
    // Tier-1 active tracks the current topic; Tier-2 active tracks the current page.
    // Wiring either to a constant/wrong field silently kills the current-page highlight.
    expect(src).toMatch(/active:\s*currentTopic === t\.id/);
    expect(src).toMatch(/active:\s*index === pageIndex/);
  });

  it("guards inactive pages for a11y — aria-hidden AND inert (all pages stay mounted)", () => {
    // Every page renders in the DOM (crawlable); inactive ones must be out of the a11y
    // tree AND the tab order, or a keyboard user tabs into off-screen links. `inert`
    // does both without collapsing layout (so the translate animation still works).
    const src = page();
    expect(src).toMatch(/aria-hidden=\{!\s*isActive\}/);
    expect(src).toMatch(/inert=\{!\s*isActive\}/);
  });

  it("renders the seven Tier-1 topic labels so the header exposes every topic as a jump target", () => {
    const src = page();
    for (const label of [
      "What it is",
      "The Codex",
      "Four Modes",
      "Storage",
      "Identity",
      "StoicTags",
      "Security",
    ]) {
      expect(src).toContain(label);
    }
  });

  it("restores Documentation as a Tier-1 button linking to /docs (external, not a stage page)", () => {
    const src = page();
    expect(src).toMatch(/Documentation/);
    expect(src).toMatch(/href:\s*["']\/docs["']|href=["']\/docs["']/);
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
