# Landing → fixed-stage page-turn deck — Plan

Small feature, one surface. Task IDs sequential; `tsc --noEmit` + `next build` + `npx vitest run`
green at the close.

## Wave 1
- [x] T1: Fix the Launch Codex (primary header button) contrast — in `components/pantheon-header.css`,
  `.ph-btn--primary` renders near-black text on the gold `--accent` fill (`color: #0d0a07`, weight
  700) so the label reads clearly. — done when: `.ph-btn--primary` sets `color: #0d0a07` (or darker)
  with `font-weight: 700`; no other button variant changes; `next build` green.
  - files: `components/pantheon-header.css`

## Wave 2 (depends on Wave 1 — shares no files, but the deck is the substantive change)
- [x] T2: Rewrite the landing as a fixed-stage hard page-turn deck — reorganize `app/page.tsx` into a
  client deck holding `pageIndex` over a flat `PAGES` array (each `{ topicId, topicLabel, subLabel,
  node }`), reusing the existing section JSX regrouped per the design's topic→page map (content
  preserved verbatim; Onboarding folded under The Codex, Roadmap under Security). Render
  `<PantheonHeader variant="full" sections=… subviews=… memorableAction={{label:"Launch Codex ↗",
  href:"/codex"}}/>` where `sections` = the 7 topics (`onSelect` → jump to the topic's first page,
  `active` = current topic) plus Documentation (`href:"/docs"`), and `subviews` = the current topic's
  Tier-2 pages (`onSelect` + `active`). Structure: `.lp` (fills viewport) → header → `.lp-stage`
  (overflow hidden) → `.lp-pages` (translateY(-index*100%)) of all `.lp-page` nodes → slim `.lp-foot`.
  Navigation handlers: `wheel` (passive:false + preventDefault + ~500ms cooldown = one page/gesture),
  `keydown` (ArrowDown/PageDown/Space→next, ArrowUp/PageUp→prev, Home/End→ends), vertical
  touchstart/touchend swipe. Inactive pages `aria-hidden` + `hidden`. Deck/stage CSS in
  `app/landing.css` (fixed height on `.lp` only — not `body`; `.lp-pages` transform transition with a
  `prefers-reduced-motion` cut; `.lp-page` centered, internal-scroll only as a small-screen fallback);
  keep the existing `.lp-card/.lp-grid/.lp-mode/...` content styles. — done when: `/` renders the deck
  (all topic content present in the DOM), one page shows at a time, wheel/Arrow/Space/touch advance one
  page, the seven Tier-1 topics + a Documentation→`/docs` button render, active Tier-1/Tier-2 follow the
  page, `/admin` + `/codex` still scroll; `tests/landing.test.ts` updated (source-contract: `lp-stage`
  + `lp-pages`, `wheel`/`keydown` handlers, Documentation→`/docs`, the seven topic labels, no Tailwind
  CDN, canonical tokens, key headings preserved) and passing; `tsc --noEmit` + `next build` green.
  - files: `app/page.tsx`, `app/landing.css`, `tests/landing.test.ts`

## Wave 3 (depends on Wave 2)
- [x] T3: Release v0.7.1 — bump `package.json` to `0.7.1` and add a `## [0.7.1]` CHANGELOG entry
  describing the fixed-stage page-turn landing + the button-contrast fix. — done when: version =
  `0.7.1`; `npx vitest run tests/changelog-version.test.ts` passes; full `npx vitest run` + `tsc
  --noEmit` + `next build` green.
  - files: `package.json`, `CHANGELOG.md`
