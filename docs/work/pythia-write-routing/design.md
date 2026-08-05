# pythia-write-routing — route loaded-Codex SENDS through Pythia (meter conformance)

Source: `websites/Pantheon/docs/pantheonic-architecture/HANDOFF-mnemosyne-route-sends-through-pythia.md`
(+ sibling `HANDOFF-ouronetui-route-sends-through-pythia.md`). Rule: `organs/06` §6 — Pythia is the
Pantheon's on-chain **meter**; a transaction COUNTS only if relayed through `POST /stoachain/send`.

## Diagnosis (verified in code + against the live ledger)

Two on-chain paths in Mnemosyne:

1. **Loaded-Codex writes (the operator registering Apollo halves).** READS already route through
   Pythia (operator global `pythiaUrl` from `/api/config` is set → `stoachain` resolves `live-global`
   → petitions climb; live ledger showed `petitions: 1963`). **WRITES bypass Pythia:**
   `CodexShell.tsx` pins the codex signing client to the direct node
   (`updateUiSettings({ selectedNode:"custom", customNodeUrl: stoaChainNodeUrl })`), and codex-ouronet's
   `CodexSigningStrategy` submits via a `@stoachain/kadena-stoic-legacy` client straight to
   `<node>/chainweb/0.0/stoa/chain/0/pact/api/v1/send`. Never reaches the meter (ledger `transactions: 3`
   = only Pythia's own automaton fires).
2. **Khronoton fires.** khronoton-core's `createStoachainRuntime` submits to `${nodeBaseUrl}/…/pact/api/v1/send`
   — also direct-to-node. **Not fixable in Mnemosyne** (the submit lives inside khronoton-core). → upstream
   handoff, out of scope here.

## The seam (supported, not a hack)

`<CodexProvider>` accepts a **`signingClient`** prop → stored in `SigningClientContext` → surfaces via
`useSigningClientOverride()` → passed as `clientOverride` to `createSigningStrategy`, where
`pactClient = options.clientOverride ?? createClient(getPactUrl(...))`. `CodexSigningStrategy` calls exactly
two methods on that client: `dirtyRead(cmd)` (simulate/gas) and `submit(signed)` (broadcast, returns
`{ requestKey }`).

So: pass a **Pythia-relay signing client** as `signingClient` on the operator (admin) codex mount.

## Keying — why a SERVER relay

The connector's `x-pythia-key` is a **server** secret (minted by the server-side connector loop, masked in
the status route). The loaded Codex signs in the **browser**, so a keyed send can't originate there.
Therefore the browser signing client's `submit` POSTs to a **Mnemosyne server relay** which attaches the
key (`getGatedPythiaClient()` — already keyed via `connector.keyProvider()`) and relays to Pythia. This makes
the send both COUNT (routed through `/stoachain/send`) and be ATTRIBUTED to `mnemosyne` (keyed).

Two mounts, two postures (the COUNT happens for both — routing through `/stoachain/send` is what meters;
the key only changes attribution):

- **Operator `/admin/codex` (`MnemosyneCodex.tsx`):** KEYED via the **admin-gated** relay
  (`requireAncient`) so it is not an open Pythia-keyed relay. Attributed to `mnemosyne` — genuinely
  Mnemosyne's own operator activity.
- **Public `/codex` (`CodexApp.tsx`), any user's own uploaded codex — the case the operator asked about:**
  KEYLESS browser-direct to Pythia's public `/stoachain/send` (CORS `allow-origin: *`, and CORS does NOT
  allow the `x-pythia-key` header anyway). The user's tx still COUNTS (attributed `"direct"`); Mnemosyne's
  operator key is never exposed to anonymous visitors. (Switching this to keyed/`mnemosyne` attribution
  would require an open or login-gated server relay — a policy decision left to the operator.)

`dirtyRead` stays a direct `/local` to the configured node (accurate gas incl. caps/signers — Pythia's
`/stoachain/read` is code-only and would under-estimate gas). Only the WRITE is re-routed; that is what the
meter counts.

## Components

- `app/api/pythia/relay/route.ts` — `POST`, `requireAncient`. Body `{ cmds: unknown[] }`. Calls
  `getGatedPythiaClient().send({ cmds })`, returns the node response verbatim. Maps Pythia
  `503 { code:"pythia_no_tx_sender" }` to a clear `503` ("Pythia has no tx relay node configured") rather
  than silent failure or node fallback.
- `lib/pythia/codexRelaySigningClient.ts` — browser factory returning `{ dirtyRead, submit }`:
  - `dirtyRead(cmd)` → `POST ${stoaChainNodeUrl}/chainweb/0.0/stoa/chain/0/pact/api/v1/local` (node URL from
    `loadNetworkSettings()`), returns the `/local` result verbatim.
  - `submit(signed)` → `POST /api/pythia/relay { cmds:[signed] }` (same-origin creds); on the
    `pythia_no_tx_sender` 503 throw a clear error; else return `{ requestKey: body.requestKeys?.[0] ?? "", raw: body }`.
- `app/admin/codex/MnemosyneCodex.tsx` — pass `signingClient={createCodexRelaySigningClient()}` to
  `<CodexProvider>`.

## Acceptance criteria

- AC1 loaded-Codex (admin) writes go through `POST /stoachain/send` (keyed) — verified by the `/pyth`
  `transactions`/`failedTransactions` counter MOVING after a real registration.
- AC2 the relay is admin-gated (unauth → 401/403) and never falls back to a node on `pythia_no_tx_sender`.
- AC3 `dirtyRead` still returns accurate gas (direct `/local`, full command).
- AC4 reads/existing behavior unchanged; additive-only (no key linked ⇒ relay still routes, unkeyed →
  counts as `direct`, never throws for missing key).
- AC5 Khronoton path documented as an upstream khronoton-core handoff.
```
