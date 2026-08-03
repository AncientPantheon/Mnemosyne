# Khronoton headless KeyResolver delegation — Review

Scope: `lib/khronoton/keyResolver.ts` (rewritten to delegate) + `tests/khronoton-key-resolver.test.ts`
(the codex `^0.8.0` bump / lockfile from T1 was validated in isolation before this — see plan T1).
Lenses: correctness, security, conventions (3 lenses for a live-signing change, above the ≤3-file
default, given the stakes — Khronoton signs real StoaChain transactions with this seam).

## Findings

### [LOW → fixed] No test exercised the change's core purpose (a non-koala seed resolving)
- **Lens:** correctness.
- **Where:** `tests/khronoton-key-resolver.test.ts` — the only seed fixture was `seedType: "koala"`.
- **Why it mattered:** the entire reason for the delegation is that the old resolver ran every seed
  through the koala SLIP-10 lane and *refused to sign* a chainweaver/eckowallet seed. With only a
  koala fixture, a future regression of that fix (e.g. inside a later codex bump) would pass silently.
- **Verdict:** CONFIRMED. The fixture was demonstrably koala-only, and Pythia's own resolver test
  proves the chainweaver case is testable (it derives via `@stoachain/kadena-stoic-legacy/hd-wallet/
  chainweaver`).
- **Resolution:** fixed. Added a real chainweaver seed fixture (mnemonic → root keypair → account 0,
  derived through the chainweaver scheme so Codex's delegate reproduces the same pubkey) and a test
  asserting `getKeyPairByPublicKey` resolves it with `seedType: "chainweaver"` and the WASM signing
  lane (`encryptedSecretKey` + `password`) populated — the exact case the old hand-roll refused.
  `listCodexPubs` now also asserts the chainweaver pubkey is present.

### Correctness (no CRITICAL/HIGH/MEDIUM)
Full path trace against the installed codex 0.8.0 dist confirmed: all three legacy paths (koala
pure / koala ouro / seed) still resolve; the `CodexKeyMissingError` gate is against the exact class
Codex throws for not-held keys, so the ouro fallback is reachable and real decrypt/wrong-key errors
propagate unmasked; `listCodexPubs`'s final `isKadenaPublicKey` filter never drops a legitimate
64-hex Kadena key; the ouro `HEX_SECRET` check is a superset-safe narrowing of the old broad gate.

### Security (no findings)
The load-bearing invariant — an Apollo `<len>.<xy>` key must never enter the Kadena signer set — is
enforced on every emitting path: `listCodexPubs`' terminal `.filter(isKadenaPublicKey)` (load-bearing,
since Codex's `buildCodexPubSet` does NOT filter), the ouro fallback's pre-match filter, and the
signer source's `push` helper (which filters ALL of seed/pure/ouro — stronger than Pythia's
reference, backed by the Apollo-pure-keypair exclusion test). No `throw`/log embeds secret material;
the decrypted ouro private key only ever lands in the `privateKey` field.

### Conventions (no findings)
Faithful structural mirror of the live reference
`constructors/Pythia/apps/pythia/src/automaton/khronoton/keyResolver.ts`; only expected divergences
(async thunks, the stronger signer-source filter). No dead code, no leftover hand-roll, all imports used.

## Behavioral note (live signing)
Behavior-preserving for koala (Codex derives identically); a fix for chainweaver/eckowallet (old code
refused, now resolves); ouro accounts stay covered by the fallback. No currently-working signing path
regresses.

## Gate (after the fix)
```
Test Files  51 passed (51)
     Tests  404 passed (404)
```
`tsc --noEmit`: 66 (baseline, no new errors; none reference the changed files). `next build
--webpack`: compiled clean, `/apollo-verify` + all codex-consuming routes present.

**Clean pass, 1 fix round.**
