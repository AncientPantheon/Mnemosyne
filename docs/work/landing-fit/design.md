# Landing deck — one-screen fit + per-page titles

## Context
The v0.7.2 deck positions topics at the top, but the pages don't behave like true single
"pages": some overflow (Intro scrolls), some Tier-2 splits are redundant or feel broken (a
sub-page with no title reads as torn out of context). The owner wants each page (or Tier-2
sub-page) to look and fit as ONE self-contained screen with its own title.

## Settled decisions
- **"What it is" = ONE page (no Tier-2)** — it IS the Intro/hero (the landing home, tied to the
  Mnemosyne medallion). Content = the hero only (identity visual + tagline + lede + Launch Codex
  CTAs + the 3 pillars). **Drop** the "What Mnemosyne is / is NOT" prose + the four "Not a…" cards
  (they live in the docs).
- **"Four Modes" = ONE page (no Tier-2)** — all four modes shown compactly on one screen.
- **Every page/sub-page has its own title** rendered uniformly at the top of the page.
- Topics whose content genuinely can't fit one screen KEEP Tier-2 (The Codex, Identity, Security),
  but each sub-page must also fit and carry its own title.
- **Fit target:** a standard desktop stage (~800px). Denser spacing/fonts/cards so a page fills one
  screen without internal scroll; the overflow-y fallback stays for very short viewports.

## Acceptance criteria
- **AC1** "What it is" is a single deck page (no Tier-2 sub-views); it renders the hero (identity
  visual, tagline, lede, Launch Codex CTA, 3 pillars) with a title; the "What Mnemosyne is / is NOT"
  content is gone.
- **AC2** "Four Modes" is a single deck page (no Tier-2); all four modes are present, compactly.
- **AC3** Every deck page carries its own title, rendered uniformly by the deck (a `title` on each
  page), so no page reads as torn from context.
- **AC4** Topics that keep Tier-2 (The Codex, Identity, Security) have a title on every sub-page.
- **AC5** At a standard desktop stage height (~800px) each page fits without internal scroll
  (verified in the browser); on shorter viewports the overflow fallback applies.
- **AC6** `package.json` bumped + CHANGELOG entry; `vitest` + `tsc` + `next build` green.

## Out of scope
No copy rewriting beyond trimming to fit; no change to admin/codex; the instant page-turn stays.
