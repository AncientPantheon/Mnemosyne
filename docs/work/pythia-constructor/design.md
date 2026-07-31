# Pythia organ adoption — third constructor row — Design

Topic 1 of the `pythia-third-constructor` project — see
`../pythia-third-constructor/design.md` for the umbrella problem statement and topic split.

## Problem

Per `websites/Pantheon/docs/pantheonic-architecture/organs/06-pythia-client-wire-in.md` §3,
`@ancientpantheon/pythia-client` is the third organ, installed and exposed the same way Mnemosyne
already installs/exposes Codex and Khronoton. Today `lib/deploy/constructors.ts` only knows about
two constructors, so the Update & Deploy panel shows 2 rows and a deploy pulls only 2 packages.

## Approach

Adopt `@ancientpantheon/pythia-client` as a real Mnemosyne dependency and add it as a third
`ConstructorStatus` row — installed-version resolution, npm-latest check, deploy-time pull — by
exactly mirroring the existing Codex/Khronoton wiring. `wired: true` means "is a dependency", the
same established meaning it already has for Khronoton (whose own live capability — autonomous
signing — was switched on in a later, separate pass); the connector-auth capability (topic 2 of
the umbrella project) is that same kind of separate follow-up for Pythia.

Mirror table (against Codex/Khronoton's existing implementation):

| Concern | Codex/Khronoton (existing) | Pythia (new) |
|---|---|---|
| Dependency | `package.json` `dependencies` | add `@ancientpantheon/pythia-client` (`^2.3.0`) |
| Version readers | `readCodexUiVersion`/`readKhronotonUiVersion` + `fetchLatest…Version` in `lib/codexVersion.ts` | `readPythiaClientVersion` + `fetchLatestPythiaClientVersion`, same file |
| Aggregate status | `ConstructorStatus` union `"codex" \| "khronoton"`, two-entry array in `lib/deploy/constructors.ts` | extend union to `"pythia"`, third array entry, `wired: true` |
| Per-organ route | `/api/admin/codex-version`, `/api/admin/khronoton-version` | new `/api/admin/pythia-client-version` (not `/api/admin/pythia` — that's the existing, unrelated gateway-URL route) |
| Deploy-time pull | `lib/deploy/devDeploy.ts` `PACKAGES`; `constructorPins` in `app/api/admin/deploy/route.ts` | add the package to `devDeploy.ts`'s list; pin-list side is automatic (driven by `wired`) |
| Standalone build tracing | `next.config.ts` `outputFileTracingIncludes` | matching entries for the new route + `/api/admin/deploy` |
| Panel UI | `UpdateDeployPage.client.tsx` renders `status.constructors.map(...)` | works unchanged — union just needs the third key |
| Tests | `tests/codex-version.test.ts`, `tests/khronoton-version-route.test.ts`, `tests/deploy-panel.test.ts`, `tests/admin-panel.test.ts` | mirror each; extend aggregate/panel tests to assert 3 constructors |

Alternative considered and rejected: fake/hardcoded version display without a real dependency —
would violate `wired`'s established meaning and desync from the deploy-time pull.

## Acceptance criteria

- [ ] `@ancientpantheon/pythia-client` is a real `package.json` dependency, importable from
      `node_modules`.
- [ ] `GET /api/admin/deploy` returns a `constructors` array with three entries; Pythia's has
      `key: "pythia"`, `npmPackage: "@ancientpantheon/pythia-client"`, `wired: true`, independent
      `installed`/`available`/`updateAvailable`.
- [ ] The Update & Deploy panel renders three constructor rows.
- [ ] New ancient-gated `GET /api/admin/pythia-client-version` mirrors the codex/khronoton version
      routes' shape/gating (`401`/`403`/`200` + `installed`/`available`/`updateAvailable`/
      `wired: true` + `no-store`).
- [ ] Both deploy modes (`devDeploy.ts` pull list, bundle-mode `constructorPins`) include
      `@ancientpantheon/pythia-client@latest`.
- [ ] A `next build` standalone output still resolves the installed Pythia-client version at
      runtime (tracing entries present).
- [ ] `vitest` and `tsc` pass for everything touched in this topic.

## Out of scope

- Everything in `../pythia-connector-auth/design.md` (topic 2) — ApolloSigner, PythiaConnector,
  on-chain deploy+link, gated reads.
- Any change to the existing `/admin#pythia` gateway-URL admin config.
- Splitting `lib/codexVersion.ts` into per-organ files.
- Version bump / CHANGELOG entry — deferred to the close of topic 2 (one shared entry for both
  halves, per the umbrella design's Approach).

## Decisions

Autonomous run confirmed 2026-07-31.
