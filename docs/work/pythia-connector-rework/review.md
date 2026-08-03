# Pythia connector-auth rework — Review

Scope: `lib/pythia/{apolloSigner,connectorStatus,connectorClient}.ts`, `app/api/admin/
pythia-connector/route.ts` + `status/route.ts`, `app/admin/pythia/PythiaPage.client.tsx`, and the
deletion of `lib/pythia/{apolloIdentity,onboardingChain,onboardingJob,connectorSecretStore}.ts` +
their tests. Lenses: correctness + security + conventions (elevated for a live-automaton connector
change on a just-corrected mental model).

## Findings

### [CRITICAL] Status route leaked the raw per-half `x-pythia-key` secret — FIXED
- **Independently flagged by BOTH the correctness and security lenses** (strong signal).
- **Where:** `app/api/admin/pythia-connector/status/route.ts` — masked the top-level `secret`
  (→ `maskedSecret`) but forwarded `standard`/`smart` (`DualLinkHalfStatus`) verbatim. That type's
  `active` variant carries the **raw** secret, so `body.standard.secret` / `body.smart.secret` would
  expose the live bearer credential the instant a half activates (the feature's steady state) — in
  browser devtools, any client logging, proxies. The reworked test even asserted the leak.
- **Latent only because** the connector is currently dormant (nothing calls `getGatedPythiaClient`),
  so both halves stay `{status:"pending"}` — but it would become a live leak on first activation.
- **Fix:** added `publicHalf()` in the status route that strips each half to `{status}` (+ `expiresAt`
  when active); dropped `secret` from the panel's `ConnectorHalfStatus` active variant; rewrote the
  test to assert `body.standard.secret` is `undefined` AND the raw secret string appears nowhere in
  the serialized body (`JSON.stringify(body)` guard). Re-verified green.

### Everything else — clean (no findings)
- **Additive-only guarantee (the deploy-safety property):** confirmed. `getGatedPythiaClient()` has
  no app caller (dormant); with no stored dual-link-key `getDualLinkConnector()` returns `null` before
  any construction, and the empty-URL path returns a plain `PythiaClient` with no `pythiaKey`, never
  throwing. So with nothing linked (production's state), behavior is byte-identical to before.
- **`apolloSigner.ts`:** faithful `autoSignApolloChallenge` delegate mirroring Pythia's
  `codexApolloSigner.ts` — scope guard + `{signature}` return match pythia-client 2.7.17's
  `ApolloSigner.sign({apolloAccount,nonce,rp})` and codex's `autoSignApolloChallenge`; never surfaces
  plaintext.
- **POST route:** `splitDualLinkKey` throw → clean 400; both-halves-held check mirrors Pythia's
  `codexHoldsAccount` (matches `ouroAccounts[].address`); uninitialized/unreadable codex → 400, not 500.
- **Gating:** both mutation routes + the status GET call `requireAncient` first (401/403), matching
  siblings. The dual-link-key is genuinely public (two account addresses) → plain storage is fine, and
  it's kept out of the unauthenticated `/api/config` payload.
- **`connectorClient.ts`:** correct rebuild-on-key/url-change memoization; correctly diverges from
  Pythia's `selfConnectorLoop.ts` (real `fetch`, request-time `keyProvider()`, no `.start()` loop, no
  in-process `fetchImpl` — Mnemosyne is a real external consumer), divergence documented.
- **No dangling references** to the four deleted modules remain in source (only docs history).

## Gate (after the fix)
```
Test Files  47 passed (47)
     Tests  375 passed (375)
```
`tsc --noEmit`: 69 — the 66 pre-existing baseline + 3 more of the established `Request`-vs-`NextRequest`
route-test idiom (same as every sibling route test), zero in non-test source. `next build --webpack`:
compiled clean, both `/api/admin/pythia-connector` routes present.

**Clean pass, 1 fix round (1 CONFIRMED CRITICAL, fixed).**
