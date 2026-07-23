# Deploy panel §05 conformance — Plan

## Wave 1 (independent files — run in parallel)

- [x] T1: Host deployer heartbeat + total elapsed + box identity (AC5, AC6, and the env half of AC2)
  — in `deploy/host/mnemosyne-deploy.sh`: add `start_heartbeat`/`stop_heartbeat` (a background loop
  appending `  · still working · elapsed <t>` every **6s**), start it right after `echo running`, and
  kill it on **every** exit path via `trap 'stop_heartbeat' EXIT` (keep the existing ERR trap working).
  Make the final line `✓ deploy complete in <elapsed>`. Also pass the box identity into the container
  it starts: `-e MNEMOSYNE_COLOR=$NEW -e MNEMOSYNE_LOOPBACK_PORT=$NEW_PORT -e MNEMOSYNE_CONTAINER=mnemosyne-$NEW`.
  — done when: heartbeat starts/stops on success, failure and ERR; success line carries the total; the
  `docker run` injects the three env vars; `bash -n` parses clean.
  - files: `deploy/host/mnemosyne-deploy.sh`

- [x] T2: `active` + the §2 status endpoint (AC3) — add `latestDeploy()` to `lib/deploy/spool.ts`
  (scan the spool for `*.status`, newest non-terminal wins, `startedAt` = the `<id>.log` birthtime,
  `id`+`status`); add `lib/deploy/boxStatus.ts` reading `MNEMOSYNE_COLOR`/`MNEMOSYNE_LOOPBACK_PORT`/
  `MNEMOSYNE_CONTAINER` (null when absent) + the running version + the deploy mode; add
  `app/api/admin/deploy/status/route.ts` returning `{mode,color,port,container,version,active}`,
  `requireAncient`-gated, `Cache-Control: no-store`, `force-dynamic`. — done when: the shape matches
  §2 exactly; `active` is null with no running deploy and the newest non-terminal one otherwise; unit
  tests cover latestDeploy (terminal ignored, newest wins, missing spool → null).
  - files: `lib/deploy/spool.ts`, `lib/deploy/boxStatus.ts`, `app/api/admin/deploy/status/route.ts`,
    `tests/deploy-panel.test.ts`

- [x] T3: Dev-mode heartbeat (AC11) — in `lib/deploy/devDeploy.ts` append the same
  `  · still working · elapsed <t>` line every 6s while npm runs, and clear the interval on **every**
  exit path (`close`, `error`, spawn failure). — done when: the interval is cleared in each handler
  (no leak) and the line format matches the host deployer's.
  - files: `lib/deploy/devDeploy.ts`

## Wave 2 (depends on T2's status shape)

- [x] T4: The panel — deploy readout + progress machinery (AC1, AC2, AC7, AC8, AC9, AC10, AC12) — in
  `app/admin/update-deploy/UpdateDeployPage.client.tsx` + `app/admin/admin.css`:
  green **"up to date"** instead of `→` on current rows; the **Mode · Live color · Loopback port ·
  Container · Version** readout + blue-green explainer from `/api/admin/deploy/status`; a progress
  block above the terminal with **status chip**, **`Step N/M`** parsed from the streamed chunks (latest
  match wins), a **1s ticking timer** from `startedAt`, and a looping **CSS pacman** heartbeat; a **20s
  stall watchdog** (red + paused animation + `⚠ no output for Ns …`, cleared on the next chunk);
  **auto-attach** on mount via `active` (guard against double-attach); **auto-reload** on success with a
  ~3s countdown (both modes), never on failure; move the confirm row **below** the button so the button
  stays put. — done when: every listed element renders and the source-contract tests pin them.
  - files: `app/admin/update-deploy/UpdateDeployPage.client.tsx`, `app/admin/admin.css`,
    `tests/deploy-panel.test.ts`

## Wave 3

- [x] T5: Release (AC10 no-cache, AC13) — ensure admin responses carry `Cache-Control: no-cache`
  (so the auto-reload revalidates); bump `package.json` → 0.8.0 + `## [0.8.0]` CHANGELOG entry naming
  §05 conformance. — done when: changelog gate + full `vitest` + `tsc` + `next build` green.
  - files: `next.config.ts` (headers, if needed), `package.json`, `CHANGELOG.md`
