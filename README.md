# Mnemosyne

> A cloud-hosted codex vault for the StoaOuronet ecosystem — stores user codices encrypted at rest, serves them to consumer services (OuronetUI, AncientHoldings hub, future apps) under a unified identity, and enables transparent codex provisioning for non-crypto users.

## Status

**Discussion phase.** No code yet. Design conversation is in `.bee/discussions/2026-05-27-mnemosyne-vision.md`. Implementation does not begin until that doc stabilizes and the load-bearing decisions (trust model, regulatory posture, identity model, recovery protocol) are locked.

## What problem does this solve?

Today, the Ouronet codex (the encrypted multi-wallet store + signing + auth surface introduced by [`@stoachain/ouronet-codex`](https://www.npmjs.com/package/@stoachain/ouronet-codex)) exists in two places:

- **OuronetUI** — browser localStorage, tied to the origin. Different origin → different codex.
- **AncientHoldings hub** — server-side asset under the hub's master key. Hub-only.

This creates two problems:

1. **Origin fragmentation** — when OuronetUI migrates from `devwallet.ouronetwork.io` to `wallet.ouro.network`, each user's codex stays trapped under the old origin's localStorage. Same with AncientHoldings's planned `codex.ancientholdings.eu` migration. Users would have separate codices per origin with no way to unify.
2. **Web2 onboarding friction** — every new consumer service we ship would need its own codex flow. The upcoming movie-streaming platform wants users to register with `{email, password}` and *transparently* get an ouronet address. Today that requires re-implementing codex bootstrap per app.

Mnemosyne solves both by being the single source of truth for codices — a cloud-hosted vault that every consumer service authenticates against. The codex is stored once, served everywhere.

## What is this NOT?

- **Not a custodial wallet service.** The vault holds *encrypted* codices. The decryption key is split between the user (password + device passkey + recovery PDF) and the server (one Shamir share, useless alone). The operator cannot decrypt user codices even with full server access. See the design doc for the cryptographic guarantee.
- **Not a replacement for the `@stoachain/ouronet-codex` package.** It's a new *adapter* for the existing package — `MnemosyneCloudAdapter` — alongside the existing `LocalStorageCodexAdapter` and `MemoryCodexAdapter`. Consumers swap the adapter; the rest of the codex API is unchanged.
- **Not an identity provider for non-codex purposes** (yet). Initial scope: codex storage + retrieval. SSO-style "Sign in with Mnemosyne" is a future possibility, not a launch goal.

## Workspace

Sibling to the other 4 StoaOuronet workspace members:

```
StoaOuronet/
├── stoa-js/             — atomic-triplet + ouronet-codex packages (published)
├── OuronetUI/           — codex consumer (browser wallet)
├── DALOS_Crypto/        — crypto library
├── AncientHoldings/     — codex consumer (admin hub)
└── Mnemosyne/           — codex VAULT (this — serves the codices the others consume)
```

Not yet integrated into `.wasp/cross-pollinate.yml` — pending the design lock.

## Next step

Read `.bee/discussions/2026-05-27-mnemosyne-vision.md` for the full design discussion.
