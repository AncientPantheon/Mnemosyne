# Mnemosyne live deploy — one-time VPS setup runbook

Turns `codex.ancientholdings.eu` from a **static nginx site** into the **Next.js app**
(login, admin, codex). After this one-time setup, every push to `main` auto-deploys
via `.github/workflows/deploy.yml` (build standalone → rsync → `pm2 reload`).

**Server:** Hetzner VPS `85.215.141.198`, root SSH.
**Target layout:**
```
/var/www/codex.ancientholdings.eu/
  ecosystem.config.js   # pm2 config (stable)
  .env.local            # runtime secrets (stable — set here, once)
  app/                  # standalone bundle (CI rsyncs here, --delete)
```

---

## A. GitHub secrets (repo → Settings → Secrets and variables → Actions)

- `DEPLOY_SSH_KEY`, `DEPLOY_HOST` — already exist from the old static deploy. Keep them.
- **`CODEX_REPO_TOKEN`** — NEW. A PAT (or fine-grained token) with **read** access to
  `AncientPantheon/Codex`, so CI can check the codex packages out to build the bundle.

## B. VPS: install the runtime (SSH as root)

```bash
# Node 20 (>= 20.6 required for --env-file) + pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v            # must be >= v20.6
npm i -g pm2
mkdir -p /var/www/codex.ancientholdings.eu/app
```

## C. VPS: write the runtime env (secrets stay on the server)

⚠ Run this in the VPS terminal, replace `PASTE_ROTATED_SECRET` with your **rotated**
client secret, and **do not paste the filled command anywhere else**:

```bash
cd /var/www/codex.ancientholdings.eu && printf 'OIDC_ISSUER=%s\nOIDC_CLIENT_ID=%s\nOIDC_CLIENT_SECRET=%s\nOIDC_REDIRECT_URI=%s\nSESSION_SECRET=%s\n' 'https://ancientholdings.eu' '6e93bb4a-6dc8-40dd-8e55-18575f64c17f' 'PASTE_ROTATED_SECRET' 'https://codex.ancientholdings.eu/admin/callback' "$(openssl rand -hex 32)" > .env.local && chmod 600 .env.local && echo "env ✓"
```

This uses the **live** redirect (`https://codex.ancientholdings.eu/admin/callback`),
which is the one you already registered with the hub — so no extra hub registration
is needed for prod.

## D. VPS: place the pm2 config

Copy `deploy/ecosystem.config.js` from the repo to
`/var/www/codex.ancientholdings.eu/ecosystem.config.js` (scp it, or paste its contents).

## E. Trigger the first CI deploy

Push to `main` (or Actions → "Deploy Mnemosyne …" → Run workflow). The workflow
rsyncs the bundle into `app/` and, on this first run, `pm2 start ecosystem.config.js`.
Watch it go green.

## F. VPS: verify the app + persist pm2

```bash
curl -s -o /dev/null -w "app: %{http_code}\n" http://127.0.0.1:3005/     # expect 200
curl -s http://127.0.0.1:3005/api/me                                     # {"authenticated":false}
pm2 status
pm2 save          # persist the process list
pm2 startup       # then run the command it prints (enables start-on-boot)
```

## G. VPS: flip nginx from static to reverse-proxy

Edit `/etc/nginx/sites-available/codex.ancientholdings.eu` to match
`deploy/nginx/codex.ancientholdings.eu.conf` (KEEP your existing Let's Encrypt cert
lines — only the `root`/`try_files` becomes `proxy_pass http://127.0.0.1:3005`). Then:

```bash
nginx -t && systemctl reload nginx
```

## H. Verify live + test login

```bash
curl -sI https://codex.ancientholdings.eu/ | head -1      # HTTP/2 200
curl -s  https://codex.ancientholdings.eu/api/me           # {"authenticated":false}
```
Then in a browser: `https://codex.ancientholdings.eu` → **Login with AncientHub** →
hub → back to `/admin`; the header flips to "Signed in as … · ancient".

---

## Ongoing
Push to `main` → CI builds + ships + `pm2 reload mnemosyne` (zero-downtime). No manual steps.

## Rollback
- `pm2 logs mnemosyne` to inspect. `pm2 stop mnemosyne` to stop the app.
- To revert to the old static site: restore the previous nginx block (static `root` +
  `try_files`) and `systemctl reload nginx`; the old `web/` files are still under
  `/var/www/codex.ancientholdings.eu/public/`.

## Notes
- Secrets never enter CI or git — they live only in the server `.env.local`.
- The bundle is self-contained (codex packages bundled at build); the server needs
  **no** Codex repo and **no** `npm install`.
