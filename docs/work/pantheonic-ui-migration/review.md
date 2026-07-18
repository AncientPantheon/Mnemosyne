# Pantheonic UI Migration — Review

Scope: the v0.7.0 migration working-tree diff (38 files) since HEAD `5062257`. Full 5-lens set
(correctness · conventions · security · tests · performance), findings adversarially validated.

## Result: clean pass (round 2)

- **correctness — clean.** Gating intact (the six panes are gate-free but rendered ONLY inside
  `AdminShell`, which is rendered only inside `AdminGate`; panes never mount for non-ancients).
  Hash routing handles bare/unknown/hashchange. No wrong-state flash. Redirects target the right hash.
  Landing behavior preserved.
- **security — clean.** Client gate was always UX-only; every admin mutation stays `requireAncient`
  server-side. Identity rendered as React text nodes (no injection). Redirects use static targets.
  `import pkg` exposes only `version`.

## Findings & resolutions

### [MEDIUM] Orphaned tile-list CSS (conventions) — FIXED
`.mnemo-admin-tile*` / `.mnemo-admin-tilelist` / `.mnemo-admin-btn--ghost` had 0 `.tsx` uses after the
tile-list landing was deleted. Validation: CONFIRMED (grep, no consumer). Removed from `admin.css`.

### [MEDIUM] `pantheon-header` "admin variant is L1-only" test was a tautology (tests) — FIXED
The two `toMatch` checks both survived dropping either L2/L3 guard. CONFIRMED. Rewritten to couple each
`ph-l2`/`ph-l3` row to its `variant === "full"` guard, so removing a guard now fails the test.

### [MEDIUM] No test guarded the removal half of AC1/AC2 (tests) — FIXED
Only token PRESENCE was pinned, not the ABSENCE of `--admin-*`/`--cxpg-*` declarations or old width
literals. CONFIRMED. Added a "migration removal contract" describe to `pantheon-tokens.test.ts`
asserting no old namespace declarations and no `860/1080/1200/1280` content-width literals.

### [MEDIUM] `pantheon-tokens-wired` tests a "dead" `public/index.html` (tests) — REFUTED
Claim: `public/index.html` is orphaned and its assertions block cleanup. Validation: the docs pages
(`public/docs/*.html`) still link `href="/index.html"` (and `#identity`), so it is a REACHABLE page, not
dead — and deleting it would 404 those doc links. REFUTED. (Follow-up noted below — not this migration.)

### [LOW] Unused `.lp-wrap` / `.lp-lead` in `landing.css` (conventions) — FIXED
0 uses in `app/page.tsx`. CONFIRMED. Removed. (Removing `.lp-wrap` surfaced that the landing caps
content via rem readability measures + the shared header's `--maxw`, not a private `--maxw` band — the
`landing.test.ts` "uses `var(--maxw)`" assertion was corrected to check broad canonical-token usage;
the no-old-fixed-width contract for the landing is now pinned in the AC2 test.)

### [LOW] Stale `layout.tsx` comments ("landing serves its own body/Cinzel") — FIXED
The landing is now a React route through `RootLayout`. CONFIRMED. Comments corrected.

### [LOW] Double blank line after imports in five migrated panes (conventions) — FIXED
Artifact of the `AdminGate` import removal. CONFIRMED. Collapsed.

### [LOW] Admin pages fired two `/api/me` requests (performance) — FIXED
`AdminGate` and `PantheonHeader` each mounted `useMe` → two identical `no-store` GETs per admin load,
contradicting the "single source" contract. CONFIRMED. Added concurrent-fetch coalescing in `useMe`
(a module-level in-flight promise cleared on settle — dedups the double fetch WITHOUT cross-time
caching, so the session stays live). `fetchMe` stays pure/unit-tested.

## Clean-pass confirmation (postdates the last edit)
- `npx vitest run` → **`Test Files 35 passed (35)` / `Tests 258 passed (258)`**
- `npx tsc --noEmit` → **0 errors in app/lib/components/instrumentation** (pre-existing `tests/`
  NextRequest/NODE_ENV noise only, predates this work)
- `npm run build` → **`✓ Compiled successfully`**
- Behavioral smoke (dev server): `/` 200 (shared `.ph` header, no Tailwind CDN, content preserved),
  `/admin` 200 (gate → session check), `/admin/network` 200 (redirect), `/codex` 200, `/api/me` 200
  `{authenticated:false}`.

## Follow-up (out of scope for this migration)
The docs pages (`public/docs/*.html`) link home to `/index.html` = the OLD static landing, while the
new React landing is at `/`. Not a regression introduced here (pre-existing coupling), but worth a
follow-up: redirect `/index.html` → `/`, or repoint the docs' home links.
