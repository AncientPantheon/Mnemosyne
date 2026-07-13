# Changelog

All notable changes to Mnemosyne are documented here, newest first. This project
follows [Semantic Versioning](https://semver.org). The version in the **top entry**
MUST equal `package.json`'s `version` — this is enforced by
`tests/changelog-version.test.ts`, so every version bump ships its own documentation.
See [docs/RELEASING.md](docs/RELEASING.md) for the release procedure.

The running version is shown on the landing header (`v{{MNEMOSYNE_VERSION}}`), read
from `package.json`.

## [0.4.0] — 2026-07-13

### Added
- **Download + Load for the Mnemosyne own-codex** (server-custody portability).
  - **Download** (`POST /api/admin/codex/export`): prompt a new password (twice) → the
    server re-keys the codex *machine-password → your new password* and returns a
    portable backup you download. The live codex is untouched; the file is protected by
    the password you chose (not the machine password you never see).
  - **Load** (`POST /api/admin/codex/import`): pick a Mnemosyne codex backup + enter its
    password → the server re-keys it *file-password → machine-password* and seals it under
    the master key, **adopting** it (auto-unlocks as usual). This replaces the current
    codex, so it's gated behind an explicit confirm + a "download a backup first" nudge.
  - Both re-keys run **server-side in Node** (master key + machine password never leave
    the box) using the codex package's new `rekeyCodex` primitive (codex 0.6.0, handoff
    07) — which owns the drift-proof secret-field walk. Mnemosyne only ferries the opaque
    blob (`lib/mnemosyneCodexRekey.ts`) and never touches plaintext key material.

### Changed
- **Codex constructor → 0.6.0** (brings `rekeyCodex` + `changeCodexPassword`).

### Notes
- Download/Load use Mnemosyne's raw-snapshot backup format (backup ↔ restore, and moving
  a codex between automatons). Loading a **wallet-export (envelope) codex** is rejected
  with a clear message — it needs one more small codex export (a pure `snapshotFromExport`);
  flagged as a handoff-07 follow-up.
- Minor packaging note for the codex agent: `rekeyCodex` runtime-exports from `/ouronet`
  only, though the root `.d.ts` re-exports it — worth aligning the root JS entry.

## [0.3.5] — 2026-07-13

### Added
- **Auto-reload after a live deploy** — no more manual refresh. When a bundle deploy
  finishes, the panel reloads to the freshly-swapped build automatically (dev still
  shows the "reload to run the new build" note, since dev needs a server restart).
- **Granular deploy progress.** The on-box deployer now emits numbered phase banners
  with elapsed time (`═══ [1m20s] 2/5 · Build image (BuildKit) ═══`) and builds with
  BuildKit `--progress=plain`, so the admin terminal streams every step live instead
  of the terse legacy-builder output.

### Changed
- **Container base image → Node 22** (`node:22-alpine`), silencing the `EBADENGINE`
  warnings from deps that require Node ≥22 (`@stoachain/kadena-stoic-legacy`, the
  Solana/wallet-standard transitives).

### Fixed
- **Deployer can't corrupt itself mid-run.** A deploy `git pull`s the very scripts it's
  executing; the scan step now snapshots the deployer to an immutable temp dir and
  re-execs from there, so pulling new script versions can't corrupt the running deploy.

## [0.3.4] — 2026-07-13

### Added
- **Mnemosyne itself now has its own version row** on Update Constructors, above the
  Constructors table: running build (`installed`) vs the version on the deploy branch
  (`available`, read from `main`'s `package.json` on the public GitHub repo — the same
  code a Deploy `git pull`s + rebuilds). A Deploy updates the app *and* the constructors,
  so an app-source update is now a first-class deploy reason: the **Deploy button lights
  up** when Mnemosyne OR any wired constructor is behind — a code-only change no longer
  hides behind "Re-deploy."

### Changed
- **Removed the redundant "Khronoton (coming soon)" card** from Update Constructors.
  Both constructors already appear in the Constructors status table (Khronoton shows
  `not wired → v0.2.0`), so the card was pure duplication and its text was stale (it
  claimed the engine was "still being built" — the `/server` engine has shipped). The
  one useful bit — why Khronoton is unwired + where to preview its UI — is now a single
  inline line under the table, shown only while an unwired constructor exists.

## [0.3.3] — 2026-07-13

### Added
- **Khronoton UI mockup embedded at `/admin/khronoton`** (handoff 04). The placeholder
  is replaced by the package's self-contained static mockup (`public/khronoton-mockup.html`,
  iframed in the ancient-gated page): the four views — Cronotons list, two-pane Pact
  builder (Config/Payload/Gas Payer/Signatures/Execute + 7 schedule modes), Observe
  fire-history (LIVE/TEST, paginated 50/page), Public read-only — plus the consumer-theme
  recolor switcher. Visual review only.

### Notes
- **Still NOT wired to the live engine.** `@ancientpantheon/khronoton-core@0.2.0` ships a
  real headless `/server` engine (store + atomic claim-before-fire + executor + tick), but
  wiring it live means Mnemosyne autonomously codex-signs on-chain transactions — gated
  behind the standing "finalize all three Constructors first" decision (handoff 05 §4).
  The mockup stands in until that gate opens and the 0.3.0 `/ui` package ships.

## [0.3.2] — 2026-07-13

### Added
- **Single Deploy button (Update Constructors).** The two separate "Update Codex" /
  "Update Khronoton" sections are replaced by one **Constructors** status table plus a
  single **Deploy** button that "comes alive" (primary) when any wired constructor has
  a newer npm version, and always allows a manual re-deploy. Progress streams live into
  an in-page terminal over SSE (`/api/admin/deploy/stream/<id>`).
- **On-box, zero-downtime deploy (live).** The running container can't rebuild itself
  and holds no Docker/nginx power, so a live Deploy drops a request in the deploy spool
  (`lib/deploy/spool.ts`); a privileged **host deployer** (`deploy/host/`) does a
  blue-green rebuild+swap (build new image → start the other color on the other port →
  health-check → flip the nginx upstream → drop the old color) and streams its log back
  through the shared volume. Installed once via `deploy/host/install-host-deployer.sh`
  (systemd path-unit watcher + nginx upstream include). The site stays up throughout.
- **Dev deploy path.** On localhost, Deploy pulls the constructors at `@latest`
  in-process and streams npm's output into the same terminal; reload picks up the build.

### Notes
- **Khronoton is not wired yet.** Only the logic-only `@ancientpantheon/khronoton-core`
  is published; the plug-and-play `khronoton-server`/`khronoton-ui` packages
  (docs/handoffs/03) don't exist. Khronoton shows as a preview and joins the single
  Deploy button — no separate button — once its package ships.

## [0.3.1] — 2026-07-13

### Fixes
- **Favicon on the landing page.** The landing is served as raw HTML (`app/route.ts`),
  so Next's `app/icon.svg` convention didn't inject a favicon there the way it does for
  the App Router pages — the tab showed no icon. Added an explicit
  `<link rel="icon" href="/icon.svg">` to `public/index.html`.

## [0.3.0] — 2026-07-13

### Infrastructure
- **Mnemosyne now runs as a Docker container** (the automaton-container model —
  `docs/handoffs/04-automaton-blueprint.md`). One Next-standalone image = the whole
  app+website+API; operator state (sealed codex, master key, secrets, Pythia config)
  lives in host paths mounted in, so a rebuild/redeploy never loses it. `Dockerfile`,
  `docker-compose.yml` (persistence volume + rw `.env.local` mount for rotation),
  `.dockerignore`, and `deploy/DOCKER.md`.
- **Release images on ghcr.io** — `.github/workflows/image.yml` builds + pushes
  `ghcr.io/ancientpantheon/mnemosyne:<version>` on a `v*` tag via the automatic
  `GITHUB_TOKEN` (no PAT), for reproducible releases + rollback.
- **Retired the pm2 rsync deploy workflow** — superseded by the container + (next) the
  on-box Deploy button. Pushing to `main` no longer auto-deploys; updates go through
  the Deploy button (blue-green) or a tagged ghcr.io image.

### Repo
- Moved to `github.com/AncientPantheon/Mnemosyne` (public) and the local tree to the
  AncientPantheon workspace.

## [0.2.2] — 2026-07-12

### Codex
- **Both codex surfaces now render through one shared `CodexShell`.** The Mnemosyne
  server codex (`/admin/codex`) had drifted from the consumer `/codex` (a long
  tagline wrapped its top-bar over the body); extracting the consumer's proven
  layout into a shared shell makes the two identical (only the top-bar action
  differs — Export/Load vs Lock).

### Admin
- **"Update Constructors"** page — merges Update Codex with a scaffold **Update
  Khronoton** (previews the `@ancientpantheon/khronoton-core` npm version; disabled
  until the package is wired). Replaces the standalone Update Codex tile.
- **"Mnemosyne Khronoton"** page — a scaffold for scheduling codex-signed autonomous
  transactions (coming soon; references the Khronoton package handoff). New landing
  tile.
- `GET /api/admin/khronoton-version` (ancient-gated) — the Khronoton version preview.

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
