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

## Updates — blue-green, zero-downtime (the Deploy button)

The ancient-gated Deploy endpoint (TBD: `POST /api/admin/deploy`) runs on the box and:
1. `git pull` (public repo, no cred) + bump constructors to `@latest`.
2. `docker compose build` a new image.
3. Start a SECOND container on an alternate port (e.g. 3006), health-check `/api/me`.
4. Flip nginx's upstream 3005→3006 (`nginx -s reload`), then stop + remove the old.
5. Stream every step's logs to the admin page over SSE (a live terminal).

For the app (in a container) to drive host Docker, mount the docker socket read-only
into the container (`/var/run/docker.sock`) OR run the deploy script via a tiny host
helper. Socket-mount is simplest; treat it as a privileged capability (ancient-gated +
fresh-confirm).

## Releases → ghcr.io

`.github/workflows/image.yml` builds + pushes `ghcr.io/ancientpantheon/mnemosyne:<version>`
(+ `:latest`) on a `v*` tag, using the automatic `GITHUB_TOKEN`. The box can
`docker pull` a published image instead of building, for reproducible rollback:
`docker compose pull && docker compose up -d` (set `image:` to the ghcr tag).

## Local dev is NOT containerized

Local dev stays `npm run dev` (HMR). Constructor updates there = `npm install @latest`
+ restart the dev server. Do not run the container locally for development.
