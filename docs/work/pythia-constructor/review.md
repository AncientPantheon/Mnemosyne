# Pythia organ adoption — Review

Scope: `package.json`, `package-lock.json`, `lib/codexVersion.ts`, `lib/deploy/constructors.ts`,
`lib/deploy/devDeploy.ts`, `next.config.ts`, `app/api/admin/pythia-client-version/route.ts`,
`app/admin/update-deploy/UpdateDeployPage.client.tsx`, and their test files (all 6 plan.md tasks,
T1–T6). Lenses: correctness, conventions, tests, security (4-lens tier — 12 files).

## Round 1

### [MEDIUM] `wired: true` hardcoded regardless of read success → literal "vunknown" badge
- **Where:** `lib/deploy/constructors.ts` (all three entries) + `app/admin/update-deploy/UpdateDeployPage.client.tsx:131`
- **Evidence:** `readCodexUiVersion`/`readKhronotonUiVersion`/`readPythiaClientVersion` all return the literal `"unknown"` on read failure; `VersionRow` rendered `{wired ? `v${installed}` : "not wired"}` — with `wired` hardcoded `true`, a failed read showed the literal text "vunknown".
- **Why it matters:** masks a real installed-version-read failure behind text that looks like a real version.
- **Verdict:** CONFIRMED (correctness lens). Validation note: pre-existing identically for Codex/Khronoton before this diff (Pythia replicated it via copy-paste, didn't introduce it), but `VersionRow` is one shared component — a single fix covers all three constructors.
- **Resolution:** fixed. `VersionRow` now renders "unreadable" (non-`--live` badge styling) when `wired` is true but `installed === "unknown"`. New test: `tests/admin-panel.test.ts` — "shows 'unreadable', not a literal 'vunknown', for a wired constructor whose version read failed".

### [MEDIUM] `deploy-constructors.test.ts` set up an update-available scenario but never asserted on it
- **Where:** `tests/deploy-constructors.test.ts`
- **Evidence:** stubbed `dist-tags.latest: "9.9.9"` (certain to be newer than the real installed `2.3.0`) but only asserted `wired`/`npmPackage`/`installed` shape — never `available`/`updateAvailable`/`anyUpdateAvailable`, the actual fields the stub was set up to exercise.
- **Verdict:** CONFIRMED (tests lens). Validation note: confirmed no other test exercises the aggregate `readConstructorsStatus()`'s update-detection path — `tests/pythia-client-version-route.test.ts` covers only the single-route handler's own independent computation, `tests/deploy-panel.test.ts` explicitly asserts the box-status path must NOT call `readConstructorsStatus()`.
- **Resolution:** fixed. Added `available`/`updateAvailable`/`anyUpdateAvailable` assertions to the existing case, plus a companion case asserting no update is flagged when npm reports the already-installed version.

### [LOW] Stale doc comment — `ConstructorStatus` interface still said "Both Codex and Khronoton are wired"
- **Where:** `lib/deploy/constructors.ts:29-30`
- **Verdict:** CONFIRMED (conventions lens). Newly stale as of this diff (Pythia's addition didn't update it).
- **Resolution:** fixed — now names all three.

### [LOW] Stale doc comment — `readConstructorsStatus` doc still said "Codex and Khronoton are both wired ... either can drive a deploy"
- **Where:** `lib/deploy/constructors.ts:70-73`
- **Verdict:** CONFIRMED (conventions lens). Same as above.
- **Resolution:** fixed — now names all three ("any of the three").

### [LOW] Missing edge-case test — `fetchLatestPythiaClientVersion`'s "no dist-tags.latest" case
- **Where:** `tests/pythia-client-version.test.ts`
- **Evidence:** `tests/codex-version.test.ts` has a "returns null when the payload has no dist-tags.latest" case for the equivalent Codex function; the new Pythia test file, though structurally mirroring it, dropped that one case.
- **Verdict:** CONFIRMED (conventions lens). Validation note: `fetchLatestPythiaClientVersion` is an independently-duplicated function (not a shared helper), so its own suite genuinely lacked direct coverage of that branch.
- **Resolution:** fixed — added the matching case.

### [STYLISTIC] Missing `admin-panel.test.ts` "(source contract)" describe block for the new route
- **Where:** `tests/admin-panel.test.ts` (Khronoton has one at lines 293-305; Pythia doesn't)
- **Verdict:** downgraded from LOW to STYLISTIC on validation. Codex's version route — the *original* of the three — has no such block either, so this is not an established two-file convention, just something Khronoton happened to get. The behavior it would pin is already covered more strongly by `tests/pythia-client-version-route.test.ts`'s full runtime 401/403/200 tests.
- **Resolution:** not applied (user decision deferred to final report — see below).

### [STYLISTIC / no action] `pythia-client-version-route.test.ts` reproduces the repo's pre-existing `Request`-vs-`NextRequest` typing gap
- **Where:** `tests/pythia-client-version-route.test.ts:8-13`
- **Verdict:** CONFIRMED as a real `tsc` type mismatch, but reclassified STYLISTIC/informational — factually verified as a well-established repo-wide convention (identical pattern independently confirmed in 7 other test files), zero runtime risk (`requireAncient` only calls methods common to both types), and confirmed that `next build`'s own TypeScript pass explicitly excludes `*.test.*` files by design (`next/dist/lib/typescript/runTypeCheck.js`) — not enforced by any CI workflow either. Mirroring the file it copies was the internally-consistent choice; fixing only the new file would make the codebase less consistent, not more.
- **Resolution:** not applied — matches established convention, zero behavioral/shipping risk, out of scope for a repo-wide typing cleanup.

### Security lens
Zero findings — `requireAncient` gating, response shapes, dependency pinning convention, npm-response handling, and render paths all confirmed consistent with the existing Codex/Khronoton siblings.

## Fix verification (post-fix, full scope)

```
Test Files  41 passed (41)
     Tests  322 passed (322)
```

`next build --webpack`: compiled successfully, `/api/admin/pythia-client-version` present in the route table, zero new TypeScript errors in application code (confirmed `next build`'s own TS pass is clean; the repo's ~52 pre-existing `tsc --noEmit` test-file-only errors — now 57, +5 from the new route test mirroring an existing convention — are unaffected by and unrelated to this diff, confirmed by stashing all changes and re-running `tsc --noEmit`: identical 52-error baseline).

**Behavioral verification** (design.md's acceptance criteria, exercised live — real npm registry, real `node_modules`, no stubs):
```
$ npx tsx tmp-verify-constructors.ts   # ran readConstructorsStatus() directly, then deleted
{
  "constructors": [
    { "key": "codex", "installed": "0.6.1", "available": "0.7.0", "wired": true, "updateAvailable": true },
    { "key": "khronoton", "installed": "0.4.2", "available": "0.4.2", "wired": true, "updateAvailable": false },
    { "key": "pythia", "installed": "2.3.0", "available": "2.3.0", "wired": true, "updateAvailable": false }
  ],
  "anyUpdateAvailable": true,
  "deployMode": "dev"
}
```
Three constructors, Pythia present with `wired: true` and its real installed version — matches design.md's acceptance criteria directly.

## Round 2 (terminal)

Re-ran full scope, full lens set after the round-1 fixes: no new findings surfaced (fixes were minimal and targeted — doc comments, one shared-component render condition, two test additions — none touched logic outside what round 1 already reviewed). Full suite green (above), `next build` clean (above), behavioral check passed (above).

**Clean pass confirmed. 2 rounds. 5 CONFIRMED findings fixed, 2 STYLISTIC findings deferred to the user (final report).**
