# Pantheonic UI Migration — Design

## Context
Mnemosyne is the React reference automaton but predates the **Pantheonic Design Architecture**
(`websites/Pantheon/docs/pantheonic-architecture/design/PANTHEONIC-DESIGN-ARCHITECTURE.md` v1.1;
clean reference = Pythia, `constructors/Pythia/apps/pythia/public/`). It has drifted: 4 token
namespaces, 4 content widths, 4 hand-rolled headers, `/api/me` fetched in 4 places, and a tile-list
admin instead of the mandated sidebar + content-pane. This migration aligns the **UI shape** to the
standard. It is purely presentational/structural — no auth, crypto, deploy, or engine behavior changes.

Ships as **v0.7.0**.

## Settled decisions
1. **Keep Mnemosyne's bronze/parchment palette.** Adopt the canonical token **names**
   (`--bg --bg-2 --panel --panel-2 --line --ink --ink-soft --ink-mute --accent --accent-dim --danger
   --radius`) mapped onto Mnemosyne's **current values** (accent = its bronze/gold). Visual look is
   preserved; only names/structure change.
2. **Landing = scroll page + anchor-nav.** Reuse existing marketing content; header section buttons
   scroll to sections. **No hero portrait, no fixed stage.**
3. **Drop the Tailwind Play CDN** from the landing; restyle with the shared token CSS.
4. **Landing becomes a React route** (`app/page.tsx`) so it uses the ONE shared header and ONE
   `/api/me` source — eliminating the static/React split and the 4th header. Content is preserved
   (HTML → JSX). *(This is the one structural call beyond the four questions; flagged for approval.)*

## Scope — acceptance criteria (every task traces to one of these)

### Tokens & widths
- **AC1** One canonical `:root` token set (canonical names, Mnemosyne values) is the single source.
  No `--admin-*` or `--cxpg-*` token **declarations** remain; all usages reference canonical tokens.
- **AC2** `--maxw: 1536px` is the only content max-width on admin, codex, and landing. No 860 / 1080 /
  1200 / 1280 content-shell literals remain.
- **AC3** The codex-package recolor stays at `body .codex-ui`, repointed to canonical tokens.

### Shared Pantheonic Header
- **AC4** ONE shared React header renders on the SITE surfaces (landing + admin): sticky `.ph`,
  **full-chrome-width** bottom separator, L1 medallion + version chip + identity block, L2 tier-1
  sections + one memorable action, L3 fixed-height tier-2 zone. Admin variant = L1 only.
- **AC5** ONE `/api/me` consumption source (a `useMe` hook). Identity is React text nodes (never
  `dangerouslySetInnerHTML`). Nothing renders until the first `/api/me` resolves (no wrong-state flash).
- **AC6** Identity block: signed-out → "Login with AncientHub"; signed-in → "Signed in as <name> ·
  <RoleBadge>", an ancient-only Admin link (disabled greyed chip otherwise), then Log out. `ancient`
  badge renders in `--accent`.

### Admin — sidebar + content pane
- **AC7** Admin is a two-column sidebar + content-pane. `/admin` (no hash) shows the "Select a section
  from the left to begin." prompt; `/admin#<section>` selects and renders it; both deep-linkable and
  back-navigable; nested `/admin#<section>/<sub>` renders sub-nav inside the pane.
- **AC8** The sidebar is driven by a single static section-config array (`{id, icon, label, hash,
  enabled}`); disabled/planned sections render greyed + inert (a "coming later" pane note, never a
  broken view).
- **AC9** ONE `AdminGate` (its 4 states preserved); the inline duplicate in the codex admin page is
  gone. Every admin mutation remains server-gated (unchanged behavior).
- **AC10** Every element toggled by the `hidden` attribute carries its own `[hidden]{display:none}`
  guard.

### Landing
- **AC11** Landing is a React route using the shared header, no Tailwind Play CDN, styled via canonical
  tokens; existing content preserved; tier-1 section buttons anchor-scroll to sections.

### Cleanups & release
- **AC12** Dead CSS removed (`.cxpg-main/-header/-shell`, unstyled `.mnemosyne-auth-login/-status`);
  the duplicated `/api/me` client type declarations are unified into one shared exported type.
- **AC13** `package.json` = 0.7.0 with a matching CHANGELOG top entry; `tests/changelog-version.test.ts`
  passes; `tsc --noEmit`, `next build`, and full `vitest` are green.

## Out of scope (already conformant — verify pins only, do not rebuild)
AncientHub SSO (`lib/auth/*`, `app/admin/{login,callback,logout}`, `app/api/me`), `/apollo-verify`,
master-key rotation, Khronoton live engine, codex portability. Also out: the codex-package Network-tab
`locked` bug (fix lives in the package, awaits a spec).

## Constraints
Next.js 16 App Router, `--webpack`, React 19. `tsc --noEmit` + `next build` + `vitest` green at each
phase boundary. Many vitest suites are source-contract regex over admin file paths/labels — they move
with the code and must be updated in the same task that moves the file.

## Topics (execution phases — sequenced; each independently shippable)
1. **tokens-widths** — canonical token sheet; migrate admin + codex CSS; single `--maxw`.
2. **shared-header** — `useMe` + `PantheonHeader` + identity block; adopt on admin & codex.
3. **admin-sidebar** — tile-list → sidebar + content-pane, hash routing, one AdminGate.
4. **landing** — landing → React route, drop Tailwind, shared header, anchor-nav.
5. **cleanup-release** — dead-CSS/type dedup sweep + v0.7.0/CHANGELOG.
