#!/usr/bin/env bash
#
# One-time install of the Mnemosyne on-box deployer (blue-green + systemd watcher).
# Run as root ON THE BOX after cloning the repo to $REPO. Idempotent.
#
# It does NOT edit your nginx vhost automatically (that file's layout is yours) — it
# only drops the upstream include and prints the two vhost lines you must add. See
# deploy/host/mnemosyne-upstream.conf for the exact wiring.
set -Eeuo pipefail

REPO="${MNEMOSYNE_REPO:-/opt/mnemosyne}"
SITE_ROOT="${MNEMOSYNE_SITE_ROOT:-/var/www/codex.ancientholdings.eu}"
HOST="$REPO/deploy/host"

[ "$(id -u)" = 0 ] || { echo "run as root" >&2; exit 1; }
[ -d "$HOST" ] || { echo "not found: $HOST (clone the repo to $REPO first)" >&2; exit 1; }

echo "→ making deployer scripts executable"
chmod +x "$HOST/mnemosyne-deploy.sh" "$HOST/mnemosyne-deploy-scan.sh"

echo "→ ensuring spool dir exists + is writable by the container (uid 1001)"
install -d -m 0755 "$SITE_ROOT/data/deploy"
chown -R 1001:1001 "$SITE_ROOT/data/deploy"

echo "→ installing nginx upstream include (if absent)"
install -d /etc/nginx/snippets
if [ ! -f /etc/nginx/snippets/mnemosyne-upstream.conf ]; then
  cp "$HOST/mnemosyne-upstream.conf" /etc/nginx/snippets/mnemosyne-upstream.conf
fi

echo "→ installing systemd path + service units"
cp "$HOST/mnemosyne-deploy.service" /etc/systemd/system/mnemosyne-deploy.service
cp "$HOST/mnemosyne-deploy.path"    /etc/systemd/system/mnemosyne-deploy.path
systemctl daemon-reload
systemctl enable --now mnemosyne-deploy.path

cat <<EOF

✓ Deployer installed.

MANUAL STEP — wire the nginx vhost for codex.ancientholdings.eu once:
  1. At the top (http context, outside 'server {}'):
        include /etc/nginx/snippets/mnemosyne-upstream.conf;
  2. In the app 'location /', replace:
        proxy_pass http://127.0.0.1:3005;
     with:
        proxy_pass http://mnemosyne_app;
  Then: nginx -t && nginx -s reload

FIRST DEPLOY also migrates the single 'mnemosyne' container to the blue color:
  docker rm -f mnemosyne 2>/dev/null || true
  (the deploy script starts 'mnemosyne-blue' on 3005)
EOF
