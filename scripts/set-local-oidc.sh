#!/usr/bin/env bash
# Set the LOCAL-dev AncientHub OIDC client creds in .env.local.
#
# .env.local is a file — it PERSISTS across dev-server restarts. Run this ONCE;
# no boot/startup script is needed. `npm run dev` reads .env.local every time it
# starts, so after this you just (re)start the dev server.
#
# Usage (quote both values so a leading '-' / special chars are safe):
#   bash scripts/set-local-oidc.sh '<LOCAL_CLIENT_ID>' '<LOCAL_CLIENT_SECRET>'
#
# The secret is passed at runtime (never committed, never in this file). This
# writes the LOCALHOST client + the localhost redirect; SESSION_SECRET is kept
# if present, else generated. Run it from anywhere — it locates the repo itself.
set -euo pipefail

ID="${1:?usage: set-local-oidc.sh '<CLIENT_ID>' '<CLIENT_SECRET>'}"
SECRET="${2:?usage: set-local-oidc.sh '<CLIENT_ID>' '<CLIENT_SECRET>'}"

cd "$(cd "$(dirname "$0")/.." && pwd)"   # -> Mnemosyne repo root
ENVF=".env.local"

# Preserve an existing SESSION_SECRET; generate one on first setup.
SESSION="$(grep -E '^SESSION_SECRET=' "$ENVF" 2>/dev/null | head -1 | cut -d= -f2-)"
[ -n "${SESSION:-}" ] || SESSION="$(openssl rand -hex 32)"

# Strip the fields we manage, keep everything else (incl. SESSION_SECRET line if
# we re-add it below), then append the managed fields.
tmp="$ENVF.new"
{
  grep -vE '^(OIDC_ISSUER|OIDC_CLIENT_ID|OIDC_CLIENT_SECRET|OIDC_REDIRECT_URI|SESSION_SECRET)=' "$ENVF" 2>/dev/null || true
  printf 'OIDC_ISSUER=%s\n'        'https://ancientholdings.eu'
  printf 'OIDC_CLIENT_ID=%s\n'     "$ID"
  printf 'OIDC_CLIENT_SECRET=%s\n' "$SECRET"
  printf 'OIDC_REDIRECT_URI=%s\n'  'http://localhost:3005/admin/callback'
  printf 'SESSION_SECRET=%s\n'     "$SESSION"
} > "$tmp"
mv "$tmp" "$ENVF"
chmod 600 "$ENVF" 2>/dev/null || true

echo "local .env.local set: client_id + secret + localhost redirect (session preserved)."
echo "now restart the dev server:  npm run dev"
