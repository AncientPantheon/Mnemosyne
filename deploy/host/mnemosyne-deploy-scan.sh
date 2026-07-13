#!/usr/bin/env bash
#
# Claim + run every pending deploy request in the spool. Invoked by the systemd path
# unit (mnemosyne-deploy.path) whenever the container drops a `*.request.json`.
#
# SNAPSHOT-AND-RE-EXEC: a deploy runs `git pull` in the repo, which REWRITES these very
# scripts. Bash reads a script from disk *as it executes*, so pulling mid-run could
# corrupt the running deployer. So on first entry we copy the deployer scripts to an
# immutable temp dir and re-exec from there; the git pull then only touches the repo
# copies on disk, never the ones this process is executing.
set -uo pipefail

if [ -z "${MNEMO_SNAPSHOT:-}" ]; then
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SNAP="$(mktemp -d /tmp/mnemo-deploy.XXXXXX)"
  cp "$HERE/mnemosyne-deploy.sh" "$HERE/mnemosyne-deploy-scan.sh" "$SNAP/"
  chmod +x "$SNAP"/*.sh
  export MNEMO_SNAPSHOT="$SNAP"
  exec bash "$SNAP/mnemosyne-deploy-scan.sh"
fi
# ── From here we are running the immutable snapshot copy. ────────────────────────────
trap 'rm -rf "$MNEMO_SNAPSHOT"' EXIT

SITE_ROOT="${MNEMOSYNE_SITE_ROOT:-/var/www/codex.ancientholdings.eu}"
SPOOL="$SITE_ROOT/data/deploy"

shopt -s nullglob
for req in "$SPOOL"/*.request.json; do
  id="$(basename "$req" .request.json)"
  mv "$req" "$req.processing" 2>/dev/null || continue  # lost the claim race → skip
  "$MNEMO_SNAPSHOT/mnemosyne-deploy.sh" "$id" || true  # errors already land in <id>.status
  rm -f "$req.processing"
done
