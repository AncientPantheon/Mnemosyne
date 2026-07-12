# Releasing Mnemosyne

Mnemosyne follows [Semantic Versioning](https://semver.org). Pre-1.0, a **minor**
bump (`0.x`) carries new features; a **patch** (`0.x.y`) carries fixes only.

## The rule: every version ships its own documentation

`package.json`'s `version` is the single source of truth (it's injected into the
landing header as `v{{MNEMOSYNE_VERSION}}` by `app/route.ts`). **Every time you bump
it, add a matching top entry to [CHANGELOG.md](../CHANGELOG.md) in the same commit.**

This is enforced: `tests/changelog-version.test.ts` fails if the version in
`package.json` does not equal the version of the newest `## [x.y.z]` entry in
`CHANGELOG.md`. So a version bump without documentation cannot merge, and a
documented version cannot drift from what's deployed.

## Procedure

1. Land the feature/fix work (with its tests).
2. Bump `version` in `package.json`.
3. Add a `## [x.y.z] — YYYY-MM-DD` section at the TOP of `CHANGELOG.md` describing
   the user-facing changes (group by area: Codex, Admin, Auth, Security, Fixes …).
   Keep it about *what changed for an operator*, not commit-by-commit noise.
4. `npx vitest run` (the changelog gate + the suite must pass) and `npm run build`.
5. Commit `package.json` + `CHANGELOG.md` together, e.g.
   `release: v0.x.y — <one-line summary>`.
6. Deploy: push to `main` → CI rebuilds the standalone bundle and reloads pm2. The
   landing header then shows the new `v0.x.y`.

## Notes

- Do NOT hand-edit the version anywhere else — `app/route.ts` reads it from
  `package.json`, so bumping one place is enough.
- If a change has no user-visible effect (pure refactor, comment, test-only), you may
  fold it into the next real version's entry rather than minting a version for it.
