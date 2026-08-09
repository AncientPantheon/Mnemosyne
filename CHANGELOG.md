# Changelog

All notable changes to Mnemosyne are documented here, newest first. This project
follows [Semantic Versioning](https://semver.org). The version in the **top entry**
MUST equal `package.json`'s `version` — this is enforced by
`tests/changelog-version.test.ts`, so every version bump ships its own documentation.
See [docs/RELEASING.md](docs/RELEASING.md) for the release procedure.

The running version is shown on the landing header (`v{{MNEMOSYNE_VERSION}}`), read
from `package.json`.

## [0.15.3] — 2026-08-09

### Changed

- **"Create a new Codex" now has a live password-requirements checklist.** Five rules (≥ 8 chars,
  uppercase, lowercase, number, symbol) each **tick as they're met**, plus a passwords-match indicator.
  The **Create button is genuinely disabled** (and now *looks* disabled — greyed, `not-allowed` cursor,
  which was the missing `:disabled` style) until every rule passes.

## [0.15.2] — 2026-08-09

### Fixed

- **"Create Codex" button did nothing** — it was silently `disabled` when the password was under 8 chars
  (and the disabled button still looked active), so a 7-char password gave no feedback. The button is
  now always clickable and validates on submit with a clear inline error ("Password must be at least 8
  characters." / "Passwords don't match."), cleared as you type.

## [0.15.1] — 2026-08-09

### Fixed

- **"Activate Account — a valid connector API key is required"** — consumer transactions failed. Pythia
  now HARD-GATES **every** gated endpoint (read, send, AND poll) with `401` when keyless — not just
  reads. A public `/codex` visitor has no key and can't send `x-pythia-key` from a browser, so its
  **send** (like its reads) can't go through Pythia. Consumer transactions now broadcast **node-direct**;
  the operator `/admin/codex` keeps the KEYED relay send **with a node-direct fallback** so a relay/key
  hiccup never blocks a tx. Net: the public consumer surface is fully node-direct (the only keyless
  option); Pythia-metered traffic is the operator surface, which holds the server-side connector key.
- **Password field on "Create a new Codex" gained a show/hide (eye) toggle**, matching the unlock screen.

## [0.15.0] — 2026-08-09

### Added — create a new Codex from scratch on `/codex`

`/codex` previously only LOADED an existing codex (upload a `.json`). Added a "Create a new Codex" flow:

- The load screen now has **Load / Create** tabs. Create asks for a **Stoa seed type**
  (koala / chainweaver / eckoWALLET) + a password.
- On create, Mnemosyne generates a fresh **12-word** mnemonic (`KadenaWalletBuilder.generateMnemonic`,
  fully local) and `useCodexLifecycle().kickstart`s the codex from that ONE seed: the prime Stoa seed's
  first two keys (pos0 payment + pos1 guard, seedType-aware) AND the **Prime Ouronet account**
  (`reuse-codexid-whole`), **unactivated** (on-chain deploy stays a separate step).
- Password is set (`authenticate`) **before** kickstart (which reads the cached password to encrypt).
- The **recovery phrase is shown once** on a dedicated screen (Copy / Download `.json`), gated behind a
  "I've saved my recovery phrase" confirmation before the dashboard — the codex is in-memory, so the
  phrase + exported `.json` are the only recovery.

No secret leaves the device — generation + kickstart are entirely local, mirroring the existing
upload flow's `MemoryCodexAdapter` mount.

## [0.14.1] — 2026-08-09

### Fixed

- **Smart/Ouronet accounts showed "observational" (inactive) though they're activated** — a v0.14.0
  regression. v0.14.0 routed the **public `/codex`** display reads *keyless* to Pythia's `/read`, but
  Pythia **hard-gates reads** (a keyless request → `401 "a valid connector API key is required"`), so
  every status/registration read failed and the codex fell back to "observational." A public visitor has
  no key and the browser can't send `x-pythia-key` (Pythia CORS allows only `Content-Type`/`Accept`), so
  a consumer read simply cannot go through Pythia. Fixes:
  - **Consumer `/codex` reads → node-direct** again (as before v0.14.0 / localhost / OuronetUI).
  - **Operator `/admin/codex` reads → KEYED relay `/read`** (attributed to `mnemosyne`) **with a
    node-direct fallback** so a relay/key failure never blanks the display.
  The signed-tx SIMULATE (declares signers) stays node-direct; SEND stays through Pythia. The keyed,
  attributed read path is the operator surface (which holds the server-side connector key).

## [0.14.0] — 2026-08-09

### Fixed — display reads now route through Pythia (metered + attributed) (`organs/06` §6a)

Mnemosyne's Apollo never appeared in Pythia's `/pyth` byConsumer despite an active connector: the codex's
data-display reads bypassed Pythia entirely. Two causes, both fixed:

- **`pactRead` was un-routed.** codex-ouronet display reads (account/balance/table/"read to show") go
  through `pactRead`, which routes to whatever `setPactReader` installed — and Mnemosyne never installed
  one, so it fell to the default **node-direct** reader. Now each codex mount installs a Pythia reader at
  boot: the operator `/admin/codex` → KEYED `/api/pythia/relay` `/read` (attributed to `mnemosyne`); the
  public `/codex` → keyless browser-direct to Pythia's `/read`.
- **The signing client's `dirtyRead` was node-direct for ALL reads.** Split it by signers: a DISPLAY read
  (no signers) routes through Pythia's KEYED `/read`; only a signed-tx SIMULATE (declares signers, whose
  keys-all guard needs them on a signer-aware `/local`) stays node-direct — the one legitimate node-direct
  read.

Break-glass Network Fallback ("direct-node") still reads node-direct. Audited: no other Mnemosyne
chain-read site exists (Khronoton uses its own runtime; `codexSnapshot` reads the sealed codex, not the
chain). Bumped `@stoachain/stoa-core` usage to import `setPactReader`/`PactReader` (already a `^4.3.0` dep).

## [0.13.1] — 2026-08-08

### Docs

- Corrected the two `connectorClient.ts` doc comments that still described the pre-self-heal wiring
  (`keyProvider()`) to reflect the `asKeySource()` refreshable key source + the 401 self-heal
  (`HANDOFF-mnemosyne-selfheal` follow-up). No behavior change — the functional self-heal shipped in
  v0.13.0.

## [0.13.0] — 2026-08-04

### Added — ephemeral-key self-heal (mandatory, `organs/06` §7)

The gated `x-pythia-key` is ephemeral and NOT durable — a Pythia gateway restart/deploy wipes its
in-memory key store, so every gated call 401s while the connector still shows the key "active." Mnemosyne
had neither the linkage nor a self-heal, so a Pythia deploy would silently break writes for up to the
~6 h TTL. Now both layers from §7:

- **§7c linkage:** bumped `@ancientpantheon/pythia-client` to `^3.1.0` and wired
  `getGatedPythiaClient()` with the **refreshable key source** `connector.asKeySource()` (`{ get,
  invalidate }`) instead of a pre-called `keyProvider()`. PythiaClient's transport now
  invalidates → re-mints → retries once on a clean `401 { invalid or expired connector key }`.
- **§7e consumer-side wrapper (required because Mnemosyne PROXIES gated calls):** the key-miss usually
  reaches us as a returned **body** or a re-thrown app error, not a clean transport 401. Added
  `isConnectorKeyMiss` (match by message, both directions), `resetGatedConnector` (drop the memoized
  dead-secret connector), `healGatedConnector` (reset + force re-mint, single-flighted), and
  `withConnectorSelfHeal(fn)` (heal → retry exactly once, no loop). Every gated proxy call —
  `/api/pythia/relay` (send/read/poll) and the Khronoton runtime's submit/poll — is wrapped; the
  connector is reset on link/unlink so a re-link always re-mints.

Redundant on purpose: the gateway's persisted store + the transport heal + this body-level wrapper each
recover a gateway restart independently.

## [0.12.3] — 2026-08-04

### Fixed

- **`/codex` load menu sometimes needed a manual refresh to appear.** The menu is rendered by a
  browser-only chunk loaded via `dynamic(import, { ssr: false })` (the codex crypto libs can't
  server-render). A `next/dynamic` lazy import has no built-in recovery, so if that chunk fails to load
  — overwhelmingly a **stale chunk right after a deploy** (an open tab references hashes the new build
  removed → the request 404s) — the mount hangs on "Loading Codex…" until a manual refresh. Added
  self-healing: on a chunk-load failure the wrapper reloads once (session-latched against loops, cleared
  on success) to fetch fresh HTML + current chunk hashes. Mnemosyne self-deploys from the admin panel,
  so this recurs on every update.

## [0.12.2] — 2026-08-04

### Fixed

- **The REAL cause of the `Keyset failure (keys-all)` on Apollo deploys.** The pre-fire simulation is an
  UNSIGNED command that only *declares* its signers. A Kadena `/local` signature-verifies by default, so
  the node treated the declared signers as un-signed and the `keys-all` ownership guard failed. The
  kadena client's `dirtyRead` avoids this by calling `/local?preflight=false&signatureVerification=false`
  (and emptying the sigs) — which is exactly why the same codex activated fine in OuronetUI (real client)
  but not here (a hand-rolled POST added in v0.12.1 that omitted the flags). Fixed `nodeDirtyRead` to
  mirror the client: `signatureVerification=false` + `preflight=false` + no-sig envelope. Not the codex
  package, not the transaction constructor, not the keys — a Mnemosyne bug in the simulate transport.

## [0.12.1] — 2026-08-04

### Fixed

- **Apollo-half deploys (and any keyset-guarded tx) failed with `Keyset failure (keys-all)`.** Regression
  from v0.11.4: the codex signing strategy's pre-fire **simulation** (`dirtyRead`) was routed through
  Pythia's `/stoachain/read`, which builds an UNSIGNED, signer-less `/local` (`signers: []`). A
  `keys-all` deploy guard needs the tx's declared signers present in the simulated command, so the
  pre-flight failed **before the tx was ever submitted** — the send path (Pythia `/send`, which relays
  the signed command verbatim) was fine. Fixed by making the pre-fire simulate a **node-direct `/local`
  of the FULL command** in both codex mounts AND the Khronoton runtime — unmetered plumbing per
  `organs/06` §6, exactly how Pythia's own `meterChainRuntime` passes `dirtyRead` through to the node and
  meters only `submit`. Sends and served data-reads still route through Pythia (metered). (Optional
  follow-up: a Pythia `/read` that relays a full command would let even the simulate flow through her.)

## [0.12.0] — 2026-08-04

### Added — Network Fallback (break-glass admin control)

The admin-gated escape hatch from `HANDOFF-mnemosyne-network-fallback.md`: an ancient can flip **all**
chain traffic from Pythia (default, metered) to a **direct Stoa node** (unmetered) when Pythia is
unreachable — replacing the earlier `MNEMOSYNE_KHRONOTON_DIRECT_NODE` env stub with a real UI control.

- **Admin panel** (`/admin#network` → Network section): a Pythia ⇆ Direct-Node toggle, node presets
  (node2/node1) + custom URL, a server-side "Test Connection", and a loud amber **"traffic bypasses
  Pythia and is UNMETERED"** warning while direct is active. Admin-gated.
- **State:** `AdminSettings` gains `transportFallback` (`pythia` default) + `nodeUrl`, persisted
  server-side; `/api/config` exposes them so the browser lanes branch on the same mode as the server.
  Set via the ancient-gated `POST /api/admin/network-fallback` (+ `/test`).
- **BOTH lanes branch (the load-bearing invariant):** codex **reads**
  (`resolveNetworkModel`), consumer + operator **sim/send** (`codexRelaySigningClient`), and the
  autonomous **Khronoton** fires (`routeChainRuntimeThroughPythia`) all switch to the node on
  `direct-node` and back to Pythia on `pythia` — resolved live, no restart.
- `MNEMOSYNE_KHRONOTON_DIRECT_NODE=1` remains as an additional server-only force-direct override.

## [0.11.4] — 2026-08-04

### Changed — Pythia is the ONLY on-chain path (no direct node except admin-gated)

Enforced the load-bearing rule (`organs/06` §6): **every** on-chain interaction — reads, gas
simulations, sends, and the autonomous Khronoton fires — routes through Pythia. A direct-to-node
connection is now permitted **only** via admin-gated settings.

- **Codex `dirtyRead` (gas simulation) now routes through Pythia** (`/stoachain/read`, a keyless Pact
  `local`), on both the operator (keyed relay) and consumer (keyless browser-direct) mounts — it no
  longer hits a chainweb node `/local`. (Pythia's `/read` is unsigned/keyless, so its gas omits
  signer-cap overhead; `calculateAutoGasLimit`'s margin covers it.)
- **Autonomous Khronoton fires now route through Pythia.** A new `routeChainRuntimeThroughPythia`
  wraps the chain runtime so its `submit`/`dirtyRead`/`listen` forward to Pythia (server-side keyed →
  attributed `mnemosyne`), mirroring Pythia's own `meterChainRuntime`. The injected node URL is
  ignored. *Limitation:* Pythia's `/poll` reports mined-status only (not the on-chain result), so a
  mined fire is treated as success; closing this needs Pythia's `/poll` to return the command result.
- **No per-user direct-node fallback.** The codex network model no longer builds a per-browser
  StoaChain node connection — StoaChain resolves through the global Pythia connection or not at all.
- **Admin-gated escape hatch:** `MNEMOSYNE_KHRONOTON_DIRECT_NODE=1` (server env) is the only way to
  put Khronoton back on a direct node.
- Consequence: Pythia is now a hard dependency — if it's unreachable, on-chain activity surfaces a
  clear error instead of silently falling back to a node.

The `/api/pythia/relay` endpoint is generalized to carry `read`/`send`/`poll` (was send-only).

## [0.11.3] — 2026-08-04

### Fixed

- **The loaded Codex's on-chain WRITES now route through Pythia's meter** (`organs/06` §6/§6a /
  `HANDOFF-mnemosyne-route-sends-through-pythia.md`). Reads already routed through the operator-global
  Pythia connection (counting as petitions), but the codex signing strategy submitted transactions
  **direct-to-node**, so a user activating an Apollo half (or any tx) from a loaded codex never reached
  Pythia's ledger. Fixed by injecting a **`signingClient`** into `<CodexProvider>` on BOTH codex mounts,
  with postures matched to who fires:
  - **Public `/codex` (any user's own uploaded codex):** the signed broadcast goes **keyless
    browser-direct to Pythia's public `POST /stoachain/send`**. The transaction **counts** in the meter
    (attributed `"direct"`); Mnemosyne's operator key is never exposed to anonymous visitors.
  - **Operator `/admin/codex`:** the signed broadcast is relayed through a new **ancient-gated**
    `POST /api/pythia/relay` → the server-side gated `PythiaClient` → Pythia, **keyed** with the
    connector's server-held `x-pythia-key`, so it both counts and is **attributed to `mnemosyne`**
    (Pythia's gateway CORS forbids the key header from a browser, so keyed must go server-side).

  Simulation (`dirtyRead`) stays a direct-node `/local` for accurate gas (and now surfaces a non-2xx
  node error instead of silently defaulting the gas). Pythia's `503 pythia_no_tx_sender` is surfaced
  clearly with no direct-to-node fallback.

  *Not covered:* Khronoton scheduled fires still submit direct-to-node — that submit lives inside
  `khronoton-core` and needs the consumer-side `meterChainRuntime` seam (`organs/06` §6a). Tracked as a
  follow-up.

## [0.11.2] — 2026-08-04

### Fixed

- **The Pythia connector panel now matches the Pantheonic connector-panel spec** (`organs/06` §2e).
  The two Apollo halves are framed account cards with the 162-char address ellipsis-truncated on its
  own line (it previously overflowed its box), each with an active/pending state chip; and the
  ephemeral key is shown as ONE consolidated card — the masked `pk_eph_…` key, a depleting timer bar,
  and an `expires in Xh Ym Zs` countdown that ticks every second (previously a bare `Xm Ys` number
  with no bar). The panel also keeps polling while linked so a key rotation refreshes the display.

## [0.11.1] — 2026-08-01

### Fixed

- **The Pythia connector now actually mints its ephemeral key once linked.** After pasting a
  dual-link-key the panel sat at "pending / not yet minted" forever, because nothing ever drove the
  connector's prove→verify round-trip (the v0.11.0 rework deliberately ran no background loop, and
  the gated client that would have triggered it on-demand isn't consumed anywhere yet). Added a
  connector heartbeat mirroring Pythia's own `SelfConnectorLoop`: a boot-time tick loop, an immediate
  tick when a key is linked, and a tick on each status poll — so the pair converges to active (prove
  → Pythia's resolver links → prove → secret) and the panel shows the live masked key + expiry.

## [0.11.0] — 2026-08-01

### Changed

- **Reworked the Pythia connector to mirror Pythia's own automaton pattern.** The previous connector
  wiring hand-rolled Apollo signing, local key generation, and on-chain deploy/link — built before
  Pythia shipped her own self-consumer implementation, and diverging from it. This replaces all of
  that with the real pattern, a large simplification (−500 lines):
  - Apollo challenge signing now delegates to Codex's `autoSignApolloChallenge` (no hand-rolled
    derivation).
  - Identity generation and the on-chain "Activate as Pythia Key" deploy happen in Codex's own admin
    tab (already available in Mnemosyne's Codex surface) — signed by an ordinary payment key, with the
    Apollo account passed as data. Mnemosyne no longer builds or signs any Pact transaction for this.
  - The connector is now driven by pasting the resulting **dual-link-key** in the Pythia admin panel;
    it uses one `DualLinkConnector` (`@ancientpantheon/pythia-client` bumped to 2.7.x) with request-time
    key refresh, showing the live linked status with a masked secret and expiry countdown.
  - **Correction:** the earlier "Apollo keys can't sign Pact transactions" gap was a non-problem — no
    Apollo key ever signs a Pact transaction. That premise, and the dead-coded onboarding it produced,
    are removed.
  - No behavior change until an operator links a pair: with nothing linked, chain reads stay
    unattributed exactly as before.

## [0.10.0] — 2026-08-01

### Fixed

- **Khronoton can now sign for chainweaver / eckowallet operator seeds, not just koala.** The
  autonomous key resolver (`lib/khronoton/keyResolver.ts`) previously hand-rolled key derivation and
  ran *every* HD-wallet seed through the koala lane — so a chainweaver or eckowallet operator seed
  derived a different key, tripped the safety guard, and silently refused to sign. It now delegates
  all derivation to Codex's own seedType-complete headless resolver (requires bumping
  `@ancientpantheon/codex` to `0.8.0`), which handles every seed type correctly. koala seeds are
  unaffected; ouro accounts stay covered by a thin fallback. As part of the same change, mixed-curve
  codexes are handled safely: an Apollo-curve account can never leak into the Kadena signer set.

### Aligned

- **Mnemosyne is confirmed and guarded as a Pythia verifier.** `/apollo-verify` was already served
  and correct; this adds a byte-exact regression guard so the ownership-proof message Mnemosyne signs
  can't silently drift from what Pythia verifies (the format is now pinned by a test, independent of
  the codex version the deploy pulls). No behavior change — the route already worked.
- A full scan against the current Pantheonic architecture confirmed Mnemosyne conforms on design
  tokens, widths, header, admin routing, master-key vault, and the deploy panel; the two items that
  had drifted (the Khronoton key resolver above, and a mixed-curve signer-set filter) are now closed.

## [0.9.1] — 2026-08-01

### Fixed

- **Constructor row order in the Update & Deploy panel is now Pythia, Codex, Khronoton** — a new
  Pantheon-wide rule (`automaton/05-deploy-panel-and-progress.md` §1e): the CONSTRUCTORS group's
  order is fixed and identical across every automaton's panel, not left to each automaton's own
  install/wiring order. Mnemosyne's panel previously showed Codex, Khronoton, Pythia (install
  order); it now matches the canonical order.

## [0.9.0] — 2026-07-31

### Added

- **Pythia joins Codex and Khronoton as Mnemosyne's third constructor.** The Update &
  Deploy panel now shows three constructor rows instead of two — `@ancientpantheon/
  pythia-client` is a real dependency, its installed-vs-latest version is tracked the
  same way Codex's and Khronoton's are, and a deploy now pulls all three at `@latest`.
- **Full Pythia connector-auth wiring, code-complete and ready — not yet switched
  on.** Mnemosyne can now prove ownership of a dedicated Standard + Smart Apollo pair
  to Pythia entirely server-side (no human in the loop for signing) and receive
  attributed, gated read/send/poll access instead of the anonymous default. A new
  section in `/admin#pythia`, below the existing gateway-URL setting, shows the
  connector's identity status and a one-time onboarding action — gated behind an
  explicit "I understand this spends real STOA" confirmation, since it deploys two
  Apollo accounts on-chain and links them. This action is **not fired automatically
  by anything** (not on deploy, not on startup, not on a schedule) — an ancient admin
  triggers it deliberately, once, when ready. Until then, and for every existing user
  today, nothing changes: reads stay unattributed exactly as before.
- **Known limitation, documented rather than guessed around:** the on-chain half of
  onboarding (deploying and linking the Apollo pair) currently has no working signer
  for Mnemosyne's own Apollo-curve keys — it fails safely, before spending anything,
  with a clear error, rather than risk a wrong signature. Wiring a working signer for
  this leg is the next piece of work before the onboarding action can actually be
  used; see `docs/work/pythia-connector-auth/design.md` for the full investigation.


- **Deploy panel now conforms to Pantheonic `automaton/05` — status readout + always-moving
  progress.** The governing rule: *at any instant while a deploy runs, something in the deploy box
  must be visibly moving; if motion stops, the deploy is stuck.* A blue-green rebuild sits inside
  single silent steps for minutes (native addon compile, `chown -R`), so a streamed build log goes
  motionless and a healthy deploy was indistinguishable from a wedged one.
- **Server heartbeat (the load-bearing half).** `deploy/host/mnemosyne-deploy.sh` emits
  `· still working · elapsed <t>` every ~6s for the whole run, killed on **every** exit path via an
  `EXIT` trap (success, `fail()`, and the `ERR` path). This makes the panel's motion a genuine
  liveness signal rather than decoration, and yields the three-state diagnosis: ticking+advancing =
  healthy · ticking+frozen = slow but fine · **stopped** = genuinely stuck. Success now states the
  total (`✓ deploy complete in <t>`). A new `TERM`/`INT` trap lands on a terminal status so a killed
  deployer can't leave a phantom `running` that the panel would auto-attach to forever.
- **`GET /api/admin/deploy/status`** returning the documented shape
  `{ mode, color, port, container, version, active }`. `active` is the newest non-terminal deploy with
  its **real** `startedAt` (the log file's birth time), so a late-joining browser shows true elapsed.
- **On-box deploy readout** — **Mode · Live color · Loopback port · Container · Version** plus the
  blue-green explainer, so a colour/port incident is diagnosable without an SSH session. The host
  deployer injects `MNEMOSYNE_COLOR`/`MNEMOSYNE_LOOPBACK_PORT`/`MNEMOSYNE_CONTAINER` into the
  container it starts (the container deliberately has no docker/nginx power to inspect this itself).
- **Progress display** — status chip, real `Step N/M` parsed from the build log, a 1s ticking timer,
  a looping CSS "pacman" heartbeat animation, a **>20s stall watchdog** that pauses and reddens it
  with an explanatory line (≥3× the 6s heartbeat, so jitter never false-alarms), **auto-attach** to a
  running deploy this browser did not trigger, and **auto-reload on success** with a short countdown.
- Dev mode gets the same heartbeat and log contract, so the whole progress display works on localhost.

### Changed

- Version rows show a green **"up to date"** instead of the `→` when current.
- Deploy confirmation now appears **below** the button (the button stays put) instead of replacing it.
- Admin responses carry `Cache-Control: no-cache` so the post-deploy auto-reload revalidates and
  actually fetches the new build instead of silently re-rendering the old UI.

## [0.7.7] — 2026-07-21

### Changed

- **Operator codex (server-sealed) top bar no longer duplicates the Lock Codex button.**
  The codex package already renders a working Lock/Unlock control in its identity row (which,
  backed by the master-key auto-resolver, needs no password field); the wrapper's second Lock
  button in the top bar was redundant. `MnemosyneCodex` now mounts
  `topbarActions={<CodexPortabilityControls />}` (Download/Load only). This follows the new
  Pantheonic **automaton codex-mount convention §6b** (one lock control, in the identity row;
  top-bar actions are portability only) — documented in the architecture so every automaton
  mounts the codex the same way.

## [0.7.6] — 2026-07-19

### Changed

- **Landing deck now conforms to Pantheonic §3.7 — every navigable view has its own URL.**
  The deck previously turned pages in memory with the address frozen at `/` (the "single
  opaque link" anti-pattern). Now the **URL is the source of truth**: each of the eleven views
  is addressable — the hero at the bare `/`, and `#codex/seeds-accounts`, `#codex/keys-tools`,
  `#codex/onboarding`, `#modes`, `#storage`, `#identity/standard-smart`, `#identity/dual-apollo`,
  `#stoictags`, `#security/guarantees`, `#security/roadmap`. A bare topic hash (`#codex`)
  resolves to that topic's first page.
- The shown page is derived from `location.hash` on load (deep-link), on `popstate` (Back/
  forward), and on `hashchange` (manual URL edit / native hash anchor). Navigation writes the
  view's own URL via the History API: discrete jumps (Tier-1/Tier-2 buttons, in-content CTAs,
  Home/End) push a history entry so **Back** returns to the previous view; continuous stepping
  (wheel/swipe/arrows) replaces, so the address always reflects the current view without
  flooding history. Deep-links, Back/forward, and hash edits are all browser-verified.

## [0.7.5] — 2026-07-19

### Changed

- **Dropped the redundant "What it is" Tier-1 header button.** The hero is the landing
  home and is already reached by clicking the Mnemosyne wordmark (left of the version
  medallion, `homeHref` "/"). It stays as the first deck page — only its duplicate header
  button is removed, leaving six Tier-1 topics.

## [0.7.4] — 2026-07-19

### Fixed

- **Documentation Tier-1 link no longer 404s.** The clean `/docs` URL is now rewritten
  onto the static docs index (`public/docs/index.html`) in `next.config.ts`. The docs are
  static files, so Next served them only at `/docs/index.html`; a bare `/docs` 404'd (and
  `/docs/` merely 308-stripped back to `/docs`). In-page doc cross-links are unaffected —
  they are all absolute (`/docs/apollo-curve.html`, home `/`).

## [0.7.3] — 2026-07-18

### Changed

- **Landing deck — every page is now ONE self-contained screen with its own title.**
  Each Tier-1 page (or Tier-2 sub-page) fits a standard desktop stage (~800px) with no
  internal scroll, and carries a uniform Cinzel title rendered by the deck (`.lp-page-title`)
  so no page reads as torn from context.
- **"What it is" is a single page (no Tier-2).** It is the hero/landing home (tied to the
  Mnemosyne wordmark): identity visual, tagline, lede, Launch Codex CTAs, the three pillars,
  and a one-line "your own language" note. The redundant "What Mnemosyne is / is NOT" prose
  and the four "Not a…" cards were dropped (they live in the docs).
- **"Four Modes" is a single page (no Tier-2).** All four identity modes
  (Sovereign / +Password / +Email / +Phone) shown compactly on one screen.
- Trimmed the Storage and Dual-Apollo sub-pages to fit one screen — the Arweave explainer,
  the "why three layers" rationale, and the off-chain-Schnorr detail are condensed to a line
  with a link to the full docs.
- Compacted the deck's CSS density (paddings, gaps, margins, hero visual cap) so pages fill
  one screen; the overflow-y fallback stays for very short viewports.

## [0.7.2] — 2026-07-18

### Fixed
- **Landing deck: topics now sit flush at the top of the stage.** Clicking a
  Tier-1/Tier-2 tab (or scrolling) previously showed the topic mid-stage or far below
  the fold. Causes: `.lp-page` was content-box, so `height:100% + padding` made each
  page taller than the stage and every page drifted progressively lower under the
  `translateY(-index·100%)`; content was vertically centred; and a CSS transition on
  the transform stalled at 0 under the `height:100%` flex chain. Fix: `box-sizing:
  border-box` (each page is exactly the stage height), `justify-content: flex-start`,
  reset the shown page's scroll on navigation, and make the page change an INSTANT
  transform (a CSS-transition/WAAPI slide stalls under a throttled requestAnimationFrame,
  leaving the deck stuck at the first page — an instant transform always applies).
- **Docs home links** point at the React landing (`/`); removed the orphaned static
  `public/index.html`.

## [0.7.1] — 2026-07-18

### Changed
- **Landing is now a fixed-stage "page-turn" deck** (Pantheonic design §4). Each Tier-1
  header topic (What it is · The Codex · Four Modes · Storage · Identity · StoicTags ·
  Security) shows on a single ~960px page; big topics paginate into Tier-2 sub-pages
  (Onboarding folds under The Codex, Roadmap under Security). Wheel/trackpad, arrow/
  page/space keys, and touch-swipe turn one page at a time (discrete, no partial
  scroll); the header buttons jump and highlight the active page; `prefers-reduced-
  motion` cuts the transition. All content is preserved and rendered in the DOM
  (inactive pages `aria-hidden`). The fixed height is scoped to the landing only —
  `/admin` and `/codex` keep normal scroll.
- **Documentation** restored as a Tier-1 header button (→ `/docs`).

### Fixed
- **Launch Codex button contrast** — near-black text on the gold accent fill so the
  label reads clearly.

## [0.7.0] — 2026-07-18

### Changed — Pantheonic Design Architecture conformance (UI rehaul)

Aligned every Mnemosyne surface to the Pantheonic Design Architecture (the cross-site
UI law; reference implementation Pythia). Presentational/structural only — no auth,
crypto, deploy, or engine behaviour changed.

- **One canonical token contract.** `public/assets/pantheon-tokens.css` declares the
  Pantheon-standard `:root` names (`--bg/--bg-2/--panel/--panel-2/--line/--ink/--ink-soft/
  --ink-mute/--accent/--accent-dim/--danger/--radius`) carrying Mnemosyne's own
  bronze/parchment values. The four parallel token namespaces (`--admin-*`, `--cxpg-*`,
  the landing's Tailwind config + raw hex) collapse onto it.
- **One content width.** A single `--maxw: 1536px` everywhere; the 860 / 1080 / 1200 /
  1280 width drift and the dead `.cxpg-main/-header/-shell` selectors are gone.
- **One shared header + one session source.** A `useMe()` hook is the single `/api/me`
  consumer; the 3-level `PantheonHeader` (sticky `.ph`, full-chrome-width separator,
  ancient-gated Admin, text-node identity) is worn by the landing and the admin (admin
  variant = L1 only). The four hand-rolled headers and duplicate fetches are removed.
- **Sidebar + content-pane admin.** The tile-list-of-pages becomes one hash-routed
  shell (`/admin` = "select a section" prompt, `/admin#<section>`), driven by a static
  section-config; sections are gate-free panes behind ONE `AdminGate`; the old
  per-function routes redirect into the shell.
- **React landing.** The static Tailwind-CDN `public/index.html` is replaced by a React
  route (`app/page.tsx`) styled with the canonical tokens, using the shared header with
  anchor-nav; all marketing content preserved. The Tailwind Play CDN is dropped.
- **Cleanup.** Removed the duplicated `/api/me` client types (now the shared
  `MeResponse`), the unused `AuthStatus` component, and dead admin-header CSS.

Notes: the embedded `/codex` product keeps its own functional topbar (view-tabs +
callback back/logout) — the shared header covers the site surfaces (landing + admin).
Plan + design captured under `docs/work/pantheonic-ui-migration/`.

## [0.6.2] — 2026-07-18

### Fixed
- **Deploy auto-provisions BuildKit (`buildx`) on the host.** The on-box deployer runs
  `docker build --progress=plain`, which needs the `buildx` component — absent on boxes
  using Ubuntu's `docker.io` package (or any fresh host), which aborted the build before
  it began. `mnemosyne-deploy.sh` now has an `ensure_build_prereqs` preflight that
  checks for `buildx` and installs `docker-buildx` on the spot if missing (idempotent;
  a no-op once present), so a deploy never needs a manual host step. Extensible for any
  future host-side build prerequisite.

## [0.6.1] — 2026-07-17

### Fixed
- **Docker build compiles better-sqlite3 on Alpine** (the 0.6.0 Khronoton engine's
  store). better-sqlite3 ships no musl prebuild, so the `deps` stage now installs the
  `python3`/`make`/`g++` toolchain to build it from source — without which the
  optional dep was silently skipped and the engine would fail at container boot. The
  toolchain lives only in the discarded multi-stage layer (the runtime image stays
  slim); the runtime image adds `libstdc++` for the compiled addon, and the standalone
  stage copies `better-sqlite3` + `bindings` + `file-uri-to-path` in explicitly so the
  `createRequire` load always resolves the native binary. No app-code change.

## [0.6.0] — 2026-07-17

### Added
- **Khronoton engine LIVE — Mnemosyne is now a full Automaton.** The six injection
  seams from handoff 05 are wired and the tick loop runs in the server:
  - **Signing (`KeyResolver`)**: the sealed operator codex signs autonomously —
    `lib/khronoton/keyResolver.ts` unseals the backup + machine password per fire and
    `smartDecrypt`s exactly the requested entry (pure keypairs, ouro accounts, and
    seed-derived accounts re-derived at their recorded index with a pub-match guard).
    No human in the loop; plaintext never outlives the call.
  - **Chain (`ChainRuntime`)**: the package's own `/blockchain/stoachain` adapter
    (`createStoachainRuntime`) — no more Pythia gate.
  - **Store (`Database`)**: better-sqlite3 at `data/khronoton/khronoton.db` (on the
    mounted data volume — survives redeploys), engine schema auto-installed.
  - **Loop**: `instrumentation.ts` starts `startKhronotonLoop` at server boot
    (exactly-once claim-before-fire). Kill switch `KHRONOTON_DISABLED=1`; cadence
    `KHRONOTON_TICK_MS`. Audit trail: `data/khronoton/audit.jsonl`.
- **Khronoton admin API** — `/api/admin/khronoton/[...path]` adapts the package's 16
  framework-agnostic handlers (list/get/fires/signers/commit/edit/pause/resume/
  delete/simulate/execute-now/trigger/recover/batch). Everything ancient-gated;
  mutations additionally demand the `x-khronoton-confirmed` header (the UI's confirm
  gate → `runGated` retry round-trip).
- **Real Khronoton console** at `/admin/khronoton` — the package UI (List,
  Detail/Observe with fire history, the two-pane Builder with Simulate → AUTO-gas)
  replaces the static mockup iframe; themed to the admin bronze/parchment palette
  via `--khr-*` tokens. The mockup asset is retired.

### Changed
- **"Update Constructors" → "Update & Deploy"** (Pythia's designation): route renamed
  `/admin/update-constructors` → `/admin/update-deploy`; the panel's version tables
  are now visually separated groups (Mnemosyne / Constructors) instead of headings
  flush against the previous rows.

## [0.5.0] — 2026-07-15

### Added
- **Khronoton wired in as a constructor dependency** (`@ancientpantheon/khronoton-core`,
  the finalized headless scheduler engine). Mnemosyne now installs Khronoton alongside
  Codex, and the **Update Constructors** panel shows it as a first-class wired row
  (installed version vs npm latest) that can drive a deploy — replacing the previous
  "not wired" preview state.
  - **Deploy plumbing:** both the localhost dev deploy (`lib/deploy/devDeploy.ts`) and
    the on-box blue-green deployer (`deploy/host/mnemosyne-deploy.sh`) now pull
    `@ancientpantheon/khronoton-core@latest` next to Codex, so every deploy keeps the
    installed engine current.
  - **`readKhronotonUiVersion()`** reads the installed engine version from
    `node_modules` (mirrors the Codex reader); the ancient-gated
    `/api/admin/khronoton-version` route now reports `{ installed, available,
    updateAvailable, wired: true }`.

### Notes
- `wired: true` means Khronoton is an installed **dependency** that deploys with
  Mnemosyne — it is **not** the same as switching on the autonomous engine. Turning on
  codex-signed, no-human-in-the-loop firing (the six engine seams, incl. the
  `ChainRuntime` backed by the Pythia network runtime) remains a separate, Pythia-gated
  wire-in — see `docs/handoffs/05-khronoton-engine-wire-in.md`. The `/admin/khronoton`
  surface stays a UI mockup until then.
- `better-sqlite3` (Khronoton's optional reference DB backend) is an **optional**
  dependency, resolved from prebuilt binaries; it is not required until the engine
  wire-in and cannot fail the install/build.

## [0.4.0] — 2026-07-13

### Added
- **Download + Load for the Mnemosyne own-codex** (server-custody portability).
  - **Download** (`POST /api/admin/codex/export`): prompt a new password (twice) → the
    server re-keys the codex *machine-password → your new password* and returns a
    portable backup you download. The live codex is untouched; the file is protected by
    the password you chose (not the machine password you never see).
  - **Load** (`POST /api/admin/codex/import`): pick a Mnemosyne codex backup + enter its
    password → the server re-keys it *file-password → machine-password* and seals it under
    the master key, **adopting** it (auto-unlocks as usual). This replaces the current
    codex, so it's gated behind an explicit confirm + a "download a backup first" nudge.
  - Both re-keys run **server-side in Node** (master key + machine password never leave
    the box) using the codex package's new `rekeyCodex` primitive (codex 0.6.0, handoff
    07) — which owns the drift-proof secret-field walk. Mnemosyne only ferries the opaque
    blob (`lib/mnemosyneCodexRekey.ts`) and never touches plaintext key material.

### Changed
- **Codex constructor → 0.6.0** (brings `rekeyCodex` + `changeCodexPassword`).

### Notes
- Download/Load use Mnemosyne's raw-snapshot backup format (backup ↔ restore, and moving
  a codex between automatons). Loading a **wallet-export (envelope) codex** is rejected
  with a clear message — it needs one more small codex export (a pure `snapshotFromExport`);
  flagged as a handoff-07 follow-up.
- Minor packaging note for the codex agent: `rekeyCodex` runtime-exports from `/ouronet`
  only, though the root `.d.ts` re-exports it — worth aligning the root JS entry.

## [0.3.5] — 2026-07-13

### Added
- **Auto-reload after a live deploy** — no more manual refresh. When a bundle deploy
  finishes, the panel reloads to the freshly-swapped build automatically (dev still
  shows the "reload to run the new build" note, since dev needs a server restart).
- **Granular deploy progress.** The on-box deployer now emits numbered phase banners
  with elapsed time (`═══ [1m20s] 2/5 · Build image (BuildKit) ═══`) and builds with
  BuildKit `--progress=plain`, so the admin terminal streams every step live instead
  of the terse legacy-builder output.

### Changed
- **Container base image → Node 22** (`node:22-alpine`), silencing the `EBADENGINE`
  warnings from deps that require Node ≥22 (`@stoachain/kadena-stoic-legacy`, the
  Solana/wallet-standard transitives).

### Fixed
- **Deployer can't corrupt itself mid-run.** A deploy `git pull`s the very scripts it's
  executing; the scan step now snapshots the deployer to an immutable temp dir and
  re-execs from there, so pulling new script versions can't corrupt the running deploy.

## [0.3.4] — 2026-07-13

### Added
- **Mnemosyne itself now has its own version row** on Update Constructors, above the
  Constructors table: running build (`installed`) vs the version on the deploy branch
  (`available`, read from `main`'s `package.json` on the public GitHub repo — the same
  code a Deploy `git pull`s + rebuilds). A Deploy updates the app *and* the constructors,
  so an app-source update is now a first-class deploy reason: the **Deploy button lights
  up** when Mnemosyne OR any wired constructor is behind — a code-only change no longer
  hides behind "Re-deploy."

### Changed
- **Removed the redundant "Khronoton (coming soon)" card** from Update Constructors.
  Both constructors already appear in the Constructors status table (Khronoton shows
  `not wired → v0.2.0`), so the card was pure duplication and its text was stale (it
  claimed the engine was "still being built" — the `/server` engine has shipped). The
  one useful bit — why Khronoton is unwired + where to preview its UI — is now a single
  inline line under the table, shown only while an unwired constructor exists.

## [0.3.3] — 2026-07-13

### Added
- **Khronoton UI mockup embedded at `/admin/khronoton`** (handoff 04). The placeholder
  is replaced by the package's self-contained static mockup (`public/khronoton-mockup.html`,
  iframed in the ancient-gated page): the four views — Cronotons list, two-pane Pact
  builder (Config/Payload/Gas Payer/Signatures/Execute + 7 schedule modes), Observe
  fire-history (LIVE/TEST, paginated 50/page), Public read-only — plus the consumer-theme
  recolor switcher. Visual review only.

### Notes
- **Still NOT wired to the live engine.** `@ancientpantheon/khronoton-core@0.2.0` ships a
  real headless `/server` engine (store + atomic claim-before-fire + executor + tick), but
  wiring it live means Mnemosyne autonomously codex-signs on-chain transactions — gated
  behind the standing "finalize all three Constructors first" decision (handoff 05 §4).
  The mockup stands in until that gate opens and the 0.3.0 `/ui` package ships.

## [0.3.2] — 2026-07-13

### Added
- **Single Deploy button (Update Constructors).** The two separate "Update Codex" /
  "Update Khronoton" sections are replaced by one **Constructors** status table plus a
  single **Deploy** button that "comes alive" (primary) when any wired constructor has
  a newer npm version, and always allows a manual re-deploy. Progress streams live into
  an in-page terminal over SSE (`/api/admin/deploy/stream/<id>`).
- **On-box, zero-downtime deploy (live).** The running container can't rebuild itself
  and holds no Docker/nginx power, so a live Deploy drops a request in the deploy spool
  (`lib/deploy/spool.ts`); a privileged **host deployer** (`deploy/host/`) does a
  blue-green rebuild+swap (build new image → start the other color on the other port →
  health-check → flip the nginx upstream → drop the old color) and streams its log back
  through the shared volume. Installed once via `deploy/host/install-host-deployer.sh`
  (systemd path-unit watcher + nginx upstream include). The site stays up throughout.
- **Dev deploy path.** On localhost, Deploy pulls the constructors at `@latest`
  in-process and streams npm's output into the same terminal; reload picks up the build.

### Notes
- **Khronoton is not wired yet.** Only the logic-only `@ancientpantheon/khronoton-core`
  is published; the plug-and-play `khronoton-server`/`khronoton-ui` packages
  (docs/handoffs/03) don't exist. Khronoton shows as a preview and joins the single
  Deploy button — no separate button — once its package ships.

## [0.3.1] — 2026-07-13

### Fixes
- **Favicon on the landing page.** The landing is served as raw HTML (`app/route.ts`),
  so Next's `app/icon.svg` convention didn't inject a favicon there the way it does for
  the App Router pages — the tab showed no icon. Added an explicit
  `<link rel="icon" href="/icon.svg">` to `public/index.html`.

## [0.3.0] — 2026-07-13

### Infrastructure
- **Mnemosyne now runs as a Docker container** (the automaton-container model —
  `docs/handoffs/04-automaton-blueprint.md`). One Next-standalone image = the whole
  app+website+API; operator state (sealed codex, master key, secrets, Pythia config)
  lives in host paths mounted in, so a rebuild/redeploy never loses it. `Dockerfile`,
  `docker-compose.yml` (persistence volume + rw `.env.local` mount for rotation),
  `.dockerignore`, and `deploy/DOCKER.md`.
- **Release images on ghcr.io** — `.github/workflows/image.yml` builds + pushes
  `ghcr.io/ancientpantheon/mnemosyne:<version>` on a `v*` tag via the automatic
  `GITHUB_TOKEN` (no PAT), for reproducible releases + rollback.
- **Retired the pm2 rsync deploy workflow** — superseded by the container + (next) the
  on-box Deploy button. Pushing to `main` no longer auto-deploys; updates go through
  the Deploy button (blue-green) or a tagged ghcr.io image.

### Repo
- Moved to `github.com/AncientPantheon/Mnemosyne` (public) and the local tree to the
  AncientPantheon workspace.

## [0.2.2] — 2026-07-12

### Codex
- **Both codex surfaces now render through one shared `CodexShell`.** The Mnemosyne
  server codex (`/admin/codex`) had drifted from the consumer `/codex` (a long
  tagline wrapped its top-bar over the body); extracting the consumer's proven
  layout into a shared shell makes the two identical (only the top-bar action
  differs — Export/Load vs Lock).

### Admin
- **"Update Constructors"** page — merges Update Codex with a scaffold **Update
  Khronoton** (previews the `@ancientpantheon/khronoton-core` npm version; disabled
  until the package is wired). Replaces the standalone Update Codex tile.
- **"Mnemosyne Khronoton"** page — a scaffold for scheduling codex-signed autonomous
  transactions (coming soon; references the Khronoton package handoff). New landing
  tile.
- `GET /api/admin/khronoton-version` (ancient-gated) — the Khronoton version preview.

## [0.2.1] — 2026-07-12

### Fixes
- **Login/logout no longer bounce to `localhost:3005` on the live site.** The OIDC
  `redirect_uri` was already host-derived, but the same-site "return home" redirects
  (callback success, auth-error bounces, logout) still used `request.url`, which
  behind nginx reflects the app's internal `127.0.0.1:3005` bind host. New
  `resolveOrigin()` / `siteUrl()` derive every same-site redirect from the request's
  public host (`X-Forwarded-Host`/`-Proto`), so login and logout land on
  `codex.ancientholdings.eu`, not localhost.

## [0.2.0] — 2026-07-12

### Codex packaging
- **Consume the single npm `@ancientpantheon/codex` aggregate** instead of five
  `file:`-linked sub-packages. Imports rewritten to the aggregate subpaths
  (`/provider`, `/hooks`, `/ui`, `/ouronet`, root, `/arweave`). `ARWEAVE_CHAIN_ID`
  is inlined to keep the Node-only sqlite adapter out of the browser bundle. CI no
  longer checks out the private Codex repo — it `npm ci`s the published package.

### Update Codex
- The **"Update Codex" button is a real npm puller** (`npm install
  @ancientpantheon/codex@latest`) with a before→after version delta.
- The admin panel shows **installed vs. latest-on-npm** and flags when an update is
  available. It is **deploy-mode aware**: on the live standalone bundle it points to
  a redeploy (codex is compiled in) rather than a no-op in-app pull.
- The `/codex` load screen shows a **Codex engine v… badge** (the actually-installed
  version), and the version reads correctly on the standalone bundle.

### Security — codex master key
- **Master-key rotation that re-seals the operator codex** under the new key — a
  generic vault re-seal, never a bare key swap (per automaton handoff 02). Ordered
  plan → atomic re-seal → persist key → flip in-memory, with rollback; proven by a
  codex-survives-rotation regression test.
- Ancient-gated `POST /api/admin/security/rotate-master-key` (requires
  `acknowledgedExport`) + the `/admin/security` page.

### Admin panel
- **Hub-style restructure**: `/admin` is a landing with a tile per function, each on
  its own ancient-gated page — Mnemosyne Codex, Update Codex, Pythia Connector,
  Codex Security, Network Status.

### Auth
- **OIDC redirect URI is derived from the request host** (honoring the reverse
  proxy's forwarded headers), so it can never fall back to localhost on the live
  site. No per-environment redirect config to keep in sync.

### Fixes
- Codex-storage routes return a **clear 503** ("set MNEMOSYNE_MASTER_KEY …") instead
  of an opaque 500 when the server isn't configured; the codex-ui surfaces it.
- `MNEMOSYNE_CODEX_DIR` documented so the sealed codex lives outside `app/` and
  survives `--delete` deploys.

## [0.1.0] — 2026-07-11

Initial Mnemosyne application (`codex.ancientholdings.eu`).

- Next.js 16 App Router shell; the standalone Codex UI mounted at `/codex`
  (upload → unlock → dashboard).
- AncientHub **OIDC login** (auth-code + PKCE, RS256 id_token verify) with an
  **ancient-role** admin gate.
- Admin panel: Pythia connector config + Update Codex.
- **Mnemosyne's own sealed operator codex** at `/admin/codex` — server-side,
  master-key-sealed, auto-unlocked for the ancient admin (Phase 4).
- Self-contained standalone deploy (pm2 + nginx) with CI auto-deploy on push.
