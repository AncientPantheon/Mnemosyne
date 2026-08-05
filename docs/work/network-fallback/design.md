# network-fallback — the break-glass admin control (Pythia ⇆ direct-node)

Source: `websites/Pantheon/docs/pantheonic-architecture/HANDOFF-mnemosyne-network-fallback.md`.

Mnemosyne routes ALL on-chain traffic through Pythia (metered). The Network Fallback is the
**admin-gated, OFF-by-default, persisted** escape hatch: an ancient flips transport to `direct-node` so
the daimon talks to a Stoa node directly (UNMETERED) until Pythia recovers. This replaces the earlier
`MNEMOSYNE_KHRONOTON_DIRECT_NODE` env stub with a real admin-menu control that flips **every** lane.

## The load-bearing invariant

**BOTH lanes — reads AND sends — plus the autonomous Khronoton fires must branch on the SAME mode.** A
fallback that switches only one lane is a lie (the classic bug). Mnemosyne's lanes:

| Lane | Where it branches |
|---|---|
| Codex **reads** (data display) | `networkSettings.resolveNetworkModel` — direct-node ⇒ local node connection, else global Pythia |
| Codex **sim + send** (consumer `/codex`) | `codexRelaySigningClient` (browser) — direct-node ⇒ node `/pact/api/v1/{local,send}`, else Pythia |
| Codex **sim + send** (operator `/admin/codex`) | `/api/pythia/relay` (server) — branches server-side; browser client unchanged |
| Autonomous **Khronoton** fires + reads | `routeChainRuntimeThroughPythia` — direct-node ⇒ base node client, else Pythia |

## Layers (mapped to Mnemosyne's Next.js stack)

- **State (persisted, server):** `AdminSettings` gains `transportFallback: "pythia" | "direct-node"`
  (default `pythia`) and `nodeUrl` (default `https://node2.stoachain.com`). Server-persisted (not
  localStorage) because it must govern the SERVER Khronoton + relay too, and is admin-owned.
- **Config seam:** `/api/config` (public, URLs only) also returns `transportFallback` + `nodeUrl` so the
  browser lanes can branch. `lib/transport/serverTransport.ts` resolves the same on the server
  (`{ mode, nodeUrl, pythiaUrl }` + `pactBaseUrl(nodeUrl, chainId)`).
- **Write route:** `POST /api/admin/network-fallback` (ancient-gated) sets `{ transportFallback, nodeUrl }`
  (validates the mode enum + an http(s) node URL). `POST /api/admin/network-fallback/test` pings a node's
  `/info` server-side (avoids browser CORS) for the "Test Connection" button.
- **Boot/glue:** none needed — every lane reads the mode LIVE (server: `readAdminSettings`; browser:
  `/api/config`), so a flip takes effect on the next read/fire with no redux-persist sync hook. The node
  target is always configured (stored), ready before the flip.
- **Admin UI:** extend the existing **Network** section (`app/admin/network/NetworkPage.client.tsx`)
  with a `NetworkFallbackPanel`: the Pythia/Direct-Node toggle, node presets (node2/node1) + custom URL,
  Test Connection, and a loud **amber "traffic bypasses Pythia and is UNMETERED"** banner while direct is
  active. Admin-gated (only inside the admin shell).
- **Gateway probe (1g):** N/A — Mnemosyne has no Pythia online/offline connection badge to keep honest.

## Escape-hatch precedence

`transportFallback` (admin UI, persisted) is the control. The old `MNEMOSYNE_KHRONOTON_DIRECT_NODE=1`
env flag is kept as an additional server-only force-direct override (either ⇒ direct for Khronoton).

## Acceptance

- AC1 default is `pythia` (metered) — nothing changes until an ancient flips it.
- AC2 flipping to `direct-node` makes reads, sims, sends AND Khronoton fires all hit the node (verified
  per lane); flipping back restores Pythia.
- AC3 the toggle + write route are ancient-gated; `nodeUrl` validated.
- AC4 the panel shows the amber unmetered warning while direct is active + a working Test Connection.
- AC5 `nodeUrl` is a URL, never a secret; safe to expose via `/api/config`.
