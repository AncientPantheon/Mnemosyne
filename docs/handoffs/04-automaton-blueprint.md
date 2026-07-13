# Handoff 04 — The Pantheonic Automaton Blueprint

**Audience:** the agent (or human) creating any NEW Pantheonic Automaton — Caduceus,
Aletheia, and every one after. This is the canonical "how an automaton is built" so
there is **no guessing** from the get-go.

**Authored from:** Mnemosyne (`codex.ancientholdings.eu`) — the first automaton, where
every piece below was learned the hard way. Mnemosyne is the reference implementation;
read its code alongside this doc.

**Companion handoffs:** `02-automaton-master-key-codex-protection.md` (the sealed-codex
+ rotation crypto — canonical, follow it verbatim) and
`03-khronoton-automaton-package.md` (the scheduling/execution engine package).

> **Keep this updated.** When a new automaton surfaces a lesson worth recording, add it
> here. This doc is the accumulated wisdom, not a snapshot.

---

## 0. What a Pantheonic Automaton IS

An automaton = **Codex** (sealed keys + signing) + **Pythia** (chain reads) +
**Khronoton** (scheduled autonomous signing) + its own domain logic — packaged as a
**single Docker container**, gated behind AncientHub login, operated by an ancient
admin, self-updating and self-redeploying with **no expiring tokens**.

The three organs are **"constructors"** — reusable npm packages the automaton consumes.
The automaton itself is an **app**, not a library: its artifact is a **container image**,
never an npm package.

```
        ┌───────────────────────── the Automaton (a Docker container) ─────────────────────────┐
        │  AncientHub OIDC login (ancient gate)                                                 │
        │  ┌── admin (Hub-style, one page per function) ──────────────────────────────────────┐ │
        │  │  Own sealed Codex (master-key)   Pythia connector   Khronoton (scheduled tx)      │ │
        │  │  Update Constructors + Deploy    Codex Security (rotate)    …domain functions      │ │
        │  └───────────────────────────────────────────────────────────────────────────────────┘ │
        │  consumes:  @ancientpantheon/codex   @ancientpantheon/khronoton-*   (npm, baked in)    │
        │  persists:  host volume → sealed codex + master key + secrets + Pythia creds           │
        └───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Repo, registry, org (settle this first)

- **Source** lives in a GitHub repo under the **`AncientPantheon`** org (public), e.g.
  `github.com/AncientPantheon/<automaton>`.
- **Runtime artifact = a Docker image** on **`ghcr.io/ancientpantheon/<automaton>`**
  (GitHub Container Registry — shows under the repo's *Packages* tab). Built + pushed
  by CI on release using the workflow's **automatic `GITHUB_TOKEN`** (no user PAT, never
  expires).
- **NOT an npm package.** An automaton is deployed, not imported. Only *constructors*
  (codex, khronoton) are npm packages.
- The repo is **public**, so the box pulls source + npm packages with **zero credentials**.

---

## 2. The constructor model

Every organ is an npm package with `core / server / ui` subpath exports, consumed at
**build time** and **baked into the image**:

- **`@ancientpantheon/codex`** — the codex (keys, signing, the codex-ui). Already shipped
  as a bundled aggregate (subpaths `. /provider /hooks /ui /ouronet /arweave /ui.css`).
- **`@ancientpantheon/khronoton-*`** — the scheduler/executor + builder UI (being built
  per handoff 03: `core` published, `server` + `ui` TBD).

**The load-bearing fact:** constructors ship **browser code** (React components run in the
user's browser), which is **bundled at build time**. You CANNOT hot-swap a compiled
component library at runtime. → **Adopting a new constructor version = a rebuild.** Every
update mechanism is really "how/where the rebuild happens." Do not fight this.

Both the consumer's own codex surface AND any consumer-facing surface mount the SAME
installed package — one install, one shared shell (see Mnemosyne `app/codex/CodexShell.tsx`:
`/codex` and `/admin/codex` render through ONE component; only the adapter + top-bar action
differ). Never fork the codex layout per surface.

---

## 3. Container + the deploy/renewal mechanic (tokenless)

The automaton is a **Docker image** (Next `output: "standalone"` → a slim image; the whole
app+website+API in one). Two complementary, **credential-free** paths:

1. **Primary — the on-box Deploy button** (ancient-gated, in the admin panel). On click,
   the box runs: `git pull` (public repo, no cred) → `npm install @ancientpantheon/*@latest`
   (public npm) → `docker build` (local) → **blue-green swap**. 100% tokenless. A single
   button, **lit whenever any constructor (or the app source) has a newer version**.
   - **Zero-downtime (blue-green):** build the new image → start the new container on a
     second port → health-check → flip nginx's upstream → stop the old. The site never
     drops a request.
   - **Streamed progress:** stream the `git pull`/`npm`/`docker build` logs to the admin
     page over SSE — a live terminal, exactly like the hub's website-update button.
2. **Add-on — CI → ghcr.io on release.** On a git tag/push, GitHub Actions builds + pushes
   a **versioned** image (automatic `GITHUB_TOKEN`) → gives rollback + the Packages
   presence. The dashboard deploy does not depend on it.

**No user-managed token anywhere.** Dashboard deploy = local + public; registry publish =
CI's built-in token.

**Persistence (critical):** a container swap discards the image but MUST keep operator
state. Mount a **host volume** into the container so these survive every deploy:
```
host:/srv/<automaton>/data       → the sealed codex (MNEMOSYNE_CODEX_DIR equivalent)
host:/srv/<automaton>/.env.local → master key + session/OIDC secrets + Pythia connector
```
Never bake secrets into the image. The volume makes "wire Pythia once → it persists
across all deploys" true by construction.

**Runtime-user ownership (learned on Mnemosyne):** the image runs as a NON-ROOT user
(uid 1001). The mounted host state (`.env.local` + `data/`) MUST be owned by that uid or
the container can't read the `drwx------` sealed-codex dir — the site is up but the codex
"fails to load". `chown -R 1001:1001 <host-state>` on first setup.

---

## 4. Localhost vs live — clean segregation (do not mix)

| | **Local dev** | **Live production** |
|---|---|---|
| Run | `npm run dev` (webpack HMR, no Docker) | the Docker container |
| Constructor update | `npm install @latest` → **auto-restart the dev server** (webpack caches node_modules at boot, so a pull needs a restart, not just reload) | the on-box Deploy (git pull + npm latest + `docker build` + blue-green swap) |
| Secrets/state | repo-root `.env.local` + `data/` (gitignored) | **host volume** (`.env.local` + `data/` in the mount) |
| The Deploy button action | "Update & restart" (auto-restarts dev) | "Deploy" (rebuild + swap) — **deploy-mode-aware, same button** |

The app decides its mode from `NODE_ENV` (`production` = bundle/container; else dev). Every
deploy-mode-aware surface (the version panels, the Deploy button, the codex "compiled-in vs
pullable" note) branches on this. **Never** let a dev-only pull path run on the live bundle
(it updates node_modules but not the built chunks → a no-op that looks like it worked).

---

## 5. Ancient-admin login (this is what we stumbled on — get it exactly right)

The automaton delegates human login to the **AncientHub OIDC IdP** and gates admin on the
`ancient` role. Reference: Mnemosyne `lib/auth/*` + `app/admin/{login,callback,logout}`.

- **Flow:** auth-code + **PKCE (S256)**, `client_secret_basic` token exchange, **RS256
  id_token** verified against the hub's JWKS (issuer + `aud`=client_id + nonce), roles gated
  on `roles.includes("ancient")`. The automaton signs its OWN first-party session cookie
  (HS256 over `SESSION_SECRET`), separate from the hub's id_token.
- **Config (env, in the volume `.env.local`):** `OIDC_ISSUER`, `OIDC_CLIENT_ID`,
  `OIDC_CLIENT_SECRET` (confidential, server-only), `SESSION_SECRET` (≥32 chars). Each
  automaton registers its OWN confidential client with the hub, with its callback
  `https://<automaton-host>/admin/callback` in the allowed-redirects list.
- **THE TWO TRAPS (both bit Mnemosyne):**
  1. **`redirect_uri` must be derived from the request host, never hard-coded** — a static
     default silently sends prod logins to `localhost`. See `resolveRedirect()`.
  2. **EVERY same-site redirect (login/callback/logout → `/`) must also be host-derived**,
     not `new URL("/", request.url)` — behind nginx `request.url` reflects the internal
     `127.0.0.1:3005` bind host, so a "return home" bounces the operator to localhost even
     after auth succeeds. Use `resolveOrigin(request)` / `siteUrl(request, path)` honoring
     `X-Forwarded-Host` / `X-Forwarded-Proto`.
- **Cookies:** `HttpOnly`, `SameSite=Lax` (Lax so the top-level nav BACK from the hub
  carries the login-state cookie), `Secure` derived from the request scheme (https prod /
  http localhost — a Secure cookie over http://localhost is dropped). The login-state
  cookie is path-scoped to `/admin` (must reach `/admin/callback`); the session cookie is
  path `/`.
- **Gate helper:** `requireAncient(request)` → `{ok, session}` or a ready 401/403 Response.
  Every admin API route calls it first.

---

## 6. Master-key sealed Codex (follow handoff 02)

The automaton holds its OWN operator codex, **sealed under a server master key** and
**auto-unlocked** for the ancient admin (no password) and for self-execution.

- Master key `<AUTOMATON>_MASTER_KEY` (base64 of 32 random bytes) in the volume `.env.local`.
- Sealing = libsodium `crypto_secretbox`; the codex is stored as sealed files in the volume
  data dir (`<AUTOMATON>_CODEX_DIR`), NOT a DB, NOT the image.
- **Rotation = a generic vault re-seal, never a key swap** (handoff 02 §4). A swap bricks the
  codex. Mnemosyne: `lib/mnemosyne{Vault,CodexStore,Rotation}.ts` + `lib/envFile.ts`
  (atomic temp→fsync→rename `.env.local` write) + `POST /api/admin/security/rotate-master-key`
  (ancient + `acknowledgedExport`). Ship a codex-survives-rotation regression test.
- The sealed codex + master key live in the host **volume** → survive every container deploy.

---

## 7. Codex storage + the server-custody adapter

The codex UI is mounted with a **server-custody adapter** (not localStorage): every mutation
seals the whole snapshot server-side (master-key), auto-loaded + auto-unlocked. Model on
Mnemosyne `lib/codex-dropin/MnemosyneServerCodexAdapter.ts` + `app/admin/codex/MnemosyneCodex.tsx`
(the hub's `CodexDropIn` pattern). Empty on first open → the ancient populates it on the spot
→ real-time sealed save. No upload.

---

## 8. Pythia credentials (wired into the codex; persistent; embeddable)

- Pythia is wired via credentials the ancient sets: a **global connector URL** (injected into
  every codex surface, from `/api/config`) + the codex's own Pythia/Apollo keys (inside the
  sealed codex).
- **Persistence:** the connector config (admin-settings) + the sealed codex both live in the
  **host volume** → **wire Pythia once, it survives all deploys.**
- **Embed option (v2 nicety):** a toggle at deploy time to fold the current Pythia config into
  the image build so a fresh container starts pre-wired. The volume already makes persistence
  work from day one; embedding is optional.
- The per-user Network-tab node override is browser-local (localStorage) — it only affects
  that operator; the global Pythia wins.

---

## 9. Gated admin functions (Hub-style)

The admin surface is a **landing with a tile per function**, each on its own ancient-gated
page, all wrapping their section in ONE shared `AdminGate` (the gate — not each section —
owns the checking/login/not-authorized/ancient states). Reference Mnemosyne `app/admin/*`:

- `/admin` landing (tiles) · `AdminGate.client.tsx` (the shared gate) ·
- one page per function: the automaton's own **Codex**, **Update Constructors + Deploy**,
  **Pythia connector**, **Codex Security** (rotate), **Khronoton** (scheduled tx), **Network**,
  + domain-specific pages.
- Every mutating/signing route is ancient-gated server-side (`requireAncient`); the gate is UX.

---

## 10. Versioning + docs discipline

`package.json` `version` is the single source of truth (shown in the app header). **Every bump
ships a matching `CHANGELOG.md` top entry in the same commit — enforced by a test**
(`tests/changelog-version.test.ts`: package version === newest changelog entry, so a bump can't
merge undocumented). Procedure in `docs/RELEASING.md`. TDD throughout; the full test suite is
the safety net for the deploy button.

---

## 11. New-automaton checklist

- [ ] Repo under `AncientPantheon` (public); image → `ghcr.io/ancientpantheon/<name>`; NOT npm.
- [ ] Next.js `output: "standalone"`; Dockerfile (multi-stage) + compose with a **host volume**
      for `.env.local` + `data/`.
- [ ] AncientHub OIDC login + `ancient` gate — **host-derived `redirect_uri` AND all same-site
      redirects** (`resolveOrigin`/`siteUrl`); Lax/Secure-per-scheme cookies. Register the
      client + its callback with the hub.
- [ ] Own sealed Codex (master key in the volume) + rotation per handoff 02 + a survives-rotation
      test.
- [ ] Server-custody codex adapter + the shared CodexShell (one layout, all surfaces).
- [ ] Pythia connector (global + per-user), persisted in the volume.
- [ ] Constructors consumed as npm (`@ancientpantheon/*`, core/server/ui), baked into the image.
- [ ] Khronoton wired once its package ships (handoff 03): inject a KeyResolver over the sealed
      codex + a ChainRuntime + storage + audit; run the tick.
- [ ] Hub-style admin (landing + per-function pages + `AdminGate`).
- [ ] Deploy: on-box tokenless button (git pull + npm latest + docker build + blue-green +
      streamed logs), deploy-mode-aware (dev = npm + restart); CI → ghcr.io on release.
- [ ] Versioning gate + CHANGELOG + RELEASING.md.
- [ ] Clean localhost/live segregation; never run a dev-only pull on the live bundle.

## 12. Where Mnemosyne implements each piece (read these)

| Concern | Mnemosyne file(s) |
| --- | --- |
| OIDC login + host-derived redirects | `lib/auth/*`, `app/admin/{login,callback,logout}/route.ts` |
| Sealed codex + rotation | `lib/mnemosyne{Vault,CodexStore,Rotation}.ts`, `lib/envFile.ts`, `app/api/admin/security/*` |
| Server-custody adapter + shared shell | `lib/codex-dropin/MnemosyneServerCodexAdapter.ts`, `app/codex/CodexShell.tsx`, `app/admin/codex/*` |
| Pythia connector | `lib/adminSettings.ts`, `lib/pythiaUrl.ts`, `app/api/{config,admin/pythia}` |
| Hub-style admin | `app/admin/AdminGate.client.tsx`, `app/admin/AdminLanding.client.tsx`, `app/admin/*/` |
| Constructor version/update surface | `lib/codexVersion.ts`, `app/api/admin/{codex,khronoton}-version`, `app/admin/update-constructors/*` |
| Versioning gate | `tests/changelog-version.test.ts`, `docs/RELEASING.md`, `CHANGELOG.md` |
| Deploy (target — TBD as of this writing) | Dockerfile + compose + `POST /api/admin/deploy` (blue-green, SSE) |
