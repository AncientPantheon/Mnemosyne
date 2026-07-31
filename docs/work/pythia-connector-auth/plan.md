## Wave 1
- [x] T1: Non-secret onboarding **status** store, `lib/pythia/connectorStatus.ts`, mirroring
      `lib/adminSettings.ts`'s fail-safe read/write idiom (own file, plain JSON, never throws —
      missing/corrupt file returns defaults). Export: `export type ConnectorStage = "idle" |
      "ensuring-identity" | "deploying-standard" | "deploying-smart" | "linking" |
      "proving-standard" | "proving-smart" | "success" | "failed";` and `export interface
      ConnectorStatus { stage: ConnectorStage; standardApollo: string | null; smartApollo: string |
      null; startedAt: string | null; updatedAt: string | null; lastError: string | null; }`.
      `export const CONNECTOR_STATUS_PATH = join(process.cwd(), "data", "pythia-connector-status
      .json");` `export function readConnectorStatus(filePath = CONNECTOR_STATUS_PATH):
      ConnectorStatus` (defaults: `{ stage: "idle", standardApollo: null, smartApollo: null,
      startedAt: null, updatedAt: null, lastError: null }` on missing/corrupt file — read failure
      NEVER throws, exactly like `readAdminSettings`). `export function writeConnectorStatus(status:
      ConnectorStatus, filePath = CONNECTOR_STATUS_PATH): void` (swallows write errors, same as
      `writeAdminSettings`). — done when: `npx vitest run tests/pythia-connector-status.test.ts`
      passes, covering: default status on missing file, round-trip write→read, corrupt-file falls
      back to defaults without throwing.
  - files: `lib/pythia/connectorStatus.ts`, `tests/pythia-connector-status.test.ts`
- [x] T2: Sealed **secret** store, `lib/pythia/connectorSecretStore.ts`, implementing the
      `@ancientpantheon/pythia-client` package's own `SecretStorage` interface (import the type from
      `@ancientpantheon/pythia-client`: `interface SecretStorage { load(): Promise<{secret: string;
      expiresAt: number} | null>; save(entry: {secret: string; expiresAt: number}): Promise<void>;
      clear(): Promise<void>; }`), backed by a sealed file mirroring `lib/mnemosyneCodexStore.ts`'s
      pattern exactly: a JSON-stringified `{secret, expiresAt}` sealed via `seal()`/`unseal()` from
      `lib/mnemosyneVault.ts` (`seal(plaintext: string): Promise<string>` /
      `unseal(sealed: string): Promise<string>`, both read `MNEMOSYNE_MASTER_KEY` fresh per call), at
      a new path `join(defaultCodexDir(), "pythia-connector-secret.sealed")` (reuse
      `defaultCodexDir()` from `lib/mnemosyneCodexStore.ts` — same directory as
      `password.sealed`/`backup.sealed`, so it rotates under the same `MNEMOSYNE_MASTER_KEY`
      lifecycle). `load()` returns `null` on a missing file, an unseal failure, or a JSON-parse
      failure (never throws — same defensive posture as every other store in this codebase).
      `save()` writes the sealed file (`writeFileSync`); `clear()` removes it if present (no-op if
      already absent). Export a class `MnemosyneConnectorSecretStore implements SecretStorage`.
      — done when: `npx vitest run tests/pythia-connector-secret-store.test.ts` passes, covering:
      `load()` returns `null` before any `save()`; `save()` then `load()` round-trips the exact
      `{secret, expiresAt}`; the file on disk is NOT plaintext (does not contain the raw secret
      string — assert the sealed file's bytes don't include the plaintext secret substring);
      `clear()` makes a subsequent `load()` return `null` again. Set `MNEMOSYNE_MASTER_KEY` to a
      valid 32-byte-base64 test value in `beforeAll`/`afterAll` (mirror how
      `tests/mnemosyne-vault.test.ts` or `tests/mnemosyne-rotation.test.ts` sets it up — read one of
      those first for the exact env-var setup idiom), and point at a temp directory (pass an
      explicit `baseDir`/`filePath` constructor option — do not write into the real `data/` dir from
      a test).
  - files: `lib/pythia/connectorSecretStore.ts`, `tests/pythia-connector-secret-store.test.ts`
- [x] T3: `lib/pythia/apolloSigner.ts` — implements `@ancientpantheon/pythia-client`'s `ApolloSigner`
      interface (`interface ApolloSigner { sign(input: {apolloAccount: string; nonce: string; rp:
      string}): Promise<{signature: string}>; }`, import the type from `@ancientpantheon/pythia-
      client`) entirely server-side, no human in the loop. Implementation: `getOrCreateCodexPassword
      ()` + `loadBackup()` (both from `lib/mnemosyneCodexStore.ts`) → `JSON.parse(backup)` as
      `CodexSnapshot` (type from `@ancientpantheon/codex/ouronet`) → find the account whose
      `publicKey` (in `pureKeypairs`) or `publicKey`/`address` (in `ouroAccounts`) matches
      `input.apolloAccount` → `smartDecrypt(entry.encryptedPrivateKey ?? entry.secret,
      codexPassword)` (from `@stoachain/stoa-core/crypto`, same call `lib/khronoton/keyResolver.ts`
      already makes — read that file first for the exact lookup-order/decrypt pattern to mirror) →
      `signApolloOwnership(account, secretPlaintext, input.nonce, input.rp)` (import from
      `@ancientpantheon/codex/ui` — VERIFIED empirically in this session: a plain Node ESM import of
      that subpath against the installed package, under this repo's actual vitest `environment:
      "node"` config, works cleanly — no browser-global crash, both `signApolloOwnership` and
      `buildApolloOwnershipMessage` callable and correct. It is NOT exported from `/ouronet` despite
      an earlier draft of this plan assuming so — use `/ui`, do not add a reimplementation
      fallback, this is confirmed not a risk.) → return `{signature:
      proof.sig}` (the `ApolloProof` shape is `{apollo: string; sig: string}` — `sig` is what the
      `ApolloSigner` interface's `signature` field maps to). Throw a clear `Error` (not silently
      return a bad signature) if no matching account is found in the snapshot, or if the codex isn't
      initialized (`loadBackup()` returns `null`) — mirror `keyResolver.ts`'s own error message
      style ("...populate it under /admin/codex before...").
      — done when: `npx vitest run tests/pythia-apollo-signer.test.ts` passes, covering: signs
      successfully against a fixture codex snapshot containing a matching account (write a small
      fixture backup JSON + `MNEMOSYNE_CODEX_DIR` pointed at a temp dir, following whatever fixture
      pattern `tests/khronoton-key-resolver.test.ts` already uses for `keyResolver.ts` — read that
      test file first and mirror its fixture-building approach exactly, since it's testing the
      identical lookup/decrypt path this task reimplements for a different downstream call); throws
      a clear error when the account isn't found; throws a clear error when the codex is
      uninitialized.
  - files: `lib/pythia/apolloSigner.ts`, `tests/pythia-apollo-signer.test.ts`
- [x] T4: `lib/pythia/apolloIdentity.ts` — ensures Mnemosyne's sealed codex has a dedicated
      Standard(`₱`)+Smart(`Π`) Apollo pair for the Pythia connector identity, creating one if
      absent. `export async function ensureConnectorApolloPair(): Promise<{standardPublicKey:
      string; smartPublicKey: string}>`. Behavior: `loadBackup()` + `getOrCreateCodexPassword()`
      (both from `lib/mnemosyneCodexStore.ts`) → parse the `CodexSnapshot` → look for a
      `pureKeypairs` entry already tagged for this purpose (add a `label: "pythia-connector-
      standard"` / `label: "pythia-connector-smart"` marker on creation — `IPureKeypair.label` is an
      existing optional field, confirmed in `@ancientpantheon/codex/ouronet`'s type — and search by
      that exact label on subsequent calls, so this is idempotent: a second call finds the existing
      pair instead of minting a new one). If not found: generate fresh seed material via
      `node:crypto`'s `randomBytes` (this repo has no seed-generator export from `@ancientpantheon/
      codex` — confirmed by investigation), call `deriveDoubleApollo(seedHex, mode, splitOverride?)`
      (from `@ancientpantheon/codex/ouronet` — investigate its exact expected `seedInput`/`mode`
      shape from its own type declarations and any existing caller in the `@ancientpantheon/codex`
      package's own source/tests if reachable under `node_modules`, since no example call exists yet
      in this repo), producing `{standard: {publicKey, privateKey, ...}, smart: {publicKey,
      privateKey, ...}}`. Encrypt each half's `privateKey` for storage: investigate whether
      `@stoachain/stoa-core/crypto` (the module `smartDecrypt` comes from) exports a matching
      encrypt counterpart (likely `smartEncrypt` or `encryptString`, symmetric with `smartDecrypt`'s
      naming) — use it with the SAME `codexPassword` `keyResolver.ts` already decrypts other
      entries with, so this new entry round-trips correctly the same way every other entry does.
      Append two new `IPureKeypair` entries (`{id: randomUUID(), label: "pythia-connector-standard"
      | "pythia-connector-smart", publicKey, encryptedPrivateKey, createdAt: new Date().
      toISOString()}`) to `snapshot.pureKeypairs`, `JSON.stringify` the mutated snapshot, and
      `saveBackup(...)`. Return the two public keys either way (freshly created or found existing).
      If NO usable encrypt primitive is found anywhere in `@stoachain/stoa-core` or
      `@ancientpantheon/codex`'s exported surface after a genuine search, stop and document that
      specific gap in this plan task's implementer report AND in `docs/work/pythia-connector-auth/
      design.md`'s Decisions section — do not invent ad-hoc crypto; this must reuse the codebase's
      own established primitive or explicitly flag the gap.
      — done when: `npx vitest run tests/pythia-apollo-identity.test.ts` passes, covering: first
      call against a fixture codex with no existing pythia-connector entries creates both halves and
      returns two distinct, plausible-looking public keys; a second call against the now-mutated
      snapshot returns the SAME two public keys (idempotent, no duplicate entries — assert
      `pureKeypairs` length only grew by exactly 2 across both calls, not 4); the newly-created
      entries round-trip through `smartDecrypt` with the same `codexPassword` back to the original
      private key material (proves the encrypt step used a compatible/symmetric primitive, not
      something `smartDecrypt` can't reverse).
  - files: `lib/pythia/apolloIdentity.ts`, `tests/pythia-apollo-identity.test.ts`
- [x] T5: `lib/pythia/onboardingChain.ts` — builds, signs, and relays (via a plain, ungated
      `PythiaClient.send`) the three on-chain Pact calls the onboarding lifecycle needs. Reuse
      `getChainRuntime()` (`lib/khronoton/runtime.ts`, returns `Promise<ChainRuntime>` exposing
      `.Pact.builder.execution(code)`, `.universalSignTransaction(tx, keypairs)`, `.networkId`,
      `.getPactUrl(chainId)`) and `createMnemosyneKeyResolver()` (`lib/khronoton/keyResolver.ts`,
      `.getKeyPairByPublicKey(publicKey): Promise<IKadenaKeypair>` — note its `IKadenaKeypair` shape
      uses `privateKey`, but `universalSignTransaction`'s `UniversalKeypair` parameter uses
      `secretKey` — map `{publicKey, secretKey: keypair.privateKey, seedType: keypair.seedType,
      encryptedSecretKey: keypair.encryptedSecretKey, password: keypair.password}` when converting
      between the two). Export three functions, each: builds a transaction via
      `runtime.Pact.builder.execution(pactCode).addData(...).setMeta({sender: publicKey, chainId,
      gasLimit, gasPrice, ttl}).setNetworkId(runtime.networkId).addSigner(publicKey).
      createTransaction()` (mirror the shape `@ancientpantheon/khronoton-core/server`'s internal
      `buildTransaction` uses — investigate its exact `setMeta` field names/defaults if reachable in
      `node_modules/@ancientpantheon/khronoton-core/dist/server/executor.js` and copy them, rather
      than guessing gas values), signs via `runtime.universalSignTransaction(tx, [keypair])`, then
      relays via `new PythiaClient({baseUrl: readAdminSettings().pythiaUrl}).send({cmds: [signed]})`
      (plain, no `pythiaKey` — this step happens before any gated identity exists).
      `export async function deployApolloHalf(ownerAccount: string, apolloPublicKey: string,
      isStandard: boolean): Promise<unknown>` — Pact code:
      `(free.PYTHIA.C_DeployApolloPythiaApiKey "${ownerAccount}" "${apolloPublicKey}"
      ${isStandard})` (module `PYTHIA` in `ouronet-ns` per the architecture doc — confirm the exact
      namespace-qualified reference style, e.g. `ouronet-ns.PYTHIA` vs the module's own internal
      convention, by grep-ing this repo and `constructors/Pythia` for any existing
      `ouronet-ns.PYTHIA`/similar qualified references to copy the exact form). **Mark this
      function's Pact-code string with a prominent comment: "VERIFY AGAINST THE LIVE PYTHIA.pact
      MODULE BEFORE THIS PATH IS EVER TRIGGERED — the exact parameter list beyond `(owner-account,
      apollo-public, is-standard)` was not confirmable from any source in this repo; see design.md's
      Signing section."** `export async function linkDualApiKey(standardPublicKey: string,
      smartPublicKey: string, consumerLane: string): Promise<unknown>` — Pact code:
      `(free.PYTHIA.C_LinkDualApiKey "${standardPublicKey}" "${smartPublicKey}"
      "${consumerLane}")`, same verification-needed comment. Both signed by whichever of the two
      Apollo halves is the "owner" for that call — `deployApolloHalf` signs with the SAME
      `apolloPublicKey` being deployed (self-service, per doc §1a: "user-called, self-service");
      `linkDualApiKey` requires **both** half-owners' authorization per the doc — sign with BOTH
      keypairs as `addSigner` calls / both entries in `universalSignTransaction`'s keypairs array.
      — done when: `npx vitest run tests/pythia-onboarding-chain.test.ts` passes. Since this
      function makes REAL chain calls in production, the test suite must NOT hit a real network —
      mock `getChainRuntime()` (inject it or stub the module — check how existing khronoton tests,
      e.g. `tests/khronoton-key-resolver.test.ts` or `tests/khronoton-api-route.test.ts`, mock
      chain-runtime/PythiaClient dependencies and mirror that approach) and mock `PythiaClient.send`
      (`vi.mock` or a constructor-injected client) to assert: the correct Pact code string is built
      for each of the three calls (assert the exact strings via regex/substring, including the
      prominent VERIFY comment's presence in the source), the correct signer(s) are used
      (`linkDualApiKey` invokes `universalSignTransaction` with 2 keypairs, the deploy calls with
      1), and the signed result is what gets passed to `PythiaClient.send`'s `cmds` array.
  - files: `lib/pythia/onboardingChain.ts`, `tests/pythia-onboarding-chain.test.ts`

## Wave 2 (depends on Wave 1)
- [x] T6: The connector runtime — ongoing gated access PLUS the onboarding orchestrator, as one
      task (the orchestrator directly calls the ongoing-access module's connector factory, so they
      cannot be built as independent, wave-parallel pieces; kept as one task rather than forcing an
      artificial extra wave).

      **`lib/pythia/connectorClient.ts`** — ongoing (post-onboarding) gated Pythia access.
      `export function getConnectorForHalf(apolloAccount: string): PythiaConnector` — constructs
      `new PythiaConnector({baseUrl: readAdminSettings().pythiaUrl, apolloAccount, signer:
      <an ApolloSigner instance from T3's lib/pythia/apolloSigner.ts>, storage: new
      MnemosyneConnectorSecretStore() (T2)})` (import `PythiaConnector`/`ApolloSigner` types from
      `@ancientpantheon/pythia-client`). `export function getGatedPythiaClient(): PythiaClient` —
      reads T1's `readConnectorStatus()`; if `stage !== "success"`, still returns a valid
      `PythiaClient` but WITHOUT a `pythiaKey` option (falls back to unattributed/direct access —
      never throws, per design.md's "strictly additive, never breaks existing behavior" acceptance
      criterion); if `stage === "success"`, returns `new PythiaClient({baseUrl:
      readAdminSettings().pythiaUrl, pythiaKey: getConnectorForHalf(status.standardApollo!).
      keyProvider()})` (use the Standard half's connector as the ongoing key source — the doc's
      lifecycle step 4 says re-proving mints the live secret; either half works once linked, Standard
      is the reasoned default, record this choice in design.md's Decisions).

      **`lib/pythia/onboardingJob.ts`** — the onboarding orchestrator. `export async function
      runOnboarding(): Promise<void>` (fire-and-forget, mirrors `lib/deploy/devDeploy.ts`'s
      `startDevDeploy`'s "runs in-process, updates status as it goes, never throws out to the
      caller" shape — wrap the whole body in try/catch, write `stage: "failed"` + `lastError` on any
      thrown error at any stage rather than letting an exception escape). Sequence, writing
      `writeConnectorStatus(...)` (T1) after each step: 1) `stage: "ensuring-identity"` →
      `ensureConnectorApolloPair()` (T4) → record both public keys in status. 2) `stage:
      "deploying-standard"` → `deployApolloHalf(ownerAccount, standardPublicKey, true)` (T5) — use
      the standard account's OWN address as `ownerAccount` (self-service deploy, the account pays
      for itself). 3) `stage: "deploying-smart"` → `deployApolloHalf(ownerAccount,
      smartPublicKey, false)` (T5). 4) `stage: "linking"` → `linkDualApiKey(standardPublicKey,
      smartPublicKey, consumerLane)` (T5) — `consumerLane` is a fixed constant,
      `"mnemosyne"` (document this choice; it's the doc's free-text lane identifier, not specified
      further by the architecture doc). 5) `stage: "proving-standard"` → construct a
      `PythiaConnector` for the standard half (via this same task's `getConnectorForHalf`) and call
      `.refresh()` — a `{status: "pending"}` result is EXPECTED and not a failure at this stage (per
      the SDK's own docs: "ownership proven, not yet an active dual link... a normal, expected
      state"); only a THROWN error (a genuine `PythiaConnectorError` subtype) fails this stage. 6)
      `stage: "proving-smart"` → same for the smart half. 7) `stage: "success"` — both proofs
      submitted; whether Pythia's own autonomous activation-resolver has ALREADY flipped the link
      active is not this job's concern (`getGatedPythiaClient()` degrades gracefully either way) —
      do one best-effort extra `.refresh()` call here purely to opportunistically pick up an
      already-active secret into T2's secret store if Pythia's resolver was fast, but do not block
      or fail the job on its result. `export function startOnboarding(): void` — guards against
      double-start (if `readConnectorStatus().stage` is any value other than `"idle"` or `"failed"`,
      throw/no-op rather than starting a second concurrent run — check the exact guard shape against
      how `app/api/admin/deploy/route.ts` avoids double-starting, if it does, or design a simple
      in-memory/status-file guard), sets `stage: "ensuring-identity"`, `startedAt`, then calls
      `void runOnboarding()` fire-and-forget.

      — done when: `npx vitest run tests/pythia-connector-client.test.ts` passes, covering:
      `getGatedPythiaClient()` with `stage: "idle"` status returns a client usable without a
      `pythiaKey` (assert by constructing it and checking it doesn't throw — the SDK's own
      `PythiaClientOptions.pythiaKey` is optional, so this is a simple presence/absence check on
      what's passed to the `PythiaClient` constructor, mockable via `vi.mock` on
      `@ancientpantheon/pythia-client` or by spying on the constructor); with `stage: "success"` and
      a `standardApollo` set, constructs a connector-backed client (assert `getConnectorForHalf` was
      invoked with the right account, e.g. via a spy). AND `npx vitest run
      tests/pythia-onboarding-job.test.ts` passes, covering: a full successful run (mock T4/T5's
      functions and this task's own `getConnectorForHalf`) transitions through every stage in order
      ending at `"success"`, with each intermediate `writeConnectorStatus` call assertable (spy on
      T1's `writeConnectorStatus`); a thrown error at any one mocked stage (test at least the
      `deploying-standard` and `linking` stages) results in `stage: "failed"` with `lastError` set,
      and does NOT throw out of `runOnboarding()` itself; `proving-standard`/`proving-smart`
      returning `{status: "pending"}` (not throwing) still proceeds to `"success"`, not `"failed"`;
      `startOnboarding()` called while a status is already `"linking"` (mid-run) does not start a
      second run (assert the mocked stage-1 function is not invoked again).
  - files: `lib/pythia/connectorClient.ts`, `lib/pythia/onboardingJob.ts`, `tests/pythia-connector-client.test.ts`, `tests/pythia-onboarding-job.test.ts`

## Wave 3 (depends on Wave 2)
- [x] T7: Two ancient-gated admin routes driving the onboarding job — `POST
      /api/admin/pythia-connector` (`app/api/admin/pythia-connector/route.ts`) and `GET
      /api/admin/pythia-connector/status` (`app/api/admin/pythia-connector/status/route.ts`), both
      mirroring the existing `requireAncient` + `dynamic = "force-dynamic"` + `NO_STORE` idiom every
      other admin route in this codebase uses (e.g. `app/api/admin/khronoton-version/route.ts`).
      `POST` calls `startOnboarding()` (T6); requires body `{acknowledgedSpend: true}` (mirrors
      `rotate-master-key`'s `acknowledgedExport` confirm-gate pattern exactly — a real-money,
      irreversible action needs the same explicit caller-side acknowledgment) — `400` if not
      `true`; on success returns `202 {ok: true, status: <ConnectorStatus>}` (202 because the job is
      fire-and-forget, not complete yet); if `readConnectorStatus().stage` is already mid-run
      (matches `startOnboarding()`'s own double-start guard), return `409 {error: "onboarding
      already in progress", status: <ConnectorStatus>}` instead of calling `startOnboarding()`
      again. `GET` returns `200 {<ConnectorStatus fields>}` via T1's `readConnectorStatus()` —
      simple passthrough, no side effects, safe to poll freely.
      — done when: `npx vitest run tests/pythia-connector-routes.test.ts` passes, covering both
      routes: `401` no session, `403` non-ancient session (mirror the exact session-cookie-building
      helpers from `tests/khronoton-version-route.test.ts`), `POST` `400` without
      `acknowledgedSpend: true`, `POST` `202` with it set (mock `startOnboarding` so no real work
      fires), `POST` `409` when status is already mid-run, `GET` `200` returning the current status
      shape.
  - files: `app/api/admin/pythia-connector/route.ts`, `app/api/admin/pythia-connector/status/route.ts`, `tests/pythia-connector-routes.test.ts`
- [x] T8: Admin UI — extend `app/admin/pythia/PythiaPage.client.tsx` with a new section below the
      existing `<PythiaConnectorSection />` (the gateway-URL form). Read the file in full first (it
      currently returns a single `<PythiaConnectorSection />` — change `PythiaPage`'s return to a
      fragment containing both sections). New sibling component, `ConnectorIdentitySection`,
      following `SecurityPage.client.tsx`'s exact established pattern for an irreversible,
      real-cost, confirm-gated action (read that file first and copy its shape: a `useEffect` GET-
      poll on mount via `fetch("/api/admin/pythia-connector/status", {cache: "no-store"})`
      populating local `status` state; a required checkbox — "I understand this deploys two Apollo
      accounts on-chain and spends real STOA (irreversible)." — gating the trigger button's
      `disabled` via `disabled={busy || !acknowledged || status?.stage === "success"}`; on click,
      `POST /api/admin/pythia-connector` with `{acknowledgedSpend: true}`; a status/error paragraph
      rendered below the button, same `mnemo-admin-status`/`role="alert"` convention). Render the
      current `stage` plainly (idle/in-progress-with-which-stage/success/failed), both Apollo public
      accounts once `ensuring-identity` has produced them, and `lastError` when present. While a
      stage is in progress (not `idle`/`success`/`failed`), poll `GET .../status` on an interval
      (mirror whatever polling interval convention is simplest/already-precedented in this codebase
      — e.g. `setInterval` at a fixed few-second cadence, cleared on unmount and once a terminal
      stage is reached) so the operator sees live stage progress without a manual refresh.
      — done when: a new source-contract test (mirror the regex style already used in
      `tests/admin-panel.test.ts`'s Khronoton/Pythia blocks) or a small dedicated
      `tests/pythia-admin-ui.test.ts` asserts: the file references `/api/admin/pythia-connector`
      and `/api/admin/pythia-connector/status`, an `acknowledgedSpend` gate exists, and the
      component is disabled once `stage === "success"`. `npx vitest run` on whichever test file you
      add passes.
  - files: `app/admin/pythia/PythiaPage.client.tsx`, `tests/pythia-admin-ui.test.ts`
