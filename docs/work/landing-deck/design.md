# Landing → fixed-stage page-turn deck — Design

## Context
The v0.7.0 landing is a long scroll page. The owner wants the Pythia-style fixed Landing Stage
(pantheonic design §4): one ~960px page per topic, header Tier-1 buttons switch topics, and scrolling
turns to the next topic like a book page (discrete "hard page-turn"). Topics too big for one page are
paginated into Tier-2 sub-pages. Also: restore Documentation as a Tier-1 button, and fix the
low-contrast Launch Codex button. Ships as v0.7.1.

## Settled decisions
- **Hard page-turn deck** (owner's choice): one page shown at a time; wheel/trackpad (with cooldown),
  Arrow/Page/Space/Home/End keys, and vertical touch-swipe flip discretely — no partial scroll. Header
  Tier-1/Tier-2 buttons jump. `prefers-reduced-motion` cuts the transition.
- **Onboarding + Roadmap fold in** as Tier-2 pages (Onboarding under "The Codex"; Roadmap under
  "Security").
- **All pages render in the DOM** (stacked; active shown via transform) for crawlability/accessibility;
  inactive pages `aria-hidden` + `[hidden]`-guarded.
- Fixed height scoped to the landing root (`.lp`), NOT `body` — `/admin` and `/codex` keep normal scroll.

## Topic → page map (Tier-1 · Tier-2)  — splits tuned empirically to ~960px during build
1. **What it is** — Intro (hero + 3 pillars) · What it's NOT
2. **The Codex** — Seeds & Accounts · Keys & Tools · Onboarding *(folded)*
3. **Four Modes** — Sovereign & +Password · +Email & +Phone
4. **Storage** — Three-layer architecture
5. **Identity** — Standard & Smart keys · Dual-Apollo details
6. **StoicTags** — one page
7. **Security** — Guarantees · Roadmap *(folded)*
8. **Documentation** — Tier-1 button → `/docs` (external; no stage page)

## Acceptance criteria
- **AC1** The landing is a fixed-stage deck: `.lp` fills the viewport (header + stage + slim footer),
  the stage shows exactly one page at a time, and the landing itself does not body-scroll. `/admin` and
  `/codex` still scroll normally (fixed height scoped to `.lp`).
- **AC2** Hard page-turn navigation advances ONE page per input: `wheel` (with a cooldown so a gesture
  doesn't skip pages), `keydown` (ArrowDown/PageDown/Space → next; ArrowUp/PageUp → prev; Home/End →
  ends), and vertical touch-swipe. Header Tier-1/Tier-2 buttons jump directly to a page.
- **AC3** All original landing content is preserved, reorganized into the topic→page map; every page is
  present in the DOM; inactive pages are `aria-hidden` and `[hidden]`-guarded.
- **AC4** Documentation is a Tier-1 button linking to `/docs`; the seven topic labels (What it is, The
  Codex, Four Modes, Storage, Identity, StoicTags, Security) are present as Tier-1 buttons.
- **AC5** The active Tier-1 and Tier-2 buttons highlight the current page.
- **AC6** The Launch Codex primary button is legible — near-black text on the gold fill.
- **AC7** `package.json` = 0.7.1 with a matching CHANGELOG entry; `npx vitest run`, `tsc --noEmit`,
  `next build` all green.

## Out of scope
No content rewriting (copy preserved verbatim); no changes to admin/codex/auth/khronoton. The
`/index.html` → new-landing docs-link follow-up remains separate.
