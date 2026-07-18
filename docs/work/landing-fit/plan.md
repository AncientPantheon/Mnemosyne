# Landing deck — one-screen fit + titles — Plan

## Wave 1
- [x] T1: Restructure the deck + uniform per-page titles — in `app/page.tsx`: add a `title: string`
  to `DeckPage` and have the deck render it once at the top of every page (`.lp-page-title`), then
  strip the now-redundant top heading from each page node. Collapse "What it is" to ONE page (the
  hero: identity visual + tagline + lede + Launch Codex CTAs + 3 pillars) and DELETE the
  "What it's NOT" page (its prose + the four "Not a…" cards). Collapse "Four Modes" to ONE page
  containing all four modes (compact grid — trim each mode's copy to fit). Topics keeping Tier-2
  (codex, identity, security) keep their sub-pages but each gets a `title`. — done when: `TOPICS`
  still lists the 7; the `what` topic has exactly ONE page and the `modes` topic exactly ONE page;
  no "What Mnemosyne is NOT" / "is a Software-as-a-Service" text remains; every PAGES entry has a
  `title`; the deck renders `.lp-page-title`; `tests/landing.test.ts` updated (source-contract:
  `what`+`modes` single-page, `title` on every page, `.lp-page-title` rendered, key surviving copy)
  and passing; `tsc --noEmit` green.
  - files: `app/page.tsx`, `tests/landing.test.ts`

## Wave 2 (depends on Wave 1)
- [x] T2: Compact the landing so each page fills ONE screen — in `app/landing.css` tighten the deck
  density (smaller section/card padding + gaps, tuned heading sizes, cap the hero identity visual,
  compact mode/onboarding cards) so each page fits a ~800px stage without internal scroll; style the
  new `.lp-page-title`. Verify EACH page/sub-page in the browser at a desktop height and adjust until
  none overflow. — done when: at a ~800px stage every Tier-1 page and every Tier-2 sub-page fits with
  no internal scroll (browser-verified, quoting the measured content vs stage height); `/admin` +
  `/codex` unaffected; `next build` + full `vitest` green.
  - files: `app/landing.css`

## Wave 3 (depends on Wave 2)
- [x] T3: Release — bump `package.json` (0.7.3) + a `## [0.7.3]` CHANGELOG entry (single-screen
  pages, per-page titles, What-it-is/Four-Modes de-split). — done when: version set; changelog gate +
  full `vitest` + `tsc` + `next build` green.
  - files: `package.json`, `CHANGELOG.md`
