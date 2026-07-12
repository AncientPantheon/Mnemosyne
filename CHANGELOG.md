# Changelog

All notable changes to Mnemosyne are documented here, newest first. This project
follows [Semantic Versioning](https://semver.org). The version in the **top entry**
MUST equal `package.json`'s `version` — this is enforced by
`tests/changelog-version.test.ts`, so every version bump ships its own documentation.
See [docs/RELEASING.md](docs/RELEASING.md) for the release procedure.

The running version is shown on the landing header (`v{{MNEMOSYNE_VERSION}}`), read
from `package.json`.

## [0.2.1] — 2026-07-12

### Fixes
- **Login/logout no longer bounce to `localhost:3005` on the live site.** The OIDC
  `redirect_uri` was already host-derived, but the same-site "return home" redirects
  (callback success, auth-error bounces, logout) still used `request.url`, which
  behind nginx reflects the app's internal `127.0.0.1:3005` bind host. New
  `resolveOrigin()` / `siteUrl()` derive every same-site redirect from the request's
  public host (`X-Forwarded-Host`/`-Proto`), so login and logout land on
  `codex.ancientholdings.eu`, not localhost.

## [0.2.0] — 2026-07-12

### Codex packaging
- **Consume the single npm `@ancientpantheon/codex` aggregate** instead of five
  `file:`-linked sub-packages. Imports rewritten to the aggregate subpaths
  (`/provider`, `/hooks`, `/ui`, `/ouronet`, root, `/arweave`). `ARWEAVE_CHAIN_ID`
  is inlined to keep the Node-only sqlite adapter out of the browser bundle. CI no
  longer checks out the private Codex repo — it `npm ci`s the published package.

### Update Codex
- The **"Update Codex" button is a real npm puller** (`npm install
  @ancientpantheon/codex@latest`) with a before→after version delta.
- The admin panel shows **installed vs. latest-on-npm** and flags when an update is
  available. It is **deploy-mode aware**: on the live standalone bundle it points to
  a redeploy (codex is compiled in) rather than a no-op in-app pull.
- The `/codex` load screen shows a **Codex engine v… badge** (the actually-installed
  version), and the version reads correctly on the standalone bundle.

### Security — codex master key
- **Master-key rotation that re-seals the operator codex** under the new key — a
  generic vault re-seal, never a bare key swap (per automaton handoff 02). Ordered
  plan → atomic re-seal → persist key → flip in-memory, with rollback; proven by a
  codex-survives-rotation regression test.
- Ancient-gated `POST /api/admin/security/rotate-master-key` (requires
  `acknowledgedExport`) + the `/admin/security` page.

### Admin panel
- **Hub-style restructure**: `/admin` is a landing with a tile per function, each on
  its own ancient-gated page — Mnemosyne Codex, Update Codex, Pythia Connector,
  Codex Security, Network Status.

### Auth
- **OIDC redirect URI is derived from the request host** (honoring the reverse
  proxy's forwarded headers), so it can never fall back to localhost on the live
  site. No per-environment redirect config to keep in sync.

### Fixes
- Codex-storage routes return a **clear 503** ("set MNEMOSYNE_MASTER_KEY …") instead
  of an opaque 500 when the server isn't configured; the codex-ui surfaces it.
- `MNEMOSYNE_CODEX_DIR` documented so the sealed codex lives outside `app/` and
  survives `--delete` deploys.

## [0.1.0] — 2026-07-11

Initial Mnemosyne application (`codex.ancientholdings.eu`).

- Next.js 16 App Router shell; the standalone Codex UI mounted at `/codex`
  (upload → unlock → dashboard).
- AncientHub **OIDC login** (auth-code + PKCE, RS256 id_token verify) with an
  **ancient-role** admin gate.
- Admin panel: Pythia connector config + Update Codex.
- **Mnemosyne's own sealed operator codex** at `/admin/codex` — server-side,
  master-key-sealed, auto-unlocked for the ancient admin (Phase 4).
- Self-contained standalone deploy (pm2 + nginx) with CI auto-deploy on push.
