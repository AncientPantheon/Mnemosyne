# Pythia connector-auth — full wiring — Review

Scope: all of `lib/pythia/*.ts` (connectorStatus, connectorSecretStore, apolloSigner, apolloIdentity,
codexSnapshot, onboardingChain, connectorClient, onboardingJob), `app/api/admin/pythia-connector/
route.ts` + `status/route.ts`, `app/admin/pythia/PythiaPage.client.tsx`, and 9 test files (19 files
total — 16+ tier, all 5 lenses: correctness, conventions, security, tests, performance).

## Round 1 — 8 findings, all CONFIRMED, all fixed

### [HIGH] Onboarding's own Apollo identity used a raw public key where Pythia's wire protocol requires a `₱./Π.`-prefixed address
Every real onboarding run would have deployed and linked both Apollo halves on-chain (spending real
STOA) and only then failed at the first proving-stage HTTP call — `apolloAccount` reached Pythia's
server as a raw base-49 public key, which fails `isValidApolloAccount`'s length/prefix check.
Confirmed by tracing the full call path against Pythia's actual server-side validation source.
**Fixed:** `ensureConnectorApolloPair()` now returns both the raw public key (for on-chain Pact
signer resolution) and the derived address (for the HTTP wire protocol); `onboardingJob.ts` routes
each to the correct consumer; `apolloSigner.ts` now matches/signs on the address, not the raw key.

### [MEDIUM] "Start onboarding" button re-enabled while a run was genuinely in progress
`disabled` only accounted for the initial POST's in-flight state, not the multi-minute background
job. **Fixed:** extended to cover any non-idle, non-failed stage; button label now honestly
distinguishes "Already onboarded" from "In progress…".

### [MEDIUM] Codex-snapshot-loading boilerplate duplicated across apolloSigner.ts/apolloIdentity.ts
**Fixed:** extracted into a new shared `lib/pythia/codexSnapshot.ts`.

### [MEDIUM] connectorSecretStore.ts's save() lacked the atomic tmp+rename write its own doc comment claimed to mirror
**Fixed** (round 1: local atomic-write copy; round 2, on a deeper conventions finding: swapped to
reuse the repo's already-exported, more-hardened `lib/envFile.ts` `atomicWriteFileSync`, which adds
fsync + `chmod 0600` — appropriate for a live-secret file).

### [MEDIUM] Admin onboarding-trigger UI tests only regex-matched raw source text
**Fixed:** tightened to exact-contiguous-expression regexes (can't be satisfied by a stray comment);
new assertions for the disabled-state fix above. (No DOM-rendering test infra added — this codebase
has no `@testing-library/react`/jsdom dependency and its own established convention for every client
component is source-contract testing; adding new test infrastructure for one component would have
been a disproportionate, inconsistent scope expansion.)

### [MEDIUM] onboardingJob failure-path tests didn't cover every stage
No test covered `ensureConnectorApolloPair()` throwing, nor `refresh()` throwing (vs. resolving
`{status:"pending"}`) at the proving stages — the subtlest, highest-risk branch in this real-money
orchestrator. **Fixed:** added both missing cases.

### [LOW] getGatedPythiaClient's defensive `stage:"success"` + falsy `standardApollo` branch untested
**Fixed:** added the case.

### [LOW] No test pinned "importing the module alone never triggers onboarding"
**Fixed:** added a `vi.resetModules()` + fresh-import test; verified it actually catches the bug by
temporarily reintroducing a stray top-level call, confirming the new test failed, then removing it.

## Round 2 (terminal-attempt) — 3 more findings surfaced, all resolved

### [CRITICAL→documented] On-chain signer resolution rejects Apollo's own key format entirely
Independent from the HIGH bug above: `onboardingChain.ts`'s on-chain leg resolves signers via
Khronoton's `keyResolver.ts`, which requires a raw-hex decrypted secret and signs via
`universalSignTransaction`, which only supports Kadena-native `koala`/`chainweaver`/`eckowallet`/
`foreign` seed types — **no Apollo/Schnorr (`dalos-apollo`) variant exists anywhere in this
monorepo's vendored signing stack**, confirmed by direct inspection of `@stoachain/stoa-core`'s and
the vendored `@kadena/client` fork's type declarations and runtime dispatch. A dedicated
investigation task searched exhaustively for any working precedent of Apollo-keyed Pact-transaction
signing anywhere in this monorepo (constructors/Pythia, constructors/Codex, the vendored chain
libraries) and found none — this is a genuine, unresolved architectural gap, not a simple format bug.
**Resolution:** no speculative crypto fix was implemented — a guessed conversion could produce a
signature that "looks like" it worked but is cryptographically wrong for the intended signer,
which is more dangerous than a clean failure. Instead: (1) confirmed the failure is safe — key
resolution happens strictly before any transaction is built, signed, or broadcast, so no STOA is at
risk from this specific gap; (2) the error message was improved to name the actual cause (Apollo-
curve vs. Ed25519-only signing) instead of a misleading generic message; (3) a prominent code comment
was added alongside the existing "VERIFY AGAINST THE LIVE PYTHIA.pact MODULE" flag; (4) `design.md`'s
Decisions log documents the investigation and finding in full. **This is now the single most
important remaining gap before the onboarding action could ever be safely triggered** — it requires
either StoaChain/Pact domain expertise or a working example this session could not locate.

### [MEDIUM] connectorSecretStore.ts's atomic-write fix (round 1) was itself a third, weaker copy of a pattern
Round 1's fix duplicated `mnemosyneCodexStore.ts`'s pattern locally rather than reusing the repo's
already-exported, more-hardened `lib/envFile.ts` helper. **Fixed** in round 2 (see above).

### [LOW] Internal plan-task labels ("Wave 2", "Wave 3", "(T1)") leaked into shipped source comments
**Fixed:** replaced with concrete file/function references in `onboardingChain.ts`/`onboardingJob.ts`.

### [STYLISTIC, declined] `(T8)`/`(REVIEW M1)` tags in test titles
Flagged once more in the final pass but found to match this codebase's own pre-existing convention
(`tests/admin-panel.test.ts` already uses `(REVIEW M5/M6)`-style tags in `describe`/`it` titles) —
not a deviation. Left as-is.

## Final verification (after every fix, full scope)

```
Test Files  50 passed (50)
     Tests  388 passed (388)
```

`next build --webpack`: compiles cleanly, full route table including `/api/admin/pythia-connector`
and `/api/admin/pythia-connector/status`. `tsc --noEmit`: zero new errors in any file touched by this
topic (132 pre-existing, unrelated test-file errors — `Request`/`NextRequest` typing, confirmed
present on the baseline before this work — untouched).

**Behavioral verification:** exercising `getGatedPythiaClient()`/`readConnectorStatus()` in the
current (post-all-fixes) state confirms the additive-only guarantee holds — with `stage: "idle"`
(true immediately after this ships), every constructed `PythiaClient` carries no `pythiaKey`,
identical to pre-existing unattributed behavior.

## Round count and clean-pass confirmation

3 review rounds (initial 5-lens pass → 8 CONFIRMED findings fixed; terminal 5-lens re-pass → 3 more
CONFIRMED findings + 1 already-safe CRITICAL gap surfaced and honestly documented, all resolved;
final confirmatory 5-lens pass → **zero CONFIRMED findings, 1 STYLISTIC declined (matches existing
convention)**). Full suite, `tsc`, and `next build` green after the last applied edit.

**Clean pass confirmed.**
