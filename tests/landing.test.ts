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

  it("mounts the fixed-stage page-turn deck with an INSTANT percentage transform (no animation to stall)", () => {
    const src = page();
    // The deck scaffold: the stage clips, the pages layer translates by -index*100%
    // (self-measuring — exact with border-box pages, so a topic lands flush at the top).
    expect(src).toMatch(/lp-stage/);
    expect(src).toMatch(/lp-pages/);
    expect(src).toMatch(/translateY\(-\$\{[^}]*100[^}]*\}%\)/);
    // The page change is an INSTANT transform — NO CSS transition and NO WAAPI slide.
    // Both stall under a throttled rAF (backgrounded tab), leaving the deck stuck at 0;
    // an instant transform always applies. Reliability over a slide animation.
    expect(css()).not.toMatch(/\.lp-pages\s*\{[^}]*transition\s*:/);
    expect(src).not.toMatch(/\.animate\(/);
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

  it("top-aligns each page so a topic sits at the top of the stage, not centred mid-page", () => {
    // Regression: `justify-content: center`/`safe center` parks a short topic in the
    // middle of the stage with a gap above the heading. A topic must start at the top.
    const pageBlock = css().match(/\.lp-page\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(pageBlock).toMatch(/justify-content:\s*flex-start/);
    expect(pageBlock).not.toMatch(/justify-content:\s*(safe\s+)?center/);
    // border-box is load-bearing: with height:100% + padding under content-box each
    // page renders taller than the stage, so translateY(-index*100%) drifts every page
    // progressively lower and higher topics land far below the stage top.
    expect(pageBlock).toMatch(/box-sizing:\s*border-box/);
  });

  it("resets the shown page to its top on navigation so the topic heading is at the top", () => {
    // Jumping to a topic (Tier-1/Tier-2/scroll) must show it from the start, even if
    // that page had been scrolled before — the deck resets scrollTop on pageIndex change.
    const src = page();
    expect(src).toMatch(/scrollTop\s*=\s*0/);
    expect(src).toMatch(/\[pageIndex\]/);
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

  it("renders the six Tier-1 topic labels so the header exposes every topic as a jump target", () => {
    const src = page();
    for (const label of [
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

  it("does NOT expose 'What it is' as a Tier-1 button — it's the landing home, reached via the wordmark", () => {
    // The hero (deck page 0) stays, but its redundant header button is gone: the
    // Mnemosyne wordmark (ph-medallion → homeHref "/") already lands on it, so there
    // is no `{ id: "what", label: "What it is" }` topic entry driving a Tier-1 button.
    const src = page();
    expect(src).not.toMatch(/label:\s*["']What it is["']/);
    // …but "What it is" survives as the hero page's own title.
    expect(src).toMatch(/title:\s*["']What it is["']/);
  });

  it("restores Documentation as a Tier-1 button linking to /docs (external, not a stage page)", () => {
    const src = page();
    expect(src).toMatch(/Documentation/);
    expect(src).toMatch(/href:\s*["']\/docs["']|href=["']\/docs["']/);
  });

  it("preserves the distinctive marketing copy so the HTML→JSX port didn't paraphrase away the content", () => {
    const src = page();
    // "What Mnemosyne is / is NOT" prose was intentionally dropped (it lives in the
    // docs); these three survive as hero CTA, Codex intro, and the Storage title.
    expect(src).toContain("Privacy by construction");
    expect(src).toContain("What is the Codex?");
    expect(src).toContain("Three-layer storage architecture");
  });

  it("collapses 'What it is' and 'Four Modes' to a single deck page each (AC1/AC2 — no redundant Tier-2 split)", () => {
    const src = page();
    const count = (re: RegExp): number => (src.match(re) ?? []).length;
    // A single page per topic → the deck's subviews stay empty (length < 2) and no
    // sub-page reads as torn from context.
    expect(count(/topicId:\s*"what"/g)).toBe(1);
    expect(count(/topicId:\s*"modes"/g)).toBe(1);
  });

  it("drops the 'What Mnemosyne is NOT' / Software-as-a-Service prose (AC1 — it lives in the docs now)", () => {
    const src = page();
    expect(src).not.toContain("What Mnemosyne is NOT");
    expect(src).not.toContain("Software-as-a-Service");
  });

  it("gives every deck page its own uniform title, rendered once by the deck (AC3/AC4)", () => {
    const src = page();
    // The DeckPage carries a title and the deck renders it at the top of each page,
    // so no page reads as torn from context.
    expect(src).toMatch(/title:\s*string/);
    expect(src).toMatch(/<h2 className="lp-page-title">\{p\.title\}<\/h2>/);
    // Every PAGES entry supplies a title string — one per topicId page object.
    const titleCount = (src.match(/^\s*title:\s*["']/gm) ?? []).length;
    const pageCount = (src.match(/topicId:\s*"/g) ?? []).length;
    expect(pageCount).toBeGreaterThanOrEqual(7);
    expect(titleCount).toBe(pageCount);
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

  it("rewrites the clean /docs URL onto the static docs index so the Documentation link doesn't 404", () => {
    // The Documentation Tier-1 button links to `/docs`, but the docs are static files
    // under public/docs/ — Next serves them at `/docs/index.html`, so a bare `/docs`
    // 404s without this rewrite (and `/docs/` just 308-strips back to `/docs`).
    const cfg = read("next.config.ts");
    expect(cfg).toMatch(/async rewrites\s*\(/);
    expect(cfg).toMatch(/source:\s*["']\/docs["']/);
    expect(cfg).toMatch(/destination:\s*["']\/docs\/index\.html["']/);
  });
});

describe("§3.7 — every deck view has its own URL (no single opaque link)", () => {
  const page = () => read("app", "page.tsx");

  it("derives the shown page FROM the URL hash (source of truth) — parsed on load, popstate AND hashchange", () => {
    const src = page();
    // A pure parser turns the address into the view index...
    expect(src).toMatch(/function parseHash/);
    expect(src).toMatch(/location\.hash/);
    // ...and the view is re-derived on Back/forward (popstate) and on manual URL edits /
    // native hash anchors (hashchange) — never flipped in memory with the URL left stale.
    expect(src).toMatch(/["']popstate["']/);
    expect(src).toMatch(/["']hashchange["']/);
  });

  it("writes each view's own URL via the History API when navigating (never a single frozen link)", () => {
    const src = page();
    // Discrete jumps push (Back returns to the previous view); continuous stepping replaces
    // (the address always reflects the current view without flooding history).
    expect(src).toMatch(/history\.pushState/);
    expect(src).toMatch(/history\.replaceState/);
  });

  it("gives every deck page a canonical slug, with the hero at the bare root (no hash)", () => {
    const src = page();
    // slug is part of the DeckPage contract, one per page.
    expect(src).toMatch(/slug:\s*string/);
    const slugCount = (src.match(/^\s*slug:\s*["']/gm) ?? []).length;
    const pageCount = (src.match(/topicId:\s*"/g) ?? []).length;
    expect(slugCount).toBe(pageCount);
    // The hero carries the empty slug (bare "/"); deep sub-views carry topic/sub slugs so
    // each is individually deep-linkable.
    expect(src).toMatch(/slug:\s*["']["']/);
    expect(src).toContain('slug: "security/guarantees"');
    expect(src).toContain('slug: "identity/dual-apollo"');
    expect(src).toContain('slug: "codex/seeds-accounts"');
  });
});
