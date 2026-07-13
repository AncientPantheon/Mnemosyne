# Handoff 06 — Make Khronoton truly drop-in: ship the StoaChain runtime

**For:** the Khronoton package agent (repo `D:/_Claude/AncientPantheon/Khronoton`).
**From:** the Mnemosyne (consumer) agent.
**Supersedes nothing** — it *adds one requirement* to the already-excellent 0.3.0 plan in
`.bee/recon/codex-package-blueprint.md`.

## Why this exists
The owner tried to wire Khronoton into Mnemosyne and asked, fairly: *"it's supposed to be
drop-in — why must I copy from the Hub?"* Auditing 0.2.0 against a real consumer, the answer:

- `.` + `/server` (0.2.0) — the **engine** is genuinely drop-in. 
- `/handlers` + `/provider` + `/hooks` + `/ui` (0.3.0, blueprinted) — the **UI** will be drop-in.
- **`ChainRuntime` — is NOT.** It's a consumer seam (STATE.md decision: *"ChainRuntime uses
  dirtyRead/submit/listen; the getPactUrl loopback override becomes a consumer routing
  choice"*). So every StoaChain automaton (Mnemosyne, then Caduceus, Aletheia) must hand-copy
  the Hub's `StoachainRuntime` and re-verify money-path signing. That's the gap.

`KeyResolver` and the UI **adapter** staying consumer-provided is *correct* — they're
inherently host-specific (Mnemosyne's sealed codex; Mnemosyne's API routes). But the
**StoaChain network binding is identical for every StoaChain automaton** and should be
shipped once.

## The ask — ship a ready-made StoaChain ChainRuntime
Add a **`@ancientpantheon/khronoton-stoachain`** package (recommended — keeps `khronoton-core`
chain-agnostic; mirrors how `codex-ouronet` is the chain edge of the codex family). It
depends on `khronoton-core` (for the `ChainRuntime` type) + `@stoachain/*`, and exports:

```ts
export function createStoachainRuntime(opts: {
  getNodeUrl: (chainId: string) => string;   // consumer routing (Pythia/loopback) — the
                                              // "getPactUrl loopback = consumer choice" seam
  networkId: string;
  namespace: string;
  gasStationAccount: string;
}): ChainRuntime;
```

It must satisfy the engine's `ChainRuntime` interface **verbatim** (from the 0.2.0 `/server`
`.d.ts`, reproduced so you don't have to re-derive it):

```ts
interface ChainRuntime {
  Pact: { builder: { execution(code: string): unknown } };
  createClient(url: string): {
    dirtyRead(tx): Promise<{ result: { status; error?; data? }; gas? }>;
    submit(tx): Promise<{ requestKey: string }>;
    listen(desc): Promise<{ result: { status; error? }; reqKey? }>;
  };
  isSignedTransaction(tx: unknown): boolean;
  universalSignTransaction(tx: IUnsignedCommand, keypairs: UniversalKeypair[]): Promise<unknown>;
  calculateAutoGasLimit(gas: number): number;
  anuToStoa(anu: number): number;
  getPactUrl(chainId: string): string;
  networkId: string; namespace: string; gasStationAccount: string;
}
```

**Extraction source:** the Hub's `StoachainRuntime` — already fully mapped in your own
`.bee/recon/codex-cronoton-map.md` (the ~4,250-line Hub read); the live code is under
`D:/_Claude/StoaOuronet/AncientHoldings/lib/codex-cronoton/` (`client.ts`, `codex-signers-read.ts`,
and wherever `Pact`/`createClient`/`universalSignTransaction` are wrapped). Rename the Hub
constants to the seam field names: `KADENA_NETWORK→networkId`, `KADENA_NAMESPACE→namespace`,
`STOA_AUTONOMIC_OURONETGASSTATION→gasStationAccount`. Make `getPactUrl`/node routing an
injected `getNodeUrl` opt (that's the loopback-vs-Pythia choice, now a runtime option, not a
copy-paste each consumer edits).

## Also — build 0.3.0 (`/handlers` + `/provider` + `/hooks` + `/ui`) per your blueprint
Your `codex-package-blueprint.md` already nails this. Two things to pin so Mnemosyne truly
drops it in:
1. **UI adapter seam** = "how the UI reads/mutates cronotons" (list/get/create/edit/pause/
   resume/delete/trigger/fires/manual-batch). The consumer implements it by calling its own
   ancient-gated API routes, which wrap `khronoton-core/handlers`. Ship reference adapters
   (Memory + fetch-based) + `emptySnapshot`/`assertAdapter`, exactly like the codex family.
2. **KeyResolver stays consumer-provided** (it opens the consumer's codex) — that's correct.
   Just document the two-line bridge every consumer needs: resolver returns `IKadenaKeypair`
   (`privateKey`), the signer wants `UniversalKeypair` (`secretKey`) — remap `privateKey →
   secretKey`. (The executor already remaps internally; a consumer writing a raw KeyResolver
   should know.)

## The bar — what "drop-in" means to Mnemosyne after this ships
Mnemosyne (and every future automaton) then writes **only**:
1. a **codex `KeyResolver`** — opens its sealed operator codex (`getKeyPairByPublicKey`,
   `listCodexPubs`). ~30 lines, inherently ours.
2. a **cronoton UI adapter** — calls its own `/api/admin/khronoton/*` routes (which wrap
   `khronoton-core/handlers`). Boilerplate.
3. a **`better-sqlite3` db** handle (+ `installSchema(db)` once).
4. `createStoachainRuntime({ getNodeUrl, networkId, namespace, gasStationAccount })`, mount
   `<KhronotonProvider adapter={...}>`, `import "@ancientpantheon/khronoton-stoachain"`-free
   `import "@ancientpantheon/khronoton-core/ui.css"`.

**No `@stoachain/*` wiring. No signer assembly. No engine internals.** That's the target.

## Reference
- Engine `/server` API (seams, `startKhronotonLoop(TickCtx)`, store CRUD, row shapes, the 7
  schedule modes) — fully mapped; the `ChainRuntime` interface above is verbatim from it.
- Hub source: `AncientHoldings/lib/codex-cronoton/*` (+ your `codex-cronoton-map.md`).
- UI packaging: your `codex-package-blueprint.md` + `codex-cronoton-builder-spec.md`.
- Mnemosyne's codex adapter example (for the KeyResolver/adapter shape):
  `Mnemosyne/lib/codex-dropin/MnemosyneServerCodexAdapter.ts`.
