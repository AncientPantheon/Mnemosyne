# Pythia connector-auth — full wiring — Design

Topic 2 of the `pythia-third-constructor` project — see
`../pythia-third-constructor/design.md` for the umbrella problem statement and topic split.
Depends on topic 1 (`../pythia-constructor/design.md`) landing the dependency + version-resolution
plumbing first.

## Problem

`websites/Pantheon/docs/pantheonic-architecture/organs/06-pythia-client-wire-in.md` §1–2 describes
the actual capability the Pythia organ exists for: a dual-Apollo (`₱` Standard + `Π` Smart)
connector-auth protocol that gets a consumer attributed, gated access — `PythiaConnector`,
`ApolloSigner`, on-chain deploy+link+prove, a live ~3h-TTL `x-pythia-key`. Mnemosyne has none of
this today; server-side, `PythiaClient` is not used anywhere in the codebase (confirmed by
investigation) — this is greenfield, not a retrofit.

## Approach

**Signing — two DIFFERENT operations, both now with a concrete, reusable, existing primitive
(confirmed by direct investigation of the installed packages' type declarations — no more "TBD at
build time" on either):**

1. **Off-chain proof-of-possession** (`ApolloSigner.sign({apolloAccount, nonce, rp})`, the SDK's
   own interface for the §1c challenge/verify wire protocol — signing a short canonical message,
   NOT a Pact transaction). New `lib/pythia/apolloSigner.ts` composes the exact primitives
   `keyResolver.ts` already uses server-side — `getOrCreateCodexPassword()` + `loadBackup()`
   (`lib/mnemosyneCodexStore.ts`) → `smartDecrypt` the target account's secret
   (`@stoachain/stoa-core/crypto`) → `signApolloOwnership(account, secretPlaintext, nonce, rp)`.
   **Verified empirically** (not guessed): `signApolloOwnership`/`buildApolloOwnershipMessage` are
   exported ONLY from `@ancientpantheon/codex/ui` (confirmed absent from `/ouronet` — an earlier
   draft of this doc wrongly assumed `/ouronet`), and — the real risk this doc originally flagged —
   importing that subpath server-side under plain Node ESM (`environment: "node"`, this repo's
   actual vitest config) was tested directly and **works cleanly**: no `window`/browser-global
   crash at import time, both functions callable, `buildApolloOwnershipMessage` producing exactly
   the documented 4-line canonical message. Import from `@ancientpantheon/codex/ui` directly; no
   reimplementation fallback needed.
2. **On-chain Pact transactions** (`C_DeployApolloPythiaApiKey` ×2, `C_LinkDualApiKey`). Mnemosyne
   already has a complete, generic, no-human-in-the-loop **build+sign** pipeline for exactly this —
   it's what powers Khronoton's autonomous scheduled-tx engine — and none of it is Khronoton-
   specific: `Pact.builder.execution(pactCode).setMeta(...).setNetworkId(...).addData(...)
   .addSigner(...).createTransaction()` (the `Pact` builder from `@stoachain/kadena-stoic-legacy/
   client`, the exact vendored `@kadena/client` surface, reachable via `getChainRuntime()` in
   `lib/khronoton/runtime.ts` → `.Pact`), then `universalSignTransaction(tx, keypairs)`
   (`@stoachain/stoa-core/signing`) with keypairs resolved via the **already-existing**
   `createMnemosyneKeyResolver()` (`lib/khronoton/keyResolver.ts` — no new decrypt/key-handling
   code needed at all here). The signed command is then relayed via a plain, ungated
   `new PythiaClient({baseUrl}).send({cmds: [signed]})` — deliberately NOT via
   `@ancientpantheon/khronoton-core/server`'s `executeCodexTransaction(..., "fire", ctx)`, which
   submits directly against a chain node (`runtime.createClient(...)`) and bypasses Pythia
   entirely; doc §2d is explicit that this on-chain step goes through "Codex signing +
   `PythiaClient.send`", and `send` is unattributed/keyless (capability 1) — exactly the right fit
   for a step that happens *before* any gated identity exists yet.
   **Known gap, explicitly flagged rather than guessed away:** the doc gives `C_LinkDualApiKey`'s
   exact parameter order (`standard, smart, consumer-lane`) but does not give
   `C_DeployApolloPythiaApiKey`'s full parameter list beyond "deploys one Standard or Smart Apollo
   API-key row, 500 STOA" — and no `.pact` source or working example call for either function was
   found anywhere in this monorepo (the one candidate doc, `constructors/Pythia/docs/
   HANDOFF-pact-apollo-pythia-key-module.md`, uses stale `APIARY`-module/250-STOA naming that
   organs/06 §0 explicitly says does not match the live module — not usable as ground truth). Build
   the Pact-code strings as a single, clearly isolated, well-commented constant per function
   (best-effort: `(owner-account apollo-public is-standard)` for the deploy call, by direct analogy
   to `C_LinkDualApiKey`'s documented shape) and mark them **VERIFY AGAINST THE LIVE `PYTHIA.pact`
   MODULE BEFORE THIS CODE PATH IS EVER TRIGGERED** — consistent with, and no weaker than, the
   standing hard constraint that this run never fires the onboarding action live regardless.

**Identity.** The protocol assumes the consumer already has both Apollo halves in its own wallet
before deploying them on-chain. Mnemosyne's sealed codex may not yet contain a dedicated Standard
+ Smart Apollo pair for this connector identity. `@ancientpantheon/codex/ouronet` exports
`deriveDoubleApollo(seedInput, mode, splitOverride?): {standard, smart, formatted, ...}` — a pure,
synchronous derivation of a Standard+Smart Apollo pair from seed material — confirmed present, but
there is no single existing "generate a fresh seed and append the resulting pair to this sealed
codex" convenience function; the onboarding flow's first stage composes it from pieces that DO
exist: generate fresh seed material (`node:crypto` `randomBytes`, Mnemosyne's own choice — no seed
generator is exported by codex), call `deriveDoubleApollo`, then persist the resulting keypairs
into the sealed codex's own snapshot shape (`IOuroAccount`/`IPureKeypair`, both exported from
`@ancientpantheon/codex/ouronet`) via the snapshot read/write path `lib/mnemosyneCodexStore.ts`
already uses for every other entry. Reasoned addition beyond the doc's literal text (which assumes
the pair pre-exists); refine the exact snapshot-append mechanics at build time against
`mnemosyneCodexStore.ts`'s actual save path and record any further choice in Decisions below.

**Storage — split by sensitivity:**
- Non-secret onboarding status (stage, timestamps, both accounts' public identifiers, last error)
  — `lib/pythia/connectorStatus.ts`, plain JSON on the data volume, mirroring `lib/
  adminSettings.ts`'s fail-safe read/write idiom but its own file — never folded into
  `AdminSettings` itself, since that object is served verbatim and unauthenticated by
  `GET /api/config`.
- The live connector secret (`x-pythia-key` + proof bookkeeping) — `lib/pythia/
  connectorSecretStore.ts`, following `lib/mnemosyneCodexStore.ts`'s exact pattern: a `*.sealed`
  file, sealed/unsealed via the existing `lib/mnemosyneVault.ts` under `MNEMOSYNE_MASTER_KEY` (the
  same key already protecting the codex password/backup). This becomes the SDK's `SecretStorage`.

**Onboarding action — Pattern B (async multi-stage job), copied from the deploy panel
(`lib/deploy/spool.ts` + `app/api/admin/deploy/*`), not the synchronous single-shot admin routes**
— it's the existing template for "ancient-gated, multi-stage, must show truthful pending/running
state, must survive a reload without lying about progress." New `POST /api/admin/pythia-connector`
starts the job (returns `{id}` immediately, never blocks); `GET /api/admin/pythia-connector/status`
is the poll target, reporting a stage enum: `"idle" | "ensuring-identity" | "deploying-standard" |
"deploying-smart" | "linking" | "proving-standard" | "proving-smart" | "activating" | "success" |
"failed"`. Poll, not SSE — the six stages are short discrete chain calls, not a streaming build
log. **This route only ever fires from an ancient-gated POST triggered by a human admin in the
panel — never from build, deploy, startup, or any scheduled/background process.** This is a hard
constraint, not a style preference: it spends real STOA and creates a permanent on-chain identity.

**Ongoing use.** Once status is `"success"`, `lib/pythia/connectorClient.ts` exposes
`getGatedPythiaClient()` — builds the SDK's `PythiaConnector` + `PythiaClient` wired with
`pythiaKey: connector.keyProvider()`, reading the connector's base URL from the same
`readAdminSettings().pythiaUrl` the existing gateway config already provides (one Pythia endpoint,
two access modes — no second URL field). Re-proving/refresh is the SDK's own `keyProvider()`
responsibility ("resolved fresh per request — no manual refresh loop") — Mnemosyne adds no timer.

**Admin UI** (`app/admin/pythia/PythiaPage.client.tsx`) gains a section below the existing
gateway-URL form: connector identity status (idle/pending/active, both Apollo public accounts once
created, last error) and the onboarding trigger with an inline confirm-below-the-button (mirroring
`rotate-master-key`'s and the deploy panel's own confirm UX) — disabled once already active.

## Acceptance criteria

- [ ] `lib/pythia/apolloSigner.ts` implements the SDK's `ApolloSigner` interface entirely
      server-side using Mnemosyne's own sealed-codex secret material — no private key material
      leaves the process, no human in the loop.
- [ ] Onboarding status and secret are persisted in two separate stores as described above; the
      secret store is sealed under `MNEMOSYNE_MASTER_KEY`; `adminSettings.ts` is untouched.
- [ ] `POST /api/admin/pythia-connector` (ancient-gated, `401`/`403` enforced) starts the
      onboarding job; `GET /api/admin/pythia-connector/status` (ancient-gated) reports the current
      stage truthfully, including a not-yet-complete state.
- [ ] The onboarding job is reachable **only** via that ancient-gated POST — grep confirms no call
      site in build scripts, deploy scripts, `instrumentation.ts`, or any cron/tick loop.
- [ ] `/admin#pythia` shows connector identity status and an onboarding trigger with an inline
      below-the-button confirmation; the trigger is disabled once already active.
- [ ] With no active link (true immediately after this ships — the onboarding trigger is never
      fired by this run), every existing Mnemosyne test still passes unmodified in intent — the new
      capability is strictly additive.
- [ ] `lib/pythia/connectorClient.ts` exposes a gated `PythiaClient` once (and only once) the
      connector is active, built via `connector.keyProvider()` per doc §2c.
- [ ] `vitest`, `tsc`, and `next build` all pass for the full repo (both topics combined).
- [ ] `package.json` version bumped, `CHANGELOG.md` top entry covers both topics for an outside
      reader (per the umbrella design's shared-release decision).

## Out of scope

- Firing the onboarding action.
- Revocation (lifecycle step 5) — no UI for it.
- Any change to the existing gateway-URL form's own behavior (only additive UI below it).

## Decisions

Autonomous run confirmed 2026-07-31.

- Signing (T3) — CORRECTED after a `next build --webpack` failure. An earlier pass of this doc
  claimed `signApolloOwnership` was "verified empirically" safe to import server-side because it
  imported cleanly under this repo's plain-Node vitest `environment: "node"` config. That
  verification was insufficient: `@ancientpantheon/codex/ui` is a single bundled ~624KB file
  containing a full React UI component library that calls `React.createContext` etc. at module
  scope, and while it resolves fine under plain Node (and under vitest's Node environment), Next's
  webpack bundler applies React's "react-server" condition/aliasing when bundling a SERVER route —
  a fundamentally different resolution environment — which choked on it
  (`TypeError: (0 , _.createContext) is not a function` while collecting page data for
  `/api/admin/pythia-connector`). Plain-Node/vitest import success is NOT sufficient evidence a
  module is safe for a Next.js server route; `next build` must be checked too, every time, for any
  change touching an API route's import graph.
  The actual fix: `lib/pythia/apolloSigner.ts` no longer imports anything from
  `@ancientpantheon/codex/ui`. It reimplements `signApolloOwnership`'s exact behavior directly
  against `@stoachain/stoa-core/dalos` (already a transitive dependency, already used elsewhere in
  this codebase — see below) — zero React: `createDefaultRegistry()` +
  `registry.register(Apollo)`, `createOuronetAccount(registry, options)` to re-derive the `FullKey`,
  `Apollo.sign(full.keyPair, message)` to sign. `buildApolloOwnershipMessage`'s four-line canonical
  message format is inlined verbatim (it was already documented as a trivial, exact known source),
  so no import of it is needed either.
- T3/T4 bridging (found during T3's build) — `signApolloOwnership(account: IOuroAccount, ...)`
  needs a full `IOuroAccount` (`address`, `isSmart`, `originMode`, `originCurve`), but T4's
  `ensureConnectorApolloPair()` stores the connector's Standard/Smart identity as `pureKeypairs`
  entries (raw base-49 public key, raw base-49 private scalar, no address/curve metadata) — the
  natural fit for `deriveDoubleApollo`'s own output shape. `apolloSigner.ts`'s reimplemented
  `signOwnershipProof()` bridges this directly (no `IOuroAccount` adapter object needed anymore):
  it re-derives the real `₱./Π.`-prefixed address via `Apollo.publicKeyToAddress(pure.publicKey,
  isSmart)` (`@stoachain/stoa-core/dalos`), passes `originMode: "integerBase49"` explicitly (the
  default `"seedWords"` would misinterpret the raw scalar as seed-word text), and infers `isSmart`
  from the `"pythia-connector-standard"` / `"pythia-connector-smart"` label T4 writes. Verified
  cryptographically (signature checked with `Apollo.verify` against the canonical message), not
  just "was called."
- Identity (T4) — `deriveDoubleApollo` used with `mode: "bitstring"`, a 2048-bit string from
  `node:crypto`'s `randomBytes(256)`, no `splitOverride` (default 1024/1024 split) — confirmed the
  exact expected input shape from the package's own `normalizeBitstring`/`APOLLO_BITS_TOTAL`
  validation before calling it, rather than guessing. Encrypt counterpart to `smartDecrypt`: found,
  no gap — `encryptStringV2` from `@stoachain/stoa-core/crypto` (the same primitive
  `tests/khronoton-key-resolver.test.ts` already uses to build its own fixtures), used directly
  rather than the lower-level `smartEncrypt` since new writes should always be V2 per that module's
  own header doc.
- On-chain calls (T5) — Pact meta defaults (`chainId: "0"`, `gasLimit: 1500`, `gasPriceAnu: 10000`
  converted via `runtime.anuToStoa(...)`, `ttl: 600`) sourced from `@ancientpantheon/khronoton-
  core`'s own cronoton-builder UI initial-state literals (`makeEmptyBuilderState`), not invented.
  `senderAccount` (not `sender`) is the correct `setMeta` field name, confirmed against both
  khronoton-core's internal `buildTransaction` and `@stoachain/kadena-stoic-legacy`'s `setMeta`
  reducer type. Namespace-qualified reference form confirmed as `ouronet-ns.PYTHIA.*` against a real
  working caller found in `constructors/Codex/packages/codex-ouronet/src/zbom/pythia/
  deployApiKey.ts` — note that same file's actual deploy call uses a DIFFERENT function name/arity
  (`ouronet-ns.TS01-C4.PYTHIA|C_DeployApiKey patron owner-account apollo-account public`), which
  reinforces rather than resolves the standing "VERIFY AGAINST THE LIVE PYTHIA.pact MODULE" flag on
  `deployApolloHalf`/`linkDualApiKey`'s Pact-code strings — the exact parameter list for
  `C_DeployApolloPythiaApiKey` used in this codebase (`owner-account, apollo-public, is-standard`)
  remains unverified against the live chain and must be confirmed before this path is ever
  triggered, per the standing hard constraint that it never fires in this run regardless.
- Onboarding orchestration (T6) — `ownerAccount` for both `deployApolloHalf` calls (Standard half's
  own deploy, and the Smart half's deploy) reuses the Standard public key as the paying/owning
  account, rather than introducing a second "owner" concept — a literal reading of the plan's single
  `ownerAccount` identifier reused across both steps. `startOnboarding()`'s double-start guard is a
  from-scratch design (no existing precedent in this codebase — `app/api/admin/deploy/route.ts` has
  none, since a re-run there is non-destructive; this one is not, so the status file's `stage` field
  itself is the guard: anything other than `"idle"`/`"failed"` throws).
- Raw-public-key vs. `₱./Π.`-address bug fix (post-ship adversarial review, confirmed HIGH severity)
  — `ensureConnectorApolloPair()` (T4) previously returned only the raw base-49 `publicKey` for each
  half, and `runOnboarding()` (T6) fed that raw value straight into `connectorStatus.standardApollo`/
  `smartApollo` AND into `getConnectorForHalf(...)` at the `proving-standard`/`proving-smart` stages.
  Pythia's real `/connectors/auth/*` endpoints reject anything that isn't exactly a 162-char,
  `₱./Π.`-prefixed address — so every real run would spend real STOA through
  `deploying-standard`/`deploying-smart`/`linking` (all on-chain, all before the first stage that
  would ever hit this), then structurally fail at `proving-standard` with no way to reach
  `"success"`. Fixed by making `ensureConnectorApolloPair()` return BOTH representations —
  `standardPublicKey`/`smartPublicKey` (raw, unchanged) plus new `standardAddress`/`smartAddress`
  (`₱./Π.`-prefixed, via `Apollo.publicKeyToAddress(publicKey, isSmart)` —
  `@stoachain/stoa-core/dalos`, the same primitive `apolloSigner.ts` already used for this) — and
  routing each representation to its correct consumer in `runOnboarding()`: the raw public keys still
  go to `deployApolloHalf`/`linkDualApiKey` (on-chain Pact calls — confirmed against
  `lib/khronoton/keyResolver.ts`'s `getKeyPairByPublicKey`, which indexes `pureKeypairs`/`ouroAccounts`
  by their raw `publicKey`/`address` fields respectively and would reject an address it doesn't
  index), while the addresses now go to `connectorStatus` and `getConnectorForHalf` (the HTTP wire
  protocol leg). `apolloSigner.ts`'s `MnemosyneApolloSigner.sign` had the same root bug from the
  other side: it matched `pureKeypairs` entries by raw `publicKey` (which no caller will ever pass
  again now that `apolloAccount` is always an address) and signed a message built from an
  independently re-derived `expectedAddress` rather than the `apolloAccount` value actually
  requested — fixed to match `pureKeypairs`/`ouroAccounts` entries by their derived/stored ADDRESS
  only, and to sign `input.apolloAccount` verbatim after confirming (not assuming) it equals the
  entry's own freshly re-derived address, so there is no seam left for the signed message to diverge
  from what was actually asked to be signed for.
- **SUPERSEDED / CORRECTED (2026-08-01, see `../pythia-connector-rework/`):** the "On-chain
  Apollo-curve signing gap" recorded below was a NON-PROBLEM born of a wrong premise — no Apollo key
  ever signs a Pact transaction. Pythia's own self-consumer implementation (and Codex's
  `ActivateApolloPythiaKey` tab) deploy the Apollo key on-chain by signing with an ORDINARY Kadena
  payment key, passing the Apollo account as plain data. The `pythia-connector-rework` topic deleted
  `onboardingChain.ts`/`onboardingJob.ts`/`apolloIdentity.ts` entirely and moved on-chain deploy to
  Codex's tab. The stale analysis is retained below only as a record of the earlier (incorrect)
  conclusion.
- On-chain Apollo-curve signing gap (post-ship adversarial review, CONFIRMED CRITICAL/HIGH) —
  `onboardingChain.ts`'s on-chain leg (`deployApolloHalf`/`linkDualApiKey`) resolves signing
  keypairs via `createMnemosyneKeyResolver().getKeyPairByPublicKey(...)`
  (`lib/khronoton/keyResolver.ts`) for the connector's OWN Standard/Smart Apollo public keys
  (`ensureConnectorApolloPair()`, T4) — but those are `dalos-apollo` Schnorr-v2-curve keys stored
  as base-49 scalars, not Kadena-native Ed25519 keys, and `keyResolver.ts`'s `assertHexSecret`
  rejects any decrypted `pureKeypairs` secret that isn't raw hex before a transaction is ever
  built. Investigated with real rigor, not guessed away:
  - **No Pact-command signing support for Apollo/Schnorr exists anywhere in this monorepo.**
    Confirmed directly against the installed packages: `@stoachain/stoa-core/dist/signing/
    universalSign.d.ts`'s `UniversalKeypair.seedType` union is `"koala" | "chainweaver" |
    "eckowallet" | "foreign"` — no apollo/Schnorr variant. The vendored `@kadena/client` fork
    (`@stoachain/kadena-stoic-legacy/dist/types/PactCommand.d.cts`) declares its own
    `SignerScheme` type as `'ED25519'` only (the doc comment above it even says "ETH is also
    supported," but the type itself doesn't list it either — this vendored fork has never grown
    beyond upstream `@kadena/client`, confirmed byte-identical per its own CHANGELOG/README).
    `grep -rli "apollo|schnorr|dalos"` across both packages' `dist/` output returns nothing
    signing-related. The only real, working Apollo-signing code anywhere in this repo,
    `lib/pythia/apolloSigner.ts`, signs a short off-chain challenge message (§1c's proof-of-
    possession protocol) — a fundamentally different operation from signing a chainweb command.
  - **`universalSignTransaction`'s runtime dispatch does not throw cleanly for an unrecognized
    seed type — it silently falls into the Ed25519 `tweetnacl` signing lane.** Read directly
    (`@stoachain/stoa-core/dist/signing/universalSign.js`): the only special-cased branch is
    `seedType === "chainweaver" || "eckowallet"`; everything else — including a hypothetical
    `"dalos-apollo"` seedType, which doesn't even exist in `keyResolver.ts`'s hardcoded output
    (it always returns `seedType: "koala"` for `pureKeypairs` entries, regardless of the actual
    key's real curve) — is pushed into `naclPairs` and signed via `tweetnacl.sign.detached`
    (`cryptography-utils/signHash.cjs`), an Ed25519-only primitive. The ONLY thing standing
    between this code path and a silently-wrong signature today is `assertHexSecret`'s hex-format
    check, which happens to reject Apollo's base-49 shape as a byproduct, not a deliberate scheme
    check.
  - **No working example of an Apollo-keyed Pact transaction being submitted to StoaChain exists
    in `constructors/Pythia` or `constructors/Codex`.** Broad grep for "Apollo" across both repos
    turned up only off-chain challenge-signing code (`codex-ouronet/src/apollo-verify/*`) and read
    paths (`readApolloPublicKey`/`readApolloCounterpart`) — never a signer for a Pact command.
  - **The "different account signs, Apollo keys as data" alternative is real but NOT confirmed
    for THIS module.** Pythia's own `A_LinkDualApiKey` cronoton
    (`constructors/Pythia/apps/pythia/src/automaton/khronoton/dualLinkActivateResolver.ts`) is a
    genuine, live, working precedent for exactly this shape: its pact code is
    `(…PYTHIA|A_LinkDualApiKey (read-msg "standardApollo") (read-msg "smartApollo"))` — the Apollo
    accounts are plain `read-msg` DATA, and the actual signer is Pythia's own Kadena-native
    `pythia-cronoton-keyset` (per `docs/work/connector-activation-resolver/design.md`'s "What's
    already confirmed reusable" section), never an Apollo key. But `A_LinkDualApiKey` is a
    DIFFERENT function with different authority (Pythia's own automaton activating a pair on its
    own behalf, after independently verifying off-chain proof) from `C_DeployApolloPythiaApiKey`/
    `C_LinkDualApiKey` (organs/06 §1a: "user-called", "requires both half-owners' authorization"),
    which read as though the Apollo identity itself must authorize its own deploy/link — and this
    module's own `ownerAccount` (T6, `onboardingJob.ts`) is currently just the Standard Apollo
    public key reused, not a distinct Kadena-native account, so there is no existing candidate
    account in this codebase to redirect signing to even if that reading is right. Guessing either
    the scheme or the account would risk producing a signature that "looks like" it worked without
    being cryptographically correct — worse than a clean, loud failure.
  - **Fix taken: honest documentation, not a speculative crypto fix.** `buildSignAndRelay`
    (`onboardingChain.ts`) now wraps any key-resolution failure for a signer public key in a
    specific error explaining the Apollo-curve/Ed25519-only mismatch (`explainApolloKeyResolutionFailure`),
    preserving the resolver's original message rather than leaking `keyResolver.ts`'s generic
    "codex entry shape has drifted" text, which was misleading for this exact root cause. A
    prominent doc comment sits directly above `buildSignAndRelay`, alongside the existing "VERIFY
    AGAINST THE LIVE PYTHIA.pact MODULE" comments on the two pact-code builders, marking this as a
    second, independent, unresolved gap of at least equal severity. `tests/
    pythia-onboarding-chain.test.ts` gained two tests reproducing `keyResolver.ts`'s real, verbatim
    hex-shape rejection message and asserting the wrapped error names the Apollo-curve mismatch
    while still surfacing the underlying cause. **This code path remains unsafe to trigger live**
    until a human with StoaChain domain expertise / live chain access resolves either (a) whether
    StoaChain's Pact fork actually supports a Schnorr/Apollo signer scheme the client-side vendored
    library simply hasn't been updated for, or (b) which Kadena-native account (if any) is meant to
    be the actual signer for `C_DeployApolloPythiaApiKey`/`C_LinkDualApiKey`, with Apollo public
    keys passed as data only.
- Shared codex-snapshot helper (same fix pass) — `apolloIdentity.ts` and `apolloSigner.ts` had each
  grown their own private copy of the "unseal codex backup → null-check → `JSON.parse` as
  `CodexSnapshot`, plus defensive `pureKeypairs`/`ouroAccounts` array accessors" trio (a third,
  pre-existing copy already lives in `lib/khronoton/keyResolver.ts`, deliberately left untouched —
  out of scope for this feature). Extracted the two NEW files' shared copy into
  `lib/pythia/codexSnapshot.ts` (`loadCodexSnapshot(notInitializedMessage)`, `pureKeypairsOf`,
  `ouroAccountsOf`); both files now import and use it instead of their own private duplicates. The
  not-initialized error message stays a caller-supplied string (not a single generic message) so each
  call site keeps naming the specific feature that needs the codex, matching each site's original
  wording exactly.
