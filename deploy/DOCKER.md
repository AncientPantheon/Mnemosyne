# Mnemosyne — container deployment + the pm2→container migration

Mnemosyne runs as a single Docker container (the whole app+website+API). Operator
state lives in host paths mounted in, so a rebuild never loses it. This is the
reference pattern for every automaton — see `docs/handoffs/04-automaton-blueprint.md`.

## The persistence model (never in the image)

```
host: /var/www/codex.ancientholdings.eu/
  .env.local   → mounted rw at /app/.env.local   (master key, OIDC, session, Pythia;
                 rotation rewrites it in place via MNEMOSYNE_ENV_FILE)
  data/        → mounted at /app/data            (the sealed codex; MNEMOSYNE_CODEX_DIR
                 → /app/data/mnemosyne-codex)
```
Both already exist on the box (set up for the pm2 run) — the container reuses them, so
the codex you already sealed and the Pythia config keep working across the migration.

**Ownership (do not skip):** the image runs as the non-root user `nextjs` (uid **1001**).
The mounted host state must be owned by 1001 or the container can't read/write it (the
sealed-codex dir is `drwx------`, so a wrong owner = "codex load failed" even though the
site is up). Chown the host state to the runtime uid:
```bash
chown -R 1001:1001 /var/www/codex.ancientholdings.eu/data /var/www/codex.ancientholdings.eu/.env.local
```

## One-time VPS migration (pm2 standalone → container)

1. **Install Docker** on the VPS (root): `curl -fsSL https://get.docker.com | sh` +
   `systemctl enable --now docker`. (12-core/128 GB box — builds are trivial.)
2. Place the repo on the box (public clone) at, e.g.,
   `/opt/mnemosyne` (`git clone https://github.com/AncientPantheon/Mnemosyne /opt/mnemosyne`).
3. From the repo dir: `docker compose build` then `docker compose up -d`. The container
   binds `127.0.0.1:3005` — the SAME port nginx already proxies to, so nginx needs no
   change.
4. **Cut over:** `pm2 stop mnemosyne && pm2 delete mnemosyne` (the container now owns
   3005). Verify `curl -sI https://codex.ancientholdings.eu/` → 200.
5. `pm2 save` (so the removed process doesn't resurrect on reboot). Docker's
   `restart: unless-stopped` keeps the container up across reboots.

Because the container and pm2 both bind `127.0.0.1:3005`, do step 4 (stop pm2) right
before/after `up -d` — a brief blip on the FIRST cutover only. Subsequent updates use
blue-green (below) with zero downtime.

## Updates — blue-green, zero-downtime (the Deploy button) — BUILT

The ancient-gated single **Deploy** button (Admin → Update Constructors) drives a
zero-downtime rebuild. The container itself holds NO Docker/nginx power (least
privilege) — instead of a mounted docker socket, it *signals* a privileged host
deployer through the shared volume:

1. `POST /api/admin/deploy` writes a `<id>.request.json` into the deploy spool
   (`<data>/deploy/`, on the host volume) and seeds `<id>.log` + `<id>.status`.
2. A systemd **path unit** (`mnemosyne-deploy.path`) watches the spool and runs
   `mnemosyne-deploy.sh` (as root, on the host) for each request:
   - `git checkout -- package.json package-lock.json && git pull --ff-only`
   - `npm install @ancientpantheon/codex@latest` + `@ancientpantheon/khronoton-core@latest` (bump the pins)
   - `docker build` the new image
   - start the OTHER color (`mnemosyne-blue`↔`mnemosyne-green`, ports 3005↔3006),
     health-check `/api/me`
   - rewrite `/etc/nginx/snippets/mnemosyne-upstream.conf` to the new port +
     `nginx -s reload` (the atomic cut-over), then remove the old color
3. The browser tails `<id>.log`/`<id>.status` via SSE
   (`/api/admin/deploy/stream/<id>`). When the swap drops the container serving the
   stream, EventSource auto-reconnects to the new container and resumes the tail off
   the same host-volume log — so the terminal stays consistent across the swap.

Install once on the box: `deploy/host/install-host-deployer.sh` (systemd units +
nginx upstream include + spool chown to uid 1001), plus a one-time vhost wiring
(`include` the upstream + `proxy_pass http://mnemosyne_app;` + an SSE-friendly
`location /api/admin/deploy/stream/` with `proxy_buffering off; proxy_read_timeout
1800s;`). See `deploy/host/mnemosyne-upstream.conf` for the exact lines. The first
deploy migrates the single `mnemosyne` container to `mnemosyne-blue` (a one-time
few-second blip; every deploy after is zero-downtime).

On **dev** (`NODE_ENV !== production`) the same button instead pulls the constructors
`@latest` in-process and streams npm's output to the terminal; reload picks it up.

## Releases → ghcr.io

`.github/workflows/image.yml` builds + pushes `ghcr.io/ancientpantheon/mnemosyne:<version>`
(+ `:latest`) on a `v*` tag, using the automatic `GITHUB_TOKEN`. The box can
`docker pull` a published image instead of building, for reproducible rollback:
`docker compose pull && docker compose up -d` (set `image:` to the ghcr tag).

## Local dev is NOT containerized

Local dev stays `npm run dev` (HMR). Constructor updates there = `npm install @latest`
+ restart the dev server. Do not run the container locally for development.
