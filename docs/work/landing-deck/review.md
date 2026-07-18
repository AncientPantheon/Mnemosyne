# Landing-deck (v0.7.1) — Review

Scope: the v0.7.1 diff since HEAD `51c3830` — `app/page.tsx` (deck), `app/landing.css`,
`components/pantheon-header.css`, `tests/landing.test.ts`, `tests/pantheon-header.test.ts`. Lens set:
correctness · conventions · tests · performance (4–15 file tier), findings adversarially validated.

## Result: clean pass (round 2)

## Findings & resolutions

### [HIGH] Unconditional `preventDefault` on wheel trapped overflowing page content (correctness) — FIXED
The wheel handler `preventDefault`'d every event, so a page taller than the stage (common on laptops —
stage ≈ viewport − header − footer < the ~960px page target) could not scroll; with
`justify-content: center` the clipped top was doubly unreachable. Fix: the handler now lets the active
page scroll its own overflow first and only turns the deck at the scroll edge; `.lp-page` uses
`justify-content: safe center` (centres when it fits, aligns to start — scrollable — when it overflows).

### [MEDIUM] Wheel cooldown skipped pages on trackpad momentum (correctness) — FIXED
A fixed 500ms cooldown let a >500ms momentum flick flip 2–3 pages. Fix: gesture-gap detection — the
timestamp resets on every wheel event, so only the first event after a real pause (`GESTURE_GAP_MS`)
flips = one flick, one page.

### [MEDIUM] Inactive pages `aria-hidden` but their links stayed in the tab order (correctness/tests) — FIXED
All pages stay mounted; inactive ones had only `aria-hidden`, so a keyboard user tabbed into off-screen
links. Fix: `inert={!isActive}` (removes them from tab order + a11y tree without collapsing layout, so
the translate animation still works). Test added.

### [MEDIUM] Dead in-content hash CTAs (conventions) — FIXED
The hero's "What is the Codex?" (`#codex`), "Pick your mode" (`#modes`), and inline "see Storage" links
were inert (the deck has no scroll anchors). Fix: a delegated click handler maps an in-content
`#<topic>` to `goTo(TOPIC_FIRST_PAGE[topic])` — verified live (clicking a Tier-1 jumps the deck).

### [MEDIUM x3 / LOW x2] Test coverage gaps (tests) — FIXED
Added source-contract guards the lens flagged as missing: AC1 fixed-stage CSS (`.lp` `100dvh` +
`overflow:hidden`, `.lp-stage overflow:hidden`), AC5 active-state derivation, AC3 `aria-hidden` + `inert`,
AC2 `touchstart`/`touchend`, and tightened the primary-button contrast regex to constrain all three RGB
channels to near-black.

### [LOW] Dead `topicLabel` field (conventions) — FIXED
Removed from `DeckPage` and all page entries (unread; duplicated the `TOPICS` label).

### [LOW] Leftover pre-deck scroll-layout CSS (conventions) — FIXED
Removed unused `.lp-section*`, `.lp-lead`, `.lp-divider`, `.lp-grid--4`, `.lp-footer`/`.lp-footer-links`.

### [LOW] `backdrop-filter` blur on every card during the transform (performance) — FIXED
Dropped `backdrop-filter` from `.lp-card` (the semi-opaque background reads fine) and narrowed the
card `transition: all` to the hover properties — no per-frame backdrop re-sampling of all mounted pages
during a page-turn.

## Clean-pass confirmation (postdates the last edit)
- `npx vitest run` → **`Test Files 35 passed (35)` / `Tests 265 passed (265)`**
- `npx tsc --noEmit` → **0 errors in app/lib/components** (`inert` typechecks under React 19;
  pre-existing `tests/` NextRequest/NODE_ENV noise only)
- `npm run build` → **`✓ Compiled successfully`**
- Behavioral (real browser, dev): `/` renders the fixed-stage deck (one topic, v0.7.1 chip); clicking
  Tier-1 "The Codex" jumped the deck and its Tier-2 tabs changed to Seeds & Accounts / Keys & Tools /
  Onboarding (active-state + pagination verified); Documentation→`/docs`, Launch Codex→`/codex`; `/admin`
  still returns 200 and scrolls (fixed height scoped to `.lp`).

Full wheel/overflow-scroll feel is viewport-dependent and best confirmed by the owner on deploy; the
mechanism is verified structurally + by the live click-navigation.
