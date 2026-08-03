# Pythia connector-auth rework — Plan

Supersedes the v0.9.0 connector-auth. Deletes the hand-rolled generation/deploy/onboarding, delegates
signing to Codex, and adopts `DualLinkConnector`. One coherent rework kept as a single topic (its 4
dependency waves are natural sequencing, not sub-features to split). Reference to mirror throughout:
`constructors/Pythia/apps/pythia/src/automaton/{codexApolloSigner,selfApollo,selfConnectorLoop}.ts`.
Version bump + CHANGELOG + superseding the old Decisions note are closing steps (build/review gate +
final commit), not plan tasks.

## Wave 1

- [x] T1: Bump `@ancientpantheon/pythia-client` `^2.3.0 → ^2.7.0` and validate the SDK bump in
      isolation (no code change). Edit `package.json` and `npm install @ancientpantheon/pythia-client@^2.7.0
      --no-audit --no-fund` to refresh the lockfile (2.7.17 is published + `latest`).
      — done when: `node -e "console.log(require('@ancientpantheon/pythia-client/package.json').version)"`
      prints `2.7.x`; `grep -oE "DualLinkConnector|splitDualLinkKey|maskSecret"
      node_modules/@ancientpantheon/pythia-client/dist/index.d.ts` shows all three; `npx vitest run`
      is green on the OLD code against the new SDK (the old `PythiaConnector`/`ApolloSigner`/
      `SecretStorage` exports still exist in 2.7.x, so nothing should break yet — if something does,
      STOP and report, it's an SDK-compat problem distinct from the rework); `npx tsc --noEmit`
      records the baseline error count (was 66); `npx next build --webpack` compiles clean.
  - files: `package.json`, `package-lock.json`

## Wave 2 (depends on Wave 1)

- [x] T2: Rewrite `lib/pythia/apolloSigner.ts` to a thin `autoSignApolloChallenge` delegate,
      mirroring `constructors/Pythia/apps/pythia/src/automaton/codexApolloSigner.ts` (read it first).
      Export a factory `createMnemosyneApolloSigner(apolloAccount: string): ApolloSigner` (import
      `ApolloSigner` from `@ancientpantheon/pythia-client`) whose `sign({nonce, rp})` (or
      `sign({apolloAccount, nonce, rp})` per the SDK interface — match the installed 2.7.x
      `ApolloSigner` shape exactly): load the sealed snapshot via
      `loadCodexSnapshot()` (`lib/pythia/codexSnapshot.ts`, keep it) + `getOrCreateCodexPassword()`
      (`lib/mnemosyneCodexStore.ts`), call
      `autoSignApolloChallenge(snapshot, codexPassword, apolloAccount, nonce, rp)` (dynamic-import from
      `@ancientpantheon/codex/ouronet` — present in installed codex 0.8.0), return `{ signature: sig }`.
      DELETE all hand-rolled derivation (`createDefaultRegistry`/`Apollo`/`createOuronetAccount`/
      `smartDecrypt`-then-derive/inlined `buildApolloOwnershipMessage`). Rework
      `tests/pythia-apollo-signer.test.ts` to prove the delegate: against a fixture codex snapshot
      holding an Apollo ouroAccount, `sign` returns a `{signature}` that `Apollo.verify` accepts for
      the canonical message (or, if verifying is heavy, assert it delegates to `autoSignApolloChallenge`
      and returns its `sig`). Confirm the exact `autoSignApolloChallenge` snapshot/param shape against
      the installed `@ancientpantheon/codex/dist/ouronet/index.d.ts`.
      — done when: `npx vitest run tests/pythia-apollo-signer.test.ts` passes;
      `grep -nE "createOuronetAccount|Apollo\.sign|createDefaultRegistry" lib/pythia/apolloSigner.ts`
      is empty; `grep -q autoSignApolloChallenge lib/pythia/apolloSigner.ts` succeeds.
  - files: `lib/pythia/apolloSigner.ts`, `tests/pythia-apollo-signer.test.ts`, (reads `lib/pythia/codexSnapshot.ts`)

- [x] T3: Simplify `lib/pythia/connectorStatus.ts` to persist ONLY the operator-pasted dual-link-key
      (the two Apollo account addresses, public — NOT secret) plus derivable metadata. Replace the
      old multi-stage `ConnectorStage` machine with: `interface ConnectorState { dualLinkKey: string
      | null; standardApollo: string | null; smartApollo: string | null; linkedAt: string | null }`.
      `readConnectorState()` / `writeConnectorState()` (plain JSON at the existing path, fail-safe,
      never throws — same idiom as `lib/adminSettings.ts`). `clearConnectorState()` removes the stored
      key. Rework `tests/pythia-connector-status.test.ts` for the new shape (default empty state,
      round-trip, corrupt-file → default). NOTE: the derived "not-linked | pending | active" status is
      computed at read time from the live `DualLinkConnector.status()` in T4/T5, not stored here.
      — done when: `npx vitest run tests/pythia-connector-status.test.ts` passes with the new shape;
      no `ConnectorStage`/`"deploying-"`/`"proving-"` strings remain in the file.
  - files: `lib/pythia/connectorStatus.ts`, `tests/pythia-connector-status.test.ts`

## Wave 3 (depends on Wave 2)

- [ ] T4: Rework `lib/pythia/connectorClient.ts` around ONE `DualLinkConnector`, and DELETE the
      superseded hand-rolled modules + their tests. Read the reference
      `constructors/Pythia/apps/pythia/src/automaton/selfConnectorLoop.ts` and the installed 2.7.x
      `dualLinkConnector.d.ts`/`dualLinkKey.d.ts` first.
      - New `connectorClient.ts`: a memoized `getDualLinkConnector(): DualLinkConnector | null` — reads
        `readConnectorState()` (T3); if `dualLinkKey` is null returns null; else builds `new
        DualLinkConnector({ dualLinkKey, baseUrl: readAdminSettings().pythiaUrl, standardSigner:
        createMnemosyneApolloSigner(halves.standardApollo), smartSigner:
        createMnemosyneApolloSigner(halves.smartApollo) })` (halves via `splitDualLinkKey`; default
        `fetchImpl` = the real global `fetch` — do NOT inject an in-process shim; Mnemosyne dials the
        real gateway). Rebuild it when the stored key changes (compare the key you built from).
      - `getGatedPythiaClient(): PythiaClient`: if `getDualLinkConnector()` is null OR
        `readAdminSettings().pythiaUrl` is empty, return `new PythiaClient({ baseUrl })` with NO
        `pythiaKey` (unattributed, never throws — additive-only preserved); else return `new
        PythiaClient({ baseUrl, pythiaKey: connector.keyProvider() })`.
      - DELETE `lib/pythia/apolloIdentity.ts`, `lib/pythia/onboardingChain.ts`,
        `lib/pythia/onboardingJob.ts` and their test files `tests/pythia-apollo-identity.test.ts`,
        `tests/pythia-onboarding-chain.test.ts`, `tests/pythia-onboarding-job.test.ts`. DELETE
        `lib/pythia/connectorSecretStore.ts` and `tests/pythia-connector-secret-store.test.ts`
        (`DualLinkConnector` holds the ephemeral secret in-memory — no `SecretStorage` injection
        point). Grep the whole `automatons/Mnemosyne` tree to confirm nothing still imports any
        deleted module (fix any dangling importer — expect `connectorClient.ts` and the admin route to
        be the only ones, both reworked in this plan).
      - Rework `tests/pythia-connector-client.test.ts`: with no stored dual-link-key,
        `getGatedPythiaClient()` returns a client with no `pythiaKey` (mock/ spy the `PythiaClient`
        constructor); with a stored valid dual-link-key + a stubbed pythiaUrl, it builds a
        `DualLinkConnector`-backed client wired via `keyProvider()` (assert `DualLinkConnector` was
        constructed with the two split halves + the two signers).
      — done when: `npx vitest run tests/pythia-connector-client.test.ts` passes; `ls lib/pythia/`
      shows apolloIdentity/onboardingChain/onboardingJob/connectorSecretStore all GONE;
      `grep -rE "apolloIdentity|onboardingChain|onboardingJob|connectorSecretStore" automatons/Mnemosyne
      --include=*.ts --include=*.tsx | grep -v docs/` returns nothing; `npx vitest run` (full) green.
  - files: `lib/pythia/connectorClient.ts`, `tests/pythia-connector-client.test.ts`, and deletions of
    `lib/pythia/{apolloIdentity,onboardingChain,onboardingJob,connectorSecretStore}.ts` +
    `tests/pythia-{apollo-identity,onboarding-chain,onboarding-job,connector-secret-store}.test.ts`

## Wave 4 (depends on Wave 3)

- [x] T5: Rework the connector admin routes. `POST /api/admin/pythia-connector`
      (`app/api/admin/pythia-connector/route.ts`): ancient-gated (`requireAncient`, unchanged); accept
      body `{ dualLinkKey: string }`; validate via `splitDualLinkKey(dualLinkKey)` (returns 400 with
      the SDK's specific error message on a malformed key); OPTIONALLY confirm both halves are held by
      the unlocked codex (mirror Pythia's `setDualLinkKey` `codexHoldsAccount` guard — read
      `selfApollo.ts` for how it checks `ouroAccounts`; if that check needs the codex snapshot,
      reuse `loadCodexSnapshot()`); on success `writeConnectorState({ dualLinkKey, standardApollo,
      smartApollo, linkedAt })` and return `200 { ok: true }`. Add a `DELETE` that clears the stored
      key (`clearConnectorState()`), for un-linking. Remove ALL onboarding-job / `startOnboarding` /
      `acknowledgedSpend` logic. `GET /api/admin/pythia-connector/status`
      (`.../status/route.ts`): ancient-gated; return the stored state + the live derived status from
      `getDualLinkConnector()?.status()` — `{ linked: boolean, standardApollo, smartApollo, standard:
      DualLinkHalfStatus|null, smart: DualLinkHalfStatus|null, maskedSecret: string|null (via
      maskSecret when active), expiresAt: number|null }`. Rework `tests/pythia-connector-routes.test.ts`:
      401/403 gating on both; POST 400 on a malformed dualLinkKey; POST 200 stores a valid one (stub
      the codex-held check); DELETE clears; GET returns the status shape.
      — done when: `npx vitest run tests/pythia-connector-routes.test.ts` passes; no
      `startOnboarding`/`acknowledgedSpend`/`onboardingJob` reference remains in either route file.
  - files: `app/api/admin/pythia-connector/route.ts`, `app/api/admin/pythia-connector/status/route.ts`,
    `tests/pythia-connector-routes.test.ts`

- [x] T6: Rework the `/admin#pythia` connector panel in `app/admin/pythia/PythiaPage.client.tsx`
      (keep the existing gateway-URL section above it untouched). Replace the "Start onboarding"
      button + acknowledgement + stage polling with: (a) a short instruction line telling the operator
      to generate the Standard+Smart pair and click "Activate as Pythia Key" in the **Codex** tab
      (link/anchor to `/admin#codex`); (b) a textarea/input to paste the dual-link-key + a "Link"
      button that POSTs `{ dualLinkKey }` to `/api/admin/pythia-connector` (shows the 400 message on a
      bad key); (c) once linked, the live status polled from `GET /api/admin/pythia-connector/status`:
      both Apollo accounts, per-half pending/active, the **masked** secret + an expiry countdown, and
      an "Unlink" button (DELETE). Mirror the existing panel's fetch/poll/`mnemo-admin-*` conventions
      and `SecurityPage.client.tsx`'s idioms. Add/adjust `tests/pythia-admin-ui.test.ts`
      (source-contract style) asserting: references `/api/admin/pythia-connector` (+`/status`), has a
      dual-link-key paste affordance, points at the Codex tab, shows a masked secret, and has NO
      `acknowledgedSpend`/"Start onboarding"/stage-machine remnants.
      — done when: `npx vitest run tests/pythia-admin-ui.test.ts` passes with the new assertions;
      `grep -nE "acknowledgedSpend|Start onboarding|ensuring-identity|deploying-" app/admin/pythia/PythiaPage.client.tsx`
      is empty.
  - files: `app/admin/pythia/PythiaPage.client.tsx`, `tests/pythia-admin-ui.test.ts`
