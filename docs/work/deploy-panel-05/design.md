# Deploy panel §05 conformance — status readout + always-moving progress

## Context
New canonical standard: `websites/Pantheon/docs/pantheonic-architecture/automaton/05-deploy-panel-and-progress.md`
(Pythia is the reference implementation; **Mnemosyne is the named alignment target**). The rule:

> At any instant while a deploy is running, something in the deploy box must be visibly moving.
> If motion stops, the deploy is stuck.

The motion must be *caused by the deploy being alive* — the server heartbeat (§3) makes it true, the
client stall watchdog (§5c) makes its absence visible.

## Audit — Mnemosyne vs the 12-point checklist
| # | Requirement | Today |
|---|---|---|
| 4 | Stream survives the swap (log on shared volume, client clears on reconnect) | **done** |
| 11 | Dev mode pulls constructors `@latest` instead of disabling Deploy | **done** |
| 1 | Version readout: entity + CONSTRUCTORS groups, chips, independent degradation | partial — no green "up to date" (always renders the `→`) |
| 6 | Success states the total elapsed | partial — `✓ deploy complete`, no total |
| 10 | Auto-reload on success | partial — reloads after 2.5s, no countdown; dev never reloads |
| 12 | Inline confirmation below the button | partial — inline, but it *replaces* the button |
| 2 | Deploy readout: Mode · Live color · Loopback port · Container · Version + explainer | **missing** |
| 3 | `…/deploy/status` documented shape incl. `active` | **missing** (GET returns the constructors payload only) |
| 5 | Host deployer heartbeats ~6s, killed on every exit path | **missing** |
| 7 | chip + real `Step N/M` + 1s timer + looping heartbeat animation | **missing** |
| 8 | >20s output silence visibly stalls the display | **missing** |
| 9 | Auto-attach to a running deploy this browser didn't trigger | **missing** |

Already conformant and NOT to be touched: the SSE contract (byte-offset tail, 500ms poll, tolerant of
a missing log, `status`/`done` events, 20-min cap) and the 5 canonical phase banners in the host script.

## Settled decisions
- **Box identity comes from env injected by the host deployer.** The container cannot inspect docker
  or nginx (it deliberately has no such power), so `mnemosyne-deploy.sh` passes
  `MNEMOSYNE_COLOR`, `MNEMOSYNE_LOOPBACK_PORT`, `MNEMOSYNE_CONTAINER` into the container it starts.
  The status endpoint reads them; absent (dev, or a container from before this change) → `null`,
  which the panel renders as `unknown` rather than crashing.
- **A new `GET /api/admin/deploy/status`** carries the §2 shape (`mode/color/port/container/version/
  active`). The existing `GET /api/admin/deploy` keeps serving the §1a version readout — the two
  concerns stay separate (as in Pythia's `versionInfo`/`organVersions` vs `status`).
- **`active`** = the newest deploy in the spool whose `.status` is non-terminal; `startedAt` = the log
  file's birth time, so a late-joining browser shows true elapsed.
- **Heartbeat in BOTH modes** — the host script (background ticker + `EXIT` trap) and `devDeploy`
  (interval cleared on every exit path), so the whole progress display works identically on localhost.
- **Stall threshold 20s** against a **6s** heartbeat (≥3× — no false alarms from scheduling jitter).
- Auto-reload on success in **both** modes with a ~3s countdown; failure never reloads.

## Acceptance criteria — the 12 conformance points
- **AC1** Version readout keeps both groups; a current row shows a green **"up to date"** instead of `→`.
- **AC2** Deploy readout renders **Mode · Live color · Loopback port · Container · Version** + the
  blue-green explainer naming both loopback ports and stating the public ports never change.
- **AC3** `GET …/deploy/status` returns the documented shape including `active`, ancient-gated, `no-store`.
- **AC4** (regression) the stream still survives the swap; client still clears its buffer on reconnect.
- **AC5** The host deployer emits `· still working · elapsed <t>` every ~6s, killed on every exit path.
- **AC6** Success logs the total: `✓ deploy complete in <t>`.
- **AC7** Panel shows status chip + real `Step N/M` parsed from the log + a 1s ticking timer + a
  looping CSS heartbeat ("pacman") animation.
- **AC8** >20s with no chunk → stalled state (red, animation paused) + `⚠ no output for Ns — the host
  deployer may have stopped.`; cleared the moment a chunk arrives.
- **AC9** Opening the panel auto-attaches to `active` (stream + timer from `active.startedAt`), guarded
  against double-attach.
- **AC10** `done: success` → ~3s countdown then reload; failure stays on screen. Admin responses carry
  `Cache-Control: no-cache` so the reload revalidates.
- **AC11** (regression) dev Deploy still pulls constructors `@latest`, now with its own heartbeat.
- **AC12** Confirmation is inline **below** the button (button stays put), hidden until requested.
- **AC13** `package.json` bumped + CHANGELOG; `vitest` + `tsc` + `next build` green.

## Out of scope
No change to the SSE contract or the 5 phase banners; no redesign of the admin shell; the Codex/
Khronoton version probes keep their current sources.
