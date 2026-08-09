# codex-create — create a new Codex from scratch on `/codex`

Today `/codex` only LOADS an existing codex (upload a `.json`). Add a "create from scratch" flow.

## The flow (operator-specified)

1. User picks a **Stoa seed type**: `koala` | `chainweaver` | `eckowallet`.
2. Mnemosyne **generates a fresh mnemonic** (`KadenaWalletBuilder.generateMnemonic(24)`) and derives the
   **first 2 keys** (pos0 = payment, pos1 = guard) of that seed (seedType-aware).
3. Using the **same seed words**, it generates the **Prime Codex Ouronet account** — **unactivated**
   (no on-chain deploy; that's a later, separate step).
4. The user sets a **password**; the mnemonic is shown once as the recovery phrase.

This maps exactly to `useCodexLifecycle().kickstart` (v3), which atomically installs the prime entities on
an empty codex:

```ts
await kickstart({
  codexIdSeed:    { mode: "words", value: mnemonic },       // the seed words → codex identity + prime ouro
  codexPrimeSeed: { source: "reuse-codexid-whole" },        // prime Ouronet reuses the same seed
  duoPrime:       { mode: "kadena-seed", seedType, mnemonic }, // pos0/pos1 kadena keys (seedType-aware)
});
```

`kickstart` reads the password cache (`getPassword()`), so **`authenticate(password)` must run first**. It
derives the double-Apollo identity + a fresh CodexGuard + the duoPrime keys + the prime Ouronet account
(unactivated). All in-memory (`MemoryCodexAdapter`), like the upload flow.

## Components (mirrors the existing upload flow in `app/codex/CodexApp.tsx`)

- **`LoadedState`** gains `{ kind: "creating"; adapter: MemoryCodexAdapter; seedType; password }`.
- **`LoadCodexScreen`** gains a "Create a new Codex" card: a seedType selector (koala default), a
  password + confirm, and a "Create Codex" button → `onCreate(seedType, password)`.
- **`CreateSession`** (parallels `EncryptedSession`): mounted inside an empty `<CodexProvider>`. On
  `isReady`, ONCE: `authenticate(password)` → generate mnemonic → `kickstart(...)` → show the recovery
  phrase. Renders: creating spinner → error (with back) → **recovery-phrase screen** (the 24 words +
  "Download your Codex `.json`" + a "I've saved my recovery phrase" gate) → `Dashboard`.
- **`CodexApp`**: `createCodex(seedType, password)` sets the creating state; renders the `CreateSession`
  under `<CodexProvider>` (same `signingClient` as the upload flow).

## Recovery / persistence

A new codex is IN-MEMORY (cleared on navigation). The recovery-phrase screen makes the two recovery
paths explicit and gates "Open Codex" behind a confirm: **write down the 24-word phrase** (the master
secret) AND **download the encrypted `.json`** (reload with the password). No secret is ever sent
anywhere — generation + kickstart are fully local.

## Acceptance

- AC1 the load screen offers "Create a new Codex" with a koala/chainweaver/eckowallet choice + password.
- AC2 create → an in-memory codex with a prime Stoa seed (pos0+pos1) and a prime Ouronet account,
  **unactivated**, derived from ONE mnemonic of the chosen type.
- AC3 the recovery phrase is shown once and download is offered before entering the dashboard.
- AC4 password must be set before kickstart (order); a kickstart error surfaces with a way back.
- AC5 no secret leaves the device; generation is `KadenaWalletBuilder.generateMnemonic` + `kickstart`.
