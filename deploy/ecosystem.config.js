// pm2 config for the Mnemosyne Next.js standalone app on the VPS.
// Lives OUTSIDE the rsync'd app/ dir (in the parent) so a --delete deploy never
// removes it or the sibling .env.local.
//
// Layout on the server:
//   /var/www/codex.ancientholdings.eu/
//     ecosystem.config.js   <- this file (stable)
//     .env.local            <- runtime secrets (stable; set once via the runbook)
//     app/                  <- the standalone bundle (rsynced by CI, --delete)
//
// Node >= 20.6 required for `--env-file` (loads .env.local into process.env; the
// Next standalone server.js does NOT auto-load .env files).
module.exports = {
  apps: [
    {
      name: "mnemosyne",
      cwd: "/var/www/codex.ancientholdings.eu/app",
      script: "server.js",
      node_args: "--env-file=/var/www/codex.ancientholdings.eu/.env.local",
      instances: 1,
      exec_mode: "fork",
      env: {
        // Bind loopback only — nginx terminates TLS and proxies to it.
        PORT: "3005",
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
      },
      max_restarts: 10,
      restart_delay: 2000,
    },
  ],
};
