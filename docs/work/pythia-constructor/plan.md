## Wave 1
- [x] T1: Add `@ancientpantheon/pythia-client` as a real dependency and its version-reader
      functions, mirroring `readCodexUiVersion`/`fetchLatestCodexVersion` exactly (same file, same
      idioms: read `node_modules/@ancientpantheon/pythia-client/package.json` directly since the
      package's `exports` map won't expose it via `require.resolve`; fetch `dist-tags.latest` from
      the npm registry with the abbreviated-packument accept header, return `null` on any failure).
      Export a `PYTHIA_CLIENT_PACKAGE = "@ancientpantheon/pythia-client"` constant from
      `lib/codexVersion.ts` (mirrors the existing exported `KHRONOTON_PACKAGE` constant in that same
      file — note `CODEX_PACKAGE` itself lives in the separate `lib/updateCodex.ts`, so
      `KHRONOTON_PACKAGE` is the correct same-file precedent to copy) — this is the value later
      tasks (T3, T4) import rather than re-typing the literal. Run
      `npm install @ancientpantheon/pythia-client@^2.3.0` to add it to `package.json` and
      `package-lock.json`. — done when: `node -e "console.log(require('@ancientpantheon/pythia-client/package.json').version)"`
      prints a semver string; `npx vitest run tests/pythia-client-version.test.ts` passes with tests
      for `readPythiaClientVersion()` (matches `/^\d+\.\d+\.\d+/`), `fetchLatestPythiaClientVersion()`
      returning `dist-tags.latest` on a stubbed 200, `null` on a stubbed 500, and `null` when `fetch`
      throws (mirror `tests/codex-version.test.ts`'s three `fetchLatestCodexVersion` cases exactly).
  - files: `package.json`, `lib/codexVersion.ts`, `tests/pythia-client-version.test.ts`
- [x] T5: Add `next.config.ts` standalone-build tracing for the Pythia-client package's
      `package.json`, mirroring the existing Codex/Khronoton `outputFileTracingIncludes` entries —
      add a `"/api/admin/pythia-client-version"` entry pointing at
      `"./node_modules/@ancientpantheon/pythia-client/package.json"`, and add that same path to the
      existing `"/api/admin/deploy"` entry's array (alongside Codex's and Khronoton's). — done when:
      `next.config.ts`'s `outputFileTracingIncludes` object contains a
      `"/api/admin/pythia-client-version"` key whose array includes the pythia-client package.json
      path, and the `"/api/admin/deploy"` entry's array includes it too; `npx tsc --noEmit` passes.
      (No dedicated test exists for `outputFileTracingIncludes` today — `tests/next-config.test.ts`
      only covers the `webpack()` hook — so this task adds none, matching existing coverage.)
  - files: `next.config.ts`

## Wave 2 (depends on Wave 1)
- [x] T2: New ancient-gated `GET /api/admin/pythia-client-version` route, mirroring
      `app/api/admin/khronoton-version/route.ts` exactly (same gating, same response shape,
      `{ installed, available, updateAvailable, wired: true }`, `Cache-Control: no-store`), built on
      T1's `readPythiaClientVersion`/`fetchLatestPythiaClientVersion`. — done when:
      `npx vitest run tests/pythia-client-version-route.test.ts` passes with cases mirroring
      `tests/khronoton-version-route.test.ts`: `401` with no session cookie, `403` for a non-ancient
      session, `200` for an ancient session with the documented shape + `no-store` header (stub the
      npm registry fetch to return a known `dist-tags.latest` and assert `wired: true`,
      `installed` matches `/^\d+\.\d+\.\d+/`, `available` equals the stubbed value).
  - files: `app/api/admin/pythia-client-version/route.ts`, `tests/pythia-client-version-route.test.ts`
- [x] T3: Extend `lib/deploy/constructors.ts`: widen `ConstructorStatus["key"]` to
      `"codex" | "khronoton" | "pythia"`, add a third entry to the `constructors` array in
      `readConstructorsStatus()` (`key: "pythia"`, `label: "Pythia"`,
      `npmPackage: "@ancientpantheon/pythia-client"`, `installed`/`available` from T1's readers,
      `wired: true`, `updateAvailable` computed with `isNewerVersion` exactly like the Codex/Khronoton
      entries), and include it in the `Promise.all` alongside the existing reads. — done when:
      `npx vitest run tests/deploy-constructors.test.ts` (new file) passes, asserting
      `readConstructorsStatus()` returns a 3-element `constructors` array containing a `key: "pythia"`
      entry with `wired: true` and `npmPackage: "@ancientpantheon/pythia-client"` (stub `fetch` so the
      npm-latest calls resolve deterministically, same pattern as
      `tests/khronoton-version-route.test.ts`'s `vi.stubGlobal("fetch", ...)`).
  - files: `lib/deploy/constructors.ts`, `tests/deploy-constructors.test.ts`
- [x] T4: Add `@ancientpantheon/pythia-client@latest` to dev-mode's pull list in
      `lib/deploy/devDeploy.ts` (`PACKAGES` array), importing the package constant from
      `lib/codexVersion.ts` (T1) the same way `CODEX_PACKAGE`/`KHRONOTON_PACKAGE` are imported today.
      — done when: a new assertion in `tests/deploy-panel.test.ts`'s existing
      `"dev mode writes the same heartbeat contract..."` describe block (or a new `it` alongside it)
      confirms `lib/deploy/devDeploy.ts`'s source contains `@ancientpantheon/pythia-client`; full file
      `npx vitest run tests/deploy-panel.test.ts` passes.
  - files: `lib/deploy/devDeploy.ts`, `tests/deploy-panel.test.ts`

## Wave 3 (depends on Wave 2)
- [x] T6: Widen the local `ConstructorStatus["key"]` union in
      `app/admin/update-deploy/UpdateDeployPage.client.tsx` to
      `"codex" | "khronoton" | "pythia"` (the panel already renders `status.constructors.map(...)`
      generically — no other UI change needed; no Pythia-specific callout is added, matching
      design.md's explicit choice). Add a source-contract assertion (mirroring the existing
      `admin-panel.test.ts`/`deploy-panel.test.ts` regex style) that the file's `ConstructorStatus`
      union includes `"pythia"`. — done when: `npx vitest run tests/admin-panel.test.ts` passes
      including the new assertion; `npx tsc --noEmit` passes.
  - files: `app/admin/update-deploy/UpdateDeployPage.client.tsx`, `tests/admin-panel.test.ts`
