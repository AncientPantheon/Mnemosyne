# Retainer 01 — Mnemosyne session state (as of 2026-07-13)

A self-handoff so a fresh conversation can continue without re-deriving. Pair it with the
persistent memory (`mnemosyne_automaton_codex.md`, auto-loaded via MEMORY.md — READ IT first;
it's the fullest record). This retainer is the fast-orientation layer. Series continues as
`retainer-02.md`, `03`, … as needed.

---

## 0. Orientation
- **Mnemosyne** = the first Pantheonic Automaton (Codex + Pythia + Khronoton + domain), a Next.js 16
  app at **codex.ancientholdings.eu**.
- **Repo:** `D:/_Claude/AncientPantheon/Mnemosyne` (MOVED from StoaOuronet). GitHub `AncientPantheon/Mnemosyne`.
- **Local dev:** `npm run dev` (= `next dev -p 3005`) FROM the AncientPantheon path. NOT the
  `web/` static mockup (see §5). `/admin` = the real app; the marketing landing is `public/index.html`.
- **Live box:** `ssh stoanodeprime` (root@85.215.141.198 = StoaNodePrime). Prod SSH is authorized for
  Mnemosyne on-box ops; reading prod secrets INTO chat stays blocked.
- **Canonical docs:** `docs/handoffs/04-automaton-blueprint.md` (how to build any automaton) +
  handoffs `01`–`07`. Memory file is the deepest record.

## 1. Version state
- **`main` = v0.4.0** (deployable, tested, build-green).
- **Live container ≈ v0.3.4** (last confirmed). **0.3.5 + 0.4.0 NOT yet deployed** — a Deploy is
  pending. The box repo was pre-pulled to 0.3.5 earlier; `main` has since advanced to 0.4.0. One
  Deploy pulls `main` (0.4.0) + `codex@latest` (0.6.0) together.
- This session's arc: 0.3.2 (on-box Deploy button) → 0.3.3 (Khronoton UI mockup) → 0.3.4 (Mnemosyne
  version row + removed redundant Khronoton card) → 0.3.5 (deploy-UX: BuildKit progress + auto-reload
  + Node 22 + snapshot-safe deployer) → **0.4.0 (codex Download/Load + codex 0.6.0)**.

## 2. Shipped on `main`
- **On-box tokenless Deploy button** (blue-green, zero-downtime, SSE progress). `deploy/host/*`
  (systemd path→service→scan.sh[snapshot-safe]→deploy.sh), `app/api/admin/deploy/*`,
  `app/admin/update-constructors/*`. PROVEN live multiple times.
- **Codex Download/Load** (server-custody portability). `lib/mnemosyneCodexRekey.ts`,
  `app/api/admin/codex/{export,import}/route.ts`, `app/admin/codex/CodexPortabilityControls.tsx`.
  Uses codex **0.6.0** `rekeyCodex` (imported from `@ancientpantheon/codex/OURONET`, not root — a
  codex packaging slip). Format = RAW SNAPSHOT (`JSON.stringify(snapshot)`); wallet-**envelope**
  uploads are rejected (need a codex `snapshotFromExport` — open follow-up on handoff 07).
- Node 22 base image, granular BuildKit `--progress=plain`, auto-reload after live deploy,
  scan.sh snapshot-and-re-exec (so a deploy's `git pull` can't corrupt the running scripts).

## 3. Package-first flow + the three open handoffs (owner routes each to its agent)
The owner's standing preference: **fix shared capability in the package, not per-consumer.**
- **Khronoton** — `docs/handoffs/06-khronoton-true-dropin.md` → the Khronoton agent. Asks it to ship
  `@ancientpantheon/khronoton-stoachain` (the ChainRuntime, so consumers don't copy the Hub) + build
  the planned 0.3.0 UI (`/handlers` `/provider` `/hooks` `/ui`). `khronoton-core@0.2.0` = headless
  engine only; **0.3.0 is being built now**. Mnemosyne's wire-in is PARKED on branch
  **`khronoton-engine`** (has handoffs 06/07 + a pending blueprint §7a). When 0.3.0 ships:
  **I wire the 6 seams + the real `/admin/khronoton` builder UI (replace the iframe mockup) + run the
  tick loop → merge to `main` → owner deploys.** Handoff 05 has the seam→Mnemosyne mapping.
- **Codex** — `docs/handoffs/07-codex-rekey-primitive.md` → the codex agent. **DONE:** codex **0.6.0**
  shipped `rekeyCodex` + `CODEX_IDENTITY_SECRET_FIELDS` + a `rekey-inventory` guard test (drift-proof)
  exactly as asked; wired into Mnemosyne 0.4.0. **Open:** `snapshotFromExport` (to accept wallet
  envelope Load) not yet requested/shipped.
- **Pythia** — `docs/handoffs/04-automaton-blueprint.md` §13 (NEW). Pythia is a **constructor-service**:
  an npm package AND a deployed webpage/admin — a shape the blueprint now covers (three shapes: pure
  constructor / automaton / constructor-service). It reuses the infra core (§3 container+Deploy, §5
  login, §6 sealed *secrets* — its own creds not a codex, §9 admin, §10 versioning), skips Codex-UI/
  Khronoton, and ships TWO artifacts (npm + container) on ONE version. Owner routes the blueprint to
  the Pythia agent to build Pythia as an admin-container like Mnemosyne.

## 4. Deploy mechanics
- Deploy = owner clicks **"Deploy update"** at `/admin/update-constructors` (ancient-gated), OR I
  trigger via the box spool (drop `<id>.request.json` in `/var/www/codex.ancientholdings.eu/data/deploy/`,
  chown 1001). One deploy: `git pull main` + `npm install @ancientpantheon/codex@latest` + docker build
  (Node 22) + blue-green swap (mnemosyne-blue:3005 ↔ mnemosyne-green:3006, nginx upstream flip) + drop old.
- The Update panel shows **Mnemosyne** (running vs `main`'s package.json via GitHub raw) + **Constructors**
  (Codex wired; Khronoton "not wired → v0.2.0"). Button lights when app OR a wired constructor is behind.
- **Advice given:** deploy small increments — deploy 0.4.0 now; deploy again after the Khronoton wire-in.
  Don't batch. Deploy is cheap (zero-downtime).

## 5. Gotchas / load-bearing facts
- **Localhost = the mockup trap (JUST resolved).** `web/_serve.js` serves `web/index.html` = the old
  single-row "v0.1 design" static MOCKUP (no `/admin`). The REAL app = `npm run dev` (two-row landing,
  Login button, v0.4.0, `/admin`). Both the StoaOuronet workspace `.claude/launch.json` AND
  `LocalHost/registry.json` registered Mnemosyne as the static `web/` mockup. Fixed the launch.json
  (added real `mnemosyne` entry, renamed mockup `mnemosyne-web-mockup`); wrote
  `D:/_Claude/LocalHost/docs/HANDOFF-mnemosyne-registry.md` for the LocalHost agent to fix the registry
  (`dir: AncientPantheon/Mnemosyne/web` → `AncientPantheon/Mnemosyne`, `type: static` → a dev-server type).
- **Box git:** run `git config core.fileMode false` once (the install script `chmod +x`'d deploy scripts
  → shows as a mode-diff that blocks `git pull`).
- **`app/apollo-verify/`** = the owner's separate Apollo/dual-key work (via their Pythia agent), untracked;
  I've kept it OUT of every commit. Don't touch/commit it.
- Codex 0.6.0 packaging slip: `rekeyCodex` runtime-exports from `/ouronet` only (root `.d.ts` claims
  root). `/ouronet` IS Node-safe server-side (Next build compiles the routes fine).
- No stale clone exists (checked). Mnemosyne is only at `AncientPantheon/Mnemosyne`.

## 6. Open threads / next actions
- [ ] Owner: **deploy 0.4.0** (click Deploy) → codex Download/Load + codex 0.6.0 live; test with an
      ancient session (the part only the owner can exercise).
- [ ] Khronoton 0.3.0 ships → **I wire it in** (branch `khronoton-engine`) → merge → deploy.
- [ ] Codex `snapshotFromExport` follow-up (only if wallet-envelope Load is wanted).
- [ ] Pythia agent builds Pythia per blueprint §13.
- [ ] LocalHost agent fixes the registry per the handoff.
- [ ] Owner's Apollo work (`app/apollo-verify/`) — theirs to finish + commit; rides the next deploy.

## 7. Key commits this session (`main`, newest first)
`4f487b9` blueprint constructor-service/Pythia · `df247af` codex Download/Load v0.4.0 · `fe94273` deploy-UX
v0.3.5 · `bed05e2` Mnemosyne version row v0.3.4 · `598b7e6` drop redundant Khronoton card · `728aed2`
Khronoton mockup v0.3.3 · `47a49f9` single Deploy button v0.3.2. Branch `khronoton-engine` (`cb0f0d8`) =
handoffs 06/07 + blueprint §7a (parked, docs-only).

## 8. Pointers
- `docs/handoffs/` 01 (pact module) · 02 (master-key codex protection) · 03 (khronoton package, superseded
  by 05/06) · 04 (automaton blueprint — CANONICAL, incl. §13 Pythia) · 05 (khronoton engine wire-in) ·
  06 (khronoton true drop-in) · 07 (codex rekey primitive).
- Memory: `mnemosyne_automaton_codex.md` (deepest record) + the pool/hub/other notes via MEMORY.md.
- Reference repos: Khronoton `D:/_Claude/AncientPantheon/Khronoton`, Codex `D:/_Claude/AncientPantheon/Codex`,
  Hub `D:/_Claude/StoaOuronet/AncientHoldings` (codex-cronoton + StoachainRuntime reference).
