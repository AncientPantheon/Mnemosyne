# Landing deck — §3.7 addressable URLs (no single opaque link)

## Context
Pantheonic Design Architecture **§3.7** (new): *Every navigable view has its own URL — no single
opaque link.* Every view reachable by a Tier-1/Tier-2 button, and every page of a Pantheonic site,
has its **own distinct URL** (path or `#hash`): deep-linkable, shareable, back-navigable. The URL is
the **source of truth** — derive the current view *from* the path/hash (parse on load and on
`popstate`/`hashchange`), rather than flipping content in memory and letting the URL shadow it.

## Audit — Mnemosyne surfaces
- **`/admin`** — already conforms: `AdminShell.client.tsx` reads `window.location.hash`, listens on
  `hashchange`, and each `/admin/<section>` route redirects to `/admin#<section>`. No change.
- **`/apollo-verify`** — single page, no in-page view switching. Already one-URL-one-view. No change.
- **`/codex`** — the mounted third-party `@ancientpantheon/codex` UI; its internal routing is its own
  concern. Out of scope.
- **`/` (landing deck)** — **the sole violator.** The deck holds `pageIndex` in `useState` and turns
  pages purely in memory; the address stays `/` for all 11 views. This is exactly the "one opaque
  link for the whole surface" anti-pattern §3.7 forbids.

## Settled decisions
- **One canonical hash per deck page** (`slug` on each `DeckPage`):
  - hero "What it is" → bare `/` (no hash — it is the landing home, reached via the wordmark)
  - `#codex/seeds-accounts`, `#codex/keys-tools`, `#codex/onboarding`
  - `#modes`, `#storage`, `#stoictags` (single-page topics → topic-only slug)
  - `#identity/standard-smart`, `#identity/dual-apollo`
  - `#security/guarantees`, `#security/roadmap`
  - A **bare topic hash** (`#codex`, `#identity`, `#security`) is accepted as an alias that resolves
    to that topic's first page (matches §3.7's `/#chains` section link), so typed/section URLs work.
- **URL is the source of truth.** `pageIndex` is derived from `location.hash` by a single pure
  `parseHash()` — applied on mount (deep-link), on `popstate` (Back/forward), and on `hashchange`
  (manual URL edit / native hash anchor). Navigation writes the URL via the History API and sets the
  index; Back/forward re-derives from the URL.
- **History discipline:** discrete jumps (Tier-1/Tier-2 buttons, in-content CTAs, Home/End) →
  `pushState` (Back returns to the previous chosen view). Continuous stepping (wheel, swipe, arrows,
  page-keys) → `replaceState` (URL always reflects the current view, but sequential scrolling doesn't
  flood history). Either way the address bar always shows the current view's own URL.

## Acceptance criteria
- **AC1** Each of the 11 deck views has its own URL: hero at `/`, the other ten at their `#slug`.
  Clicking a Tier-1/Tier-2 button navigates to that URL; the header active state matches.
- **AC2** Opening a deep link (`/#security/guarantees`, `/#identity/dual-apollo`, bare `/#codex`)
  restores that exact view on load.
- **AC3** Back/forward moves between previously-shown views (`popstate` re-derives the view); editing
  the hash in the URL bar (`hashchange`) switches the view. The address bar is never stale.
- **AC4** No behavior regressions: hard page-turn (one gesture = one page), top-alignment, one-screen
  fit, inert/aria-hidden inactive pages all still hold.
- **AC5** `package.json` bumped + CHANGELOG; `vitest` + `tsc` + `next build` green; browser-verified.

## Out of scope
No change to admin/apollo-verify/codex; no visual redesign; the instant page-turn stays.
