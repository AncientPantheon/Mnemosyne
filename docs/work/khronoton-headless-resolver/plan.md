# Khronoton headless KeyResolver delegation — Plan

Topic 2 of `pythia-verifier-alignment`. Two waves: bump codex in isolation first (so any
0.8.0-breaks-a-consumer problem surfaces on its own, distinct from the resolver rewrite), then
rewrite the resolver against the new pre-bound headless API.

## Wave 1

- [x] T1: Bump `@ancientpantheon/codex` `^0.6.1 → ^0.8.0` and validate the aggregate bump in
      isolation (NO resolver change yet). Edit `package.json` dependency spec and run
      `npm install @ancientpantheon/codex@^0.8.0 --no-audit --no-fund` to refresh `package-lock.json`
      (0.8.0 is published + `latest`). Do NOT change any `.ts` yet — the point is to see the whole
      existing tree on 0.8.0 by itself.
      — done when: `node -e "console.log(require('@ancientpantheon/codex/package.json').version)"`
      prints `0.8.0` (or higher within `^0.8.0`); `npx vitest run` is green (all existing tests,
      including Topic 1's `tests/apollo-verify-contract.test.ts` byte-exact guard, the connector-auth
      suites `tests/pythia-apollo-*.test.ts`, and `tests/khronoton-key-resolver.test.ts` still on the
      OLD resolver); `npx tsc --noEmit` shows no NEW errors versus the pre-bump baseline of 66
      (record the exact count); `npx next build --webpack` compiles clean with `/apollo-verify`,
      `/codex`, and `/api/admin/pythia-connector` all present in the route table. If codex 0.8.0
      breaks any existing consumer, STOP and report the exact breakage before proceeding to T2 (it is
      a codex-compat problem, not a resolver-rewrite problem).
  - files: `package.json`, `package-lock.json`
  - note: also mirror the bump in `deploy/host/mnemosyne-deploy.sh`? No — the host deployer already
    runs `npm install @ancientpantheon/codex@latest` on every deploy, so it needs no edit; the pin
    bump here is for local/CI build + typecheck to see 0.8.0. (Recorded so the implementer doesn't
    "fix" the deploy script.)

## Wave 2 (depends on Wave 1)

- [x] T2: Rewrite `lib/khronoton/keyResolver.ts` to delegate all Kadena key derivation to Codex's
      headless resolver, mirroring the live reference
      `constructors/Pythia/apps/pythia/src/automaton/khronoton/keyResolver.ts` (read it in full first
      — copy its structure, not novel logic). Update `tests/khronoton-key-resolver.test.ts` in the
      same task.

      Required structure (all mirrored from the Pythia reference):
      - Import `createHeadlessKadenaResolver` and `CodexKeyMissingError` from
        `@ancientpantheon/codex/ouronet` (both exist in 0.8.0; the `/ouronet` subpath is node-safe —
        no React/DOM, unlike `/ui`). Keep `smartDecrypt` from `@stoachain/stoa-core/crypto` for the
        ouro fallback. Keep `IKadenaKeypair`/`KeyResolver`/`SignerSource` type imports from
        `@ancientpantheon/khronoton-core`.
      - **Delete** `assertHexSecret` and its `HEX_SECRET` regex, the `seedType: "koala"` hardcodes on
        the pure/seed paths, `fromSeedAccount`, and the
        `kadenaMnemonicToSeed`/`kadenaGenKeypairFromSeed`/`kadenaDecrypt` imports (all now handled
        inside Codex's resolver).
      - In `createMnemosyneKeyResolver()`, build once:
        `const delegate = createHeadlessKadenaResolver({ loadSnapshot: () => loadSnapshot(), getPassword: () => getOrCreateCodexPassword() });`
        (Mnemosyne's existing async `loadSnapshot()` and `getOrCreateCodexPassword()` bind directly —
        the thunks accept `T | Promise<T>`).
      - `getKeyPairByPublicKey(publicKey)`: `const kp = await delegate.getKeyPairByPublicKey(bareKey(publicKey))`
        in a try; on success return
        `{ publicKey: kp.publicKey, privateKey: kp.privateKey, seedType: kp.seedType ?? "koala", encryptedSecretKey: kp.encryptedSecretKey as string | undefined, password: kp.password }`.
        On `catch (err)`: `if (!(err instanceof CodexKeyMissingError)) throw err;` then try the ouro
        fallback; if the fallback finds nothing, rethrow the original error.
      - **Ouro fallback** (Codex's resolver reads only `{ kadenaSeeds, pureKeypairs }`, so ouro
        accounts must be resolved here): find the ouro account whose bare pubkey matches AND passes
        `isKadenaPublicKey`, `smartDecrypt(acc.secret, await getOrCreateCodexPassword())`, return
        `{ publicKey: wanted, privateKey: <decrypted>, seedType: "koala" }`. (Ouro secrets are koala
        hex; keep a minimal length/shape sanity check inline but do NOT reintroduce the broad
        `assertHexSecret` gate on the delegated paths.)
      - `isKadenaPublicKey(pub)`: `/^[0-9a-fA-F]{64}$/.test(bareKey(pub))`. Apply it in: (1)
        `listCodexPubs` — read snapshot sequentially, then `await delegate.listCodexPubs()` (NOT both
        in one `Promise.all`; Pythia documents an orphan-rejection hazard because `loadSnapshot`
        throws synchronously on an uninitialized codex), union with Kadena-filtered ouro pubkeys, and
        return the set filtered by `isKadenaPublicKey`; (2) the ouro fallback (above); (3)
        `createMnemosyneSignerSource()`'s descriptor list so Apollo `<len>.<xy>` pubkeys never enter
        the Kadena signer set.
      - Preserve the exported names `createMnemosyneKeyResolver(): KeyResolver` and
        `createMnemosyneSignerSource(): SignerSource` and the `bareKey` helper (its callers rely on it).

      Tests (`tests/khronoton-key-resolver.test.ts`) — keep the existing koala fixtures GREEN through
      the new delegation and add coverage for the fixed/filtered behavior:
      - A koala pure keypair still resolves to a signable `{ publicKey, privateKey, seedType }`.
      - A koala ouro account still resolves (proves the ouro fallback path, reached via
        `CodexKeyMissingError`).
      - A koala seed account still resolves (now via the delegate, not the deleted hand-roll).
      - `listCodexPubs()` on a snapshot that ALSO contains an Apollo `<len>.<xy>` pubkey (e.g. a
        pure keypair whose `publicKey` is a base-49 Apollo key, or reuse the connector-identity shape
        from `apolloIdentity.ts`) EXCLUDES that Apollo key — asserting the Kadena-only filter.
      - Mirror the existing fixture-building style (temp `MNEMOSYNE_CODEX_DIR`, `MNEMOSYNE_MASTER_KEY`,
        `encryptStringV2`-built sealed backup) already used by this test file and
        `tests/pythia-apollo-*.test.ts`. If Codex 0.8.0's headless resolver requires a real seed to
        derive a real keypair (i.e. a fabricated fixture can't produce a self-consistent koala
        pubkey→secret pair that passes its wrong-key guard), mirror exactly how the Pythia repo's own
        `keyResolver` test builds its fixtures — read
        `constructors/Pythia/apps/pythia/src/automaton/khronoton/*keyResolver*.test.ts` (or its
        nearest equivalent) and copy that fixture approach rather than inventing one.

      — done when: `npx vitest run tests/khronoton-key-resolver.test.ts` passes with the cases above;
      `grep -E "assertHexSecret|fromSeedAccount|seedType: \"koala\"" lib/khronoton/keyResolver.ts`
      returns only the single intentional ouro-fallback `seedType: "koala"` (no `assertHexSecret`, no
      `fromSeedAccount`); `npx vitest run` (full suite) is green; `npx tsc --noEmit` shows no NEW
      errors vs T1's recorded baseline; `npx next build --webpack` compiles clean.
  - files: `lib/khronoton/keyResolver.ts`, `tests/khronoton-key-resolver.test.ts`
