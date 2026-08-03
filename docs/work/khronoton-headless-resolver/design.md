# Khronoton headless KeyResolver delegation — Design

Topic 2 of the `pythia-verifier-alignment` project — see `../pythia-verifier-alignment/design.md`
for the umbrella problem statement and the Phase-1 gap report.

## Problem

`automatons/Mnemosyne/lib/khronoton/keyResolver.ts` hand-rolls key derivation with a koala-only /
hex-only assumption: an `assertHexSecret` regex (`/^[0-9a-fA-F]{64}$|^[0-9a-fA-F]{128}$/`),
hardcoded `seedType: "koala"` on the pure- and ouro-account paths, and a `fromSeedAccount` that
re-derives EVERY seed through the koala SLIP-10 lane (`kadenaMnemonicToSeed` +
`kadenaGenKeypairFromSeed`). A `chainweaver` / `eckowallet` seed (a BIP32-Ed25519 WASM scheme)
derives a *different* key under koala SLIP-10, trips the wrong-key guard, and the resolver **refuses
to sign** — so Khronoton's autonomous tick loop silently cannot sign for any non-koala operator seed.
This is the exact latent bug the Pantheonic doc `organs/05-khronoton-engine-wire-in.md` (CHANGELOG
2026-08-03) names: "Mnemosyne carries the identical latent bug … and should adopt the delegation
too." A second, related gap: neither the resolver nor `createMnemosyneSignerSource()` filters codex
accounts to Kadena pubkeys, so Apollo `<len>.<xy>` keys can leak into the Kadena signer set.

## Approach

**Delegate all derivation to Codex's own headless, seedType-complete resolver, mirroring Pythia's
proven implementation** (`constructors/Pythia/apps/pythia/src/automaton/khronoton/keyResolver.ts`,
which fixed this exact bug). Codex `0.8.0+` exports a pre-bound, **server-safe** (no React/DOM/
zustand — the `/ouronet` subpath, unlike `/ui`) Kadena `KeyResolver`:
`createHeadlessKadenaResolver({ loadSnapshot, getPassword }): KeyResolver` — it binds ALL `@stoachain`
crypto internally (koala / chainweaver / eckowallet / pure-foreign, with the wrong-key refusal guard)
and the consumer binds none. The returned object drops straight into the Khronoton engine's
`KeyResolver` seam.

**The change, mirroring Pythia (do not re-invent):**
1. Bump `@ancientpantheon/codex` `^0.6.1 → ^0.8.0` in `package.json` and refresh the lockfile
   (`createHeadlessKadenaResolver` is absent from 0.6.1; it lands in 0.8.0, which is published +
   `latest`). Note production already auto-adopts codex `@latest` on every deploy — the next deploy
   pulls 0.8.0 into the image regardless of this code change, so bumping the pin deliberately and
   validating the whole tree under test is strictly safer than letting a deploy float it silently.
2. Rewrite `createMnemosyneKeyResolver()` to build
   `delegate = createHeadlessKadenaResolver({ loadSnapshot, getPassword: getOrCreateCodexPassword })`
   (Mnemosyne's `loadSnapshot`/`getOrCreateCodexPassword` are async; the thunks accept
   `T | Promise<T>`). Delegate `getKeyPairByPublicKey`/`listCodexPubs` to it.
3. **Delete** `fromSeedAccount`, `assertHexSecret`, the `kadenaMnemonicToSeed`/
   `kadenaGenKeypairFromSeed`/`kadenaDecrypt` imports, and the three `seedType: "koala"` hardcodes.
4. **Keep a thin ouro-account fallback** — Codex's headless resolver reads only
   `{ kadenaSeeds, pureKeypairs }`, NOT `ouroAccounts`, so ouro accounts (which Mnemosyne's current
   resolver does sign for, via a koala hex secret) must stay resolvable. Mirror Pythia's `ouroFallback`:
   direct `smartDecrypt(acc.secret, password)`, reached ONLY when the delegate throws
   `CodexKeyMissingError` (import it from `@ancientpantheon/codex/ouronet`) — never mask other errors.
5. **Add the Kadena-only pubkey filter** `isKadenaPublicKey` (`/^[0-9a-fA-F]{64}$/` on the bare
   pubkey) to `listCodexPubs`, the ouro fallback, AND `createMnemosyneSignerSource()`'s descriptor
   list — so Apollo keys never enter the Kadena signer set.
6. **Map the `IKadenaKeypair` shape delta**: Codex returns `seedType?` / `encryptedSecretKey: unknown`;
   Khronoton's seam wants `seedType: string` / `encryptedSecretKey?: string`. Map with
   `seedType: kp.seedType ?? "koala"` and a narrow `encryptedSecretKey as string | undefined` cast
   (exactly as Pythia does).
7. In `listCodexPubs`, read the snapshot **sequentially before** awaiting `delegate.listCodexPubs()`
   — never both inside one `Promise.all` (Pythia documents a real unhandled-rejection hazard, since
   `loadSnapshot` throws synchronously on an uninitialized codex).

**Behavior-preservation reasoning (this touches LIVE autonomous signing).** For koala keys, Codex's
headless resolver derives identically to the current hand-roll — behavior-preserving. For
chainweaver/eckowallet, the current resolver is *broken* (refuses to sign); delegation *fixes* it.
Ouro accounts stay covered by the fallback. So no currently-working signing path regresses; the
change either preserves or fixes.

Alternatives rejected:
- **Wire codex 0.6.1's low-level `createHeadlessCodexResolver` with hand-bound crypto seams** (avoids
  the version bump) — rejected: it forces Mnemosyne to bind all six `@stoachain` crypto deps itself
  (the exact thing the doc steers away from) and has a 3-arg method shape not assignable to the seam.
  The version bump is happening on the next deploy anyway.
- **Leave it koala-only** — rejected: it's the CHANGELOG-flagged drift and silently breaks non-koala
  operator seeds.

## Acceptance criteria

- [ ] `@ancientpantheon/codex` is pinned `^0.8.0` in `package.json`; the lockfile resolves 0.8.0;
      `createHeadlessKadenaResolver` and `CodexKeyMissingError` import from `@ancientpantheon/codex/ouronet`.
- [ ] `lib/khronoton/keyResolver.ts` contains NO `assertHexSecret`, NO `seedType: "koala"` hardcode
      on the pure/seed paths, and NO `fromSeedAccount`/`kadenaMnemonicToSeed`/`kadenaGenKeypairFromSeed`
      derivation; `getKeyPairByPublicKey`/`listCodexPubs` delegate to the headless resolver.
- [ ] A thin ouro-account fallback remains, reached only on `CodexKeyMissingError`, that resolves an
      ouro account's koala hex secret via `smartDecrypt` (ouro signing is not lost).
- [ ] `isKadenaPublicKey` (`/^[0-9a-fA-F]{64}$/`) filters `listCodexPubs`, the ouro fallback, and
      `createMnemosyneSignerSource()` — Apollo `<len>.<xy>` keys never appear in the Kadena signer set
      (asserted by a test feeding a snapshot containing an Apollo pubkey and checking it's excluded).
- [ ] `tests/khronoton-key-resolver.test.ts` updated: koala pure/seed/ouro accounts still resolve to
      a signable keypair through the new delegation; a non-koala (chainweaver/eckowallet) seed that
      the OLD code would have refused now resolves (or is covered by a test asserting delegation is
      invoked rather than the koala hand-roll); an Apollo pubkey is filtered out of the signer set.
- [ ] The codex bump does not regress other codex consumers: `/apollo-verify` (Topic 1's guard test
      still green), the `/codex` mount, and the connector-auth (`apolloSigner`/`apolloIdentity`) all
      still build and their tests pass.
- [ ] `npx vitest run`, `npx tsc --noEmit` (no NEW errors vs the pre-change baseline), and
      `npx next build --webpack` are all green against codex 0.8.0.

## Out of scope

- The Apollo-curve-Pact-signing onboarding gap (`deployApolloHalf`/`linkDualApiKey` needing Apollo
  keys to sign Pact transactions) — the headless resolver is Kadena-key-only; that gap stays open and
  tracked in `pythia-connector-auth`.
- Any Khronoton engine / tick-loop change beyond the KeyResolver + SignerSource seams.
- The Tier-3 Khronoton admin addressability drift (separate pre-existing gap in the umbrella report).

## Decisions

- Mirror Pythia's resolver structurally rather than designing a fresh delegation — it is the live,
  reviewed reference for this exact fix; divergence is risk with no upside.
- Do the codex bump deliberately + under test rather than relying on the next deploy's silent
  `@latest` float — the whole aggregate moving 0.6.1→0.8.0 is a real integration surface (verifier,
  /codex mount, connector-auth all consume it) that must be validated, not discovered in production.
