# Landing deck — §3.7 addressable URLs — Plan

## Wave 1
- [x] T1: Make the deck URL-addressable (§3.7) — in `app/page.tsx`:
  - Add `slug: string` to `DeckPage`; give every page its canonical slug (hero `""`; see design).
  - Add a module-level pure `parseHash(rawHash): number` — empty → 0 (hero); exact `slug` match;
    else bare-topic alias (`topicId` match) → that topic's first page; else 0.
  - Derive `pageIndex` FROM the URL: an effect applies `parseHash(location.hash)` on mount, on
    `popstate`, and on `hashchange`.
  - `go(i, { push })` clamps, writes the URL via `history.pushState`/`replaceState`
    (`#slug`, or the bare pathname for the hero), and sets `pageIndex`.
  - Route every navigator through `go`: Tier-1 `onSelect` → first-page of topic (push); Tier-2
    `onSelect` → that page (push); in-content `#` CTAs → `go(parseHash(...), {push:true})`;
    wheel/swipe/arrows/page-keys → `go(step, {push:false})` (replace); Home/End → push.
  - Keep the existing wheel edge-scroll guard, scrollTop-reset, inert/aria-hidden, instant transform.
  - done when: every view has its own URL; deep-links + Back/forward + hashchange all render the right
    page; `tests/landing.test.ts` updated (source-contract: `parseHash` from `location.hash`,
    `popstate`+`hashchange` listeners, History API writes, `slug` per page, hero bare `/`) and passing;
    `tsc` green.
  - files: `app/page.tsx`, `tests/landing.test.ts`

## Wave 2 (depends on Wave 1)
- [x] T2: Browser-verify + release — verify deep-link load, Tier-1/Tier-2 click updates the address
  bar, Back/forward, and manual hash edit each render the right view; bump `package.json` (0.7.6) +
  `## [0.7.6]` CHANGELOG. done when: browser-verified (quoted URL↔view checks); changelog gate +
  full `vitest` + `tsc` + `next build` green.
  - files: `package.json`, `CHANGELOG.md`
