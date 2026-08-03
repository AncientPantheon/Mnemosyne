# Pythia connector-auth — rework to mirror Pythia's self-consumer pattern — Design

Supersedes the connector-auth approach shipped in v0.9.0 (`docs/work/pythia-connector-auth/`).

## Problem

Mnemosyne's connector-auth (`lib/pythia/*`, v0.9.0) was built against `@ancientpantheon/pythia-client`
`2.3.0` and **before** Pythia implemented itself as a self-consumer of its own connector protocol.
As a result it **hand-rolled three things Pythia's own automaton later proved must not be
hand-rolled**, and its on-chain leg is dead-coded as unrunnable:

- `lib/pythia/apolloSigner.ts` re-implements Apollo ownership signing by hand (derive keypair from
  the decrypted secret, `Apollo.sign`) instead of delegating to Codex's `autoSignApolloChallenge`.
- `lib/pythia/apolloIdentity.ts` **generates the Apollo pair locally** (`deriveDoubleApollo` + writes
  `pureKeypairs` into the codex) — the exact anti-pattern Pythia's `self-connector-codex-signing`
  design explicitly retired ("should never generate or hold its own Apollo keypair locally").
- `lib/pythia/onboardingChain.ts` hand-rolls `C_DeployApolloPythiaApiKey`/`C_LinkDualApiKey` Pact
  strings and tries to sign them **with the Apollo keys**, which is a fabricated premise — it hits a
  self-made wall and is guarded off as "MUST NOT BE TRIGGERED LIVE." (The real mechanism: the deploy
  is signed by an ordinary **Kadena payment key**, Apollo account passed as data, done by **Codex's
  own `ActivateApolloPythiaKey` admin tab**; the link is Pythia-mediated server-side.)
- `lib/pythia/connectorClient.ts` composes two raw `PythiaConnector`s (2.3.0) instead of one
  `DualLinkConnector` (2.7.x), the current pair-level connector abstraction.

Reference (the correct pattern): `constructors/Pythia/apps/pythia/src/automaton/{codexApolloSigner,
selfApollo,selfConnectorLoop}.ts` + `connectors/self/`, and the `pythia-self-consumer` /
`self-connector-dual-link` / `self-connector-codex-signing` designs.

## Approach

Rework `lib/pythia/*` and the `/admin#pythia` panel to mirror Pythia's self-consumer, adapted for a
real **external** consumer (Mnemosyne dials the real Pythia gateway over real `fetch`; it is NOT the
in-process read engine, so Pythia's `createInProcessFetch` shortcut does not apply).

1. **Bump `@ancientpantheon/pythia-client` `^2.3.0 → ^2.7.0`** (2.7.17 published + `latest`, already
   running in production via auto-adopt). This provides `DualLinkConnector`, `DualLinkConnectorOptions`,
   `splitDualLinkKey`, `DualLinkStatus`, `maskSecret`, `APOLLO_ACCOUNT_LEN`.

2. **Rewrite `lib/pythia/apolloSigner.ts`** to a thin `autoSignApolloChallenge` delegate mirroring
   Pythia's `createCodexApolloSigner`: load the sealed codex snapshot (`JSON.parse(loadBackup())`) +
   machine password (`getOrCreateCodexPassword()`), call
   `autoSignApolloChallenge(snapshot, codexPassword, apolloAccount, nonce, rp)` (from
   `@ancientpantheon/codex/ouronet`, already in Mnemosyne's codex 0.8.0), return `{ signature: sig }`.
   Deletes the hand-rolled `@stoachain` derivation. This is the ApolloSigner both halves use.

3. **Delete** `lib/pythia/apolloIdentity.ts`, `lib/pythia/onboardingChain.ts`,
   `lib/pythia/onboardingJob.ts` outright. Identity generation + on-chain deploy are done by **Codex's
   own `ActivateApolloPythiaKey` tab, which Mnemosyne already mounts** (`app/admin/codex/
   MnemosyneCodex.tsx` → `CodexUiRoot`; codex 0.8.0's `/ui` contains the flow). Mnemosyne builds and
   signs **no** Pact transactions for this — the whole "Apollo signs a Pact tx" gap disappears because
   it was never real.

4. **Rework `lib/pythia/connectorClient.ts`** to build ONE `DualLinkConnector` from a stored
   dual-link-key: `new DualLinkConnector({ dualLinkKey, baseUrl: readAdminSettings().pythiaUrl,
   standardSigner, smartSigner, fetchImpl: <real fetch> })`, where `standardSigner`/`smartSigner`
   are the reworked `autoSignApolloChallenge` delegate bound to each half's account (split via
   `splitDualLinkKey(dualLinkKey)`). `getGatedPythiaClient()` returns a `PythiaClient` with
   `pythiaKey: dualLinkConnector.keyProvider()` (request-time refresh — the chosen shape; Mnemosyne is
   a pull consumer, no background loop) when a dual-link-key is stored, else a plain unattributed
   client (unchanged additive-only guarantee).

5. **Persist ONLY the pasted dual-link-key** (`connectorStatus.ts`, simplified). Verified from the
   real 2.7.17 `.d.ts`: `DualLinkConnectorOptions` accepts **no `SecretStorage`** — the connector
   holds the ephemeral `x-pythia-key` **in memory** and re-mints it via the codex-backed signers when
   near expiry (cached within its ~3h window; a process restart just re-proves on the first gated
   request). This matches Pythia's `SelfConnectorLoop`, which injects no storage. Consequences:
   - **Delete `connectorSecretStore.ts`** — it's unused under the `DualLinkConnector` model. The
     codex (sealed, server-held, auto-unlocked) remains the only persistent secret custody; the
     3h-TTL ephemeral key does not need sealing at rest.
   - The dual-link-key is the two Apollo **account addresses** joined by `|`
     (2×`APOLLO_ACCOUNT_LEN`+1 = 325 chars) — public identifiers, NOT private material — so it lives
     in the plain status store (`data/…json`). Status collapses to a derived `not-linked | pending |
     active` from `DualLinkConnector.status()` (stored key, no active secret yet = pending; active
     secret = active; no key = not-linked).

6. **Rework the `/admin#pythia` panel** (`app/admin/pythia/PythiaPage.client.tsx`): remove the
   "Start onboarding" button + stage machine. New flow, mirroring Pythia's self-connector panel:
   (a) a short instruction pointing the operator at the **Codex tab** to generate the Standard+Smart
   pair and click "Activate as Pythia Key" per half; (b) a **paste-the-dual-link-key** field
   (validated with `splitDualLinkKey`, rejected if either half isn't held by the unlocked codex);
   (c) once stored, the live status — masked secret via `maskSecret(status().secret)` + expiry
   countdown from `status().expiresAt`, plus per-half `DualLinkHalfStatus`. Keep the existing
   gateway-URL setter section above it untouched.

Alternatives considered:
- **Targeted fix (only rewrite `apolloSigner.ts`)** — rejected as the default: leaves the broken
  generation/deploy/onboarding and the 2.3.0 two-connector composition in place, still not matching
  Pythia. (Offered to the user as a fallback.)
- **Periodic `SelfConnectorLoop`-style background loop** — rejected for Mnemosyne: it's a pull
  consumer with no scheduled self-calls; request-time `keyProvider()` is simpler and SDK-blessed.
  (Pythia needs the loop only because nothing calls its own client on a schedule.)

## Acceptance criteria

- [ ] `@ancientpantheon/pythia-client` is pinned `^2.7.0`; `DualLinkConnector`/`splitDualLinkKey`/
      `maskSecret` import from it.
- [ ] `lib/pythia/apolloSigner.ts` delegates to `autoSignApolloChallenge` and contains no
      hand-rolled Apollo derivation / `Apollo.sign` / `smartDecrypt`-then-derive.
- [ ] `lib/pythia/apolloIdentity.ts`, `onboardingChain.ts`, `onboardingJob.ts` are deleted, and
      nothing imports them (grep clean); no Pact-transaction building for the connector remains in
      `lib/pythia/`.
- [ ] `lib/pythia/connectorClient.ts` builds ONE `DualLinkConnector` (real `fetch`, per-half
      `autoSignApolloChallenge` signers) and `getGatedPythiaClient()` wires `keyProvider()` into
      `PythiaClient`; with no stored dual-link-key it returns a plain unattributed client without
      throwing (additive-only preserved).
- [ ] The pasted dual-link-key is persisted (plain, non-secret) and validated with `splitDualLinkKey`;
      `connectorSecretStore.ts` is deleted (the `DualLinkConnector` holds the ephemeral secret in
      memory and re-mints via the codex-backed signers — no `SecretStorage` injection point exists).
- [ ] `POST /api/admin/pythia-connector` no longer starts an on-chain onboarding job; the connector
      admin surface accepts a dual-link-key paste and reports live status (masked secret + expiry).
      No admin route builds or triggers an on-chain Pact transaction.
- [ ] `vitest` (tests reworked for the new surface — old onboarding-chain/identity/job tests removed,
      new signer-delegation + dual-link-key + connector-client tests added), `tsc`, and `next build`
      all green.
- [ ] The `docs/work/pythia-connector-auth/design.md` Decisions "open Apollo-Pact-signing gap" note
      is superseded/corrected (it was a non-problem).

## Out of scope

- Any change to Codex's own `ActivateApolloPythiaKey` tab / generation UI (already correct; Mnemosyne
  already mounts it).
- Pythia's in-process `fetchImpl` shortcut (Pythia-only).
- A background refresh loop (request-time `keyProvider()` chosen).
- Actually generating/activating an identity or pasting a real dual-link-key (operator action).

## Decisions

- Chosen defaults (user was away at the scope prompt): full rework; request-time `keyProvider()` (no
  background loop). Flagged in the report so they can redirect.
- The dual-link-key is public account identifiers → plain storage; only the `x-pythia-key` secret is
  sealed. Confirmed from `APOLLO_ACCOUNT_LEN`/`splitDualLinkKey` semantics.
