# Mnemosyne adopts Pythia as its third constructor — Project design

## Problem

`websites/Pantheon/docs/pantheonic-architecture/organs/06-pythia-client-wire-in.md` establishes
`@ancientpantheon/pythia-client` as the third organ, alongside `@ancientpantheon/codex` and
`@ancientpantheon/khronoton-core` — every automaton that wants Pythia access installs and exposes
it the same way it already does the other two (doc §3). Today Mnemosyne's Update & Deploy panel
shows only 2 constructor rows and pulls only 2 packages on deploy.

Beyond the panel row, the doc's actual point (§1–2) is the dual-Apollo connector-auth protocol —
`PythiaConnector`, `ApolloSigner`, on-chain deploy+link, a live gated `x-pythia-key`. §5 frames
going live as a separate admin decision; the admin has now given that instruction explicitly:
adopt the organ **and** wire the full connector protocol, code-complete, with only the on-chain
identity-creation step left as a manual admin trigger (real STOA, a permanent on-chain identity —
not a decision any unattended run makes).

## Approach

Two independent-enough-to-split topics, run in order:

1. **`pythia-constructor`** — organ adoption (doc §3): real dependency, third `ConstructorStatus`
   row, deploy-time pull, standalone build tracing. Small, mechanical, mirrors Codex/Khronoton
   exactly.
2. **`pythia-connector-auth`** — connector-auth (doc §1–2): server-side `ApolloSigner` bridged to
   Mnemosyne's sealed codex, `PythiaConnector` + sealed secret storage, a manually-triggered
   multi-stage onboarding job, and automatic ongoing re-proving once active. Depends on topic 1
   only in that it's more coherent to land the dependency first; touches entirely different files.

Both topics share one version bump / CHANGELOG entry (done at the close of topic 2, describing
both halves for an outside reader) rather than two — a mid-flight "3rd constructor row" release
with no working connector yet is not a meaningful standalone version for this repo's users.

## Acceptance criteria

- [ ] Mnemosyne's Update & Deploy panel shows 3 constructor rows (Codex, Khronoton, Pythia).
- [ ] The full dual-Apollo connector-auth protocol is implemented and wired, server-side,
      no human in the loop for signing — but the one-time on-chain onboarding (deploy+link) fires
      only from an explicit ancient-gated admin action, never automatically.
- [ ] With no active connector link (true immediately after this ships), Mnemosyne behaves exactly
      as it does today — the new capability is strictly additive.
- [ ] `vitest`, `tsc`, and `next build` all pass; one version bump + CHANGELOG entry covers both
      topics.

## Out of scope

- Actually clicking the onboarding trigger.
- Revocation (lifecycle step 5).
- Pythia herself as her own consumer (doc §5's other deferred candidate).

## Topics

1. `pythia-constructor` — organ adoption: dependency, third panel row, deploy-time pull, build
   tracing.
2. `pythia-connector-auth` — full connector-auth: ApolloSigner, PythiaConnector, sealed secret
   storage, manual-trigger onboarding job, admin UI, ongoing auto re-proving.

## Decisions

Autonomous run confirmed 2026-07-31.

- Split into two topics rather than one combined plan — the plan skill's own escalation trigger
  (>10 tasks / >3 waves) is hit by the combined scope; splitting keeps each plan checkable and
  independently resumable.
- One shared version bump/CHANGELOG at the close of topic 2, not two — see Approach.
