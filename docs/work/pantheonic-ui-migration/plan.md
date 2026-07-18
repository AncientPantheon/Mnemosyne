# Pantheonic UI Migration — Plan

5 phases, executed in order (each independently shippable; `tsc --noEmit` + `next build` + `npx vitest
run` green at every phase boundary). Task IDs are sequential across the whole plan.

---

## Phase 1 — tokens-widths

### Wave 1
- [x] T1: Create the canonical token sheet — one `:root` block with the canonical NAMES carrying
  Mnemosyne's current bronze/parchment VALUES (mapped from `--admin-*`/`--cxpg-*`): `--bg`(#0d0a07),
  `--bg-2`, `--panel`, `--panel-2`, `--line`(#3d3530), `--ink`(#f5ecd9), `--ink-soft`(#c9bfa8),
  `--ink-mute`, `--accent`(bronze #b8860b), `--accent-dim`, `--danger`(#ff6b7d), `--radius`(14px),
  plus `--maxw: 1536px`. — done when: the file declares all 12 canonical tokens + `--maxw` + `--radius`,
  with values that reproduce the current look.
  - files: `public/assets/pantheon-tokens.css`

### Wave 2 (depends on Wave 1)
- [x] T2: Load the token sheet in both rendering worlds — add
  `<link rel="stylesheet" href="/assets/pantheon-tokens.css">` to the static landing `<head>` and to the
  React root layout `<head>` (before the codex `ui.css` import). — done when: both documents reference
  the sheet and computed `getComputedStyle(document.documentElement)` shows `--maxw: 1536px` on both `/`
  and `/admin`.
  - files: `public/index.html`, `app/layout.tsx`
- [x] T3: Migrate admin CSS to canonical tokens + single width — in `app/admin/admin.css` delete the
  `.mnemo-admin{--admin-*}` custom-property block and rewrite every `var(--admin-x)` to the canonical
  token; set `.mnemo-admin{max-width:var(--maxw)}`; DELETE the `.mnemo-admin:has(.khronoton-ui){max-width:1200px}`
  rule; repoint the `--khr-*` remap block to canonical tokens. — done when: no `--admin-` substring
  remains in the file; the admin column is `--maxw`; the Khronoton console is still themed;
  `npx vitest run tests/admin-panel.test.ts` passes.
  - files: `app/admin/admin.css`
- [x] T4: Migrate codex CSS to canonical tokens + single width + drop dead CSS — in `app/codex/app.css`
  replace the `--cxpg-*` COLOUR/WIDTH tokens that have a canonical equivalent with canonical tokens by
  value (`--cxpg-bg`→`--bg`, `--cxpg-surface`(#2a2520)→`--panel-2`, `--cxpg-surface-2`(#1a1612)→`--panel`,
  `--cxpg-border`→`--line`, `--cxpg-text`→`--ink`, `--cxpg-text-dim`→`--ink-soft`, `--cxpg-accent`→`--accent-dim`,
  `--cxpg-danger`→`--danger`, `--cxpg-radius`→`--radius`); the tint/font locals with no canonical
  equivalent (`--cxpg-bg-soft`, `--cxpg-accent-soft`, `--cxpg-font`) may remain as codex-local vars or be
  inlined. Set `.cxpg-container{max-width:var(--maxw)}`; DELETE the unreferenced
  `.cxpg-main`(1080px)/`.cxpg-header`/`.cxpg-shell` rules; keep the `body .codex-ui` package-token
  override but repoint its values to canonical tokens. — done when: none of the nine migrated
  `--cxpg-` colour/width tokens are declared or referenced any more; `.cxpg-container` uses `--maxw`; the
  three dead selectors return zero grep hits; `/codex` and `/admin/codex` still render correctly themed;
  `tsc --noEmit` + `next build` + full `npx vitest run` are green.
  - files: `app/codex/app.css`

---

## Phase 2 — shared-header (depends on Phase 1)

### Wave 3
- [x] T5: The single identity source — a `useMe()` client hook that fetches `GET /api/me` once
  (`cache: no-store`) and exports the shared `MeResponse` type `{ authenticated: boolean; sub?: string;
  name?: string; roles?: string[] }`, returning `{ me: MeResponse | null, loading: boolean }`; `me`
  stays `null` until the first response resolves. — done when: the hook + exported type exist;
  `tests/useMe.test.ts` asserts it fetches `/api/me` no-store, returns `null` before resolution, and
  parses the payload; test passes.
  - files: `lib/useMe.ts`, `tests/useMe.test.ts`

### Wave 4 (depends on Wave 3)
- [x] T6: The shared Pantheonic Header — a `PantheonHeader` client component rendering the sticky `.ph`
  bar with a **full-chrome-width** bottom separator (border on `.ph`, not `.ph-inner`). L1: medallion
  (brand wordmark linking home) + mono version chip (from a `version` prop) + the identity block
  (consumes `useMe`; signed-out → "Login with AncientHub" → `/admin/login`; signed-in → "Signed in as
  <name> · <RoleBadge>" with an ancient-only `<a href="/admin">` Admin link, else a disabled greyed
  chip, then Log out → `/admin/logout`; `ancient` badge in `--accent`; all via React text nodes, never
  `dangerouslySetInnerHTML`; renders nothing until `me` resolves). Props: `variant: "full" | "admin"`,
  `version`, optional L2 `sections` + one `memorableAction`, optional L3 `subviews`, optional
  `backHref`/`backLabel`. `variant="admin"` renders L1 only. `.ph` styles in a co-located stylesheet.
  — done when: `tests/pantheon-header.test.ts` (source-contract) confirms: separator class on `.ph`;
  text-node identity (no `dangerouslySetInnerHTML`); ancient-gated Admin link; `variant="admin"` emits
  no L2/L3; component renders `null` while `me === null`. Test passes.
  - files: `components/PantheonHeader.tsx`, `components/pantheon-header.css`, `tests/pantheon-header.test.ts`

### Wave 5 (depends on Wave 4)
- [x] T7: Adopt the header in the admin gate — in `app/admin/AdminGate.client.tsx` replace the
  bespoke `.mnemo-admin-header` (back-button + `<h1>` + `<AuthStatus/>`) with
  `<PantheonHeader variant="admin" version={…} backHref={…} backLabel={…} title={…}/>`, preserving the
  4 gate states (checking / signed-out / not-ancient / ancient). The app version is read from
  `package.json` (reuse the existing `mnemosyneVersion()`/`readMnemosyneVersion`). — done when: admin
  pages show the medallion + version chip + shared identity block; `AuthStatus` is no longer imported
  by the gate; the 4 states still render; `tests/admin-panel.test.ts` updated for the new header and
  passing.
  - files: `app/admin/AdminGate.client.tsx`, `tests/admin-panel.test.ts`
- [x] ~~T8: Adopt the header on the consumer codex surface~~ — struck: the premise is false. Verified
  the codex consumer bars (`CodexShell` `.cxpg-topbar`, `CodexApp` `MnemosyneBar`) do NOT fetch
  `/api/me` (no identity duplication to remove), and they are the codex PRODUCT's functional chrome —
  `.cxpg-topbar` holds the Codex UI / Settings view-tabs (`activeView` state) and `MnemosyneBar` uses
  callback-based back/logout tied to the in-memory codex. Replacing them with the site header would
  break those controls for near-zero gain. The shared header covers the SITE surfaces (landing +
  admin); the embedded `/codex` product keeps its own topbar. Wordmark-consistency there is deferred.

---

## Phase 3 — admin-sidebar (depends on Phase 2)

### Wave 6
- [x] T9: Convert the six admin section bodies to gate-free pane components — strip the `AdminGate`
  wrapper and per-page back-header from each section client component so each exports ONLY its section
  body (its existing `<section class="mnemo-admin-card">…`); remove the inline gate re-implementation
  from the codex admin page. — done when: none of the six section components import `AdminGate`; the
  codex admin page's inline 4-state gate is gone; each exports a pane body; `tsc --noEmit` passes.
  - files: `app/admin/codex/MnemosyneCodexPage.client.tsx`, `app/admin/khronoton/KhronotonPage.client.tsx`,
    `app/admin/update-deploy/UpdateDeployPage.client.tsx`, `app/admin/security/SecurityPage.client.tsx`,
    `app/admin/network/NetworkPage.client.tsx`, `app/admin/pythia/PythiaPage.client.tsx`,
    `tests/admin-panel.test.ts` (flip the four "behind the shared gate → AdminGate" assertions to the
    gate-free-pane contract)

### Wave 7 (depends on Wave 6)
- [x] T10: The admin shell — sidebar + content-pane with hash routing. A static section-config array
  `{ id, icon, label, hash, enabled }` (the six sections; `enabled:false` entries render greyed +
  inert) and an `AdminShell` client component: reads `window.location.hash`, renders the sidebar
  (active item highlighted via accent left-border + raised bg) and the pane (the matching section body
  from T9, or the "Select a section from the left to begin." empty prompt at bare `/admin`); a disabled
  section posts a "coming later" pane note. Sidebar/pane styles added to `admin.css`, each `hidden`
  toggle carrying a `[hidden]{display:none}` guard. — done when: `AdminShell` renders sidebar from the
  config; `/admin` shows the empty prompt, `/admin#<section>` highlights + renders it, `hashchange`
  updates the pane; disabled sections are greyed + inert; `≤820px` collapses the sidebar to a chip row.
  - files: `app/admin/adminSections.ts`, `app/admin/AdminShell.client.tsx`, `app/admin/admin.css`

### Wave 8 (depends on Wave 7)
- [x] T11: Rewire admin routing to the shell — `app/admin/page.tsx` renders `<AdminGate><AdminShell/></AdminGate>`
  instead of `AdminLanding`; delete `app/admin/AdminLanding.client.tsx`; convert each of the six
  `app/admin/<section>/page.tsx` route stubs to a client redirect to `/admin#<section>` (preserving
  deep-link/back-compat). — done when: `/admin` renders the sidebar shell; `/admin/codex` (etc.)
  redirect to `/admin#codex`; `AdminLanding.client.tsx` is deleted; `tests/admin-panel.test.ts`
  updated to assert the sidebar model (section-config, `AdminShell`, empty-prompt routing; no
  tile-list) and passing; `tsc --noEmit` + `next build` + full `vitest` green.
  - files: `app/admin/page.tsx`, `app/admin/AdminLanding.client.tsx`,
    `app/admin/codex/page.tsx`, `app/admin/khronoton/page.tsx`, `app/admin/update-deploy/page.tsx`,
    `app/admin/security/page.tsx`, `app/admin/network/page.tsx`, `app/admin/pythia/page.tsx`,
    `tests/admin-panel.test.ts`

---

## Phase 4 — landing (depends on Phases 1 & 2)

### Wave 9
- [x] T12: Convert the landing to a React route — create `app/page.tsx` (+ `app/landing.css`) porting
  the existing `public/index.html` marketing content to JSX (hero + sections + footer, content
  preserved), rendered with the shared `PantheonHeader` (full variant; its tier-1 section buttons
  anchor-scroll to the in-page section ids); style it with the canonical tokens (`app/landing.css`),
  with NO Tailwind Play CDN and no `/assets/styles.css` Tailwind-utility dependency; the version chip
  comes from the header (package version). Delete the raw-HTML handler `app/route.ts`. — done when:
  `/` renders the React landing with the shared header; there is NO `cdn.tailwindcss.com` script and no
  Tailwind utility classes in the rendered output; content (hero, sections, footer) is preserved;
  clicking a tier-1 button scrolls to its section; `app/route.ts` is deleted; `tests/landing.test.ts`
  updated to the React landing (asserts shared header, no Tailwind CDN, anchor sections) and passing;
  `tsc --noEmit` + `next build` + full `vitest` green.
  - files: `app/page.tsx`, `app/landing.css`, `app/route.ts`, `tests/landing.test.ts`

---

## Phase 5 — cleanup-release (depends on all prior)

### Wave 10
- [x] T13: Dedup + dead-code sweep — replace the duplicated local `MeResponse` interface declarations
  with imports of the shared type from `lib/useMe.ts` at every remaining site; delete
  `components/AuthStatus.tsx` if now unused (its `.mnemosyne-auth-*` classes were never styled) and
  remove its references; grep-confirm no dead selectors remain (`.cxpg-main`, `.cxpg-header`,
  `.cxpg-shell`, `.mnemosyne-auth-login`, `.mnemosyne-auth-status`); confirm every `hidden`-toggled
  element across admin/codex has a `[hidden]{display:none}` guard. — done when: no duplicate
  `MeResponse` interface remains (all import the shared type); `AuthStatus.tsx` deleted or justified;
  the listed dead selectors return zero grep hits; `tsc --noEmit` passes.
  - files: `app/admin/AdminGate.client.tsx`, `app/admin/codex/MnemosyneCodexPage.client.tsx`,
    `components/AuthStatus.tsx`, `app/codex/app.css`, `app/admin/admin.css`

### Wave 11 (depends on Wave 10)
- [x] T14: Release v0.7.0 — bump `package.json` `version` to `0.7.0` and add a matching `## [0.7.0]`
  top entry to `CHANGELOG.md` describing the Pantheonic UI migration (canonical tokens, single width,
  shared header, sidebar admin, React landing). — done when: `package.json` = `0.7.0`;
  `npx vitest run tests/changelog-version.test.ts` passes; the full `npx vitest run`, `tsc --noEmit`,
  and `next build` are all green.
  - files: `package.json`, `CHANGELOG.md`
