# Pythia verifier — `/apollo-verify` — Design

Topic 1 of the `pythia-verifier-alignment` project — see `../pythia-verifier-alignment/design.md`
for the umbrella problem statement, the full Phase-1 gap report, and the topic split.

## Problem

Pythia's connector-linking flow needs an external verifier that holds a user's Apollo keys, signs
Pythia's ownership challenge in-browser, and redirects back with the signatures. Mnemosyne is one of
the two named verifier entities. **Investigation finding: Mnemosyne already serves a
contract-correct `/apollo-verify`** — it mounts `ApolloVerifyView` from `@ancientpantheon/codex/ui`,
whose message builder is byte-for-byte identical to Pythia's `canonicalMessage.ts`, with the correct
redirect shape and per-account skip behavior; the route returns HTTP 200 in production. So no
feature needs building. What's missing is (a) a **regression guard** so the byte-exact contract
can't silently drift when the codex aggregate is re-pulled at `@latest` on every deploy (production
already floated 0.6.1 → 0.7.0 → next-deploy 0.8.0 with no test pinning the message), and (b) the
operator handoff (the exact origin URL to register in Pythia's admin).

## Approach

Confirm-and-guard, not build. Three pieces:

1. **A byte-exact canonical-message regression test** (`tests/apollo-verify-contract.test.ts`, new).
   The risk is a silent divergence between what Mnemosyne signs and what Pythia verifies — the #1
   integration bug, and live-relevant because the codex aggregate version floats at deploy time.
   The test asserts the message format Mnemosyne relies on is exactly the 4-line
   `Apollo ownership proof` / `apollo:` / `nonce:` / `rp:` form, `\n`-joined, no trailing newline —
   the same shape as `constructors/Pythia/apps/pythia/src/connectors/verify/canonicalMessage.ts`. It
   pins the *contract string* (a stable, version-independent constant the test owns) rather than
   reaching into the codex package internals, so it survives codex minor bumps but fails loudly if
   the expected format ever changes. Rationale: a test coupled to the installed codex dist would
   pass vacuously (it'd just re-derive whatever the package does); a test that owns the expected
   bytes independently is the actual guard.
   - Rejected alternative: mount `ApolloVerifyView` in jsdom and drive the full redirect. Mnemosyne
     has no React-testing/jsdom harness (its client-component convention is source-contract tests),
     and the codex tree pulls browser crypto that won't run headless — disproportionate for a
     format guard.

2. **A source-contract assertion** that `app/apollo-verify/` still mounts the codex `ApolloVerifyView`
   behind the unlock flow and that `page.tsx` stays client-only (`ssr: false`) — so a future refactor
   can't quietly drop the route or SSR-break it (the codex tree must not run during SSR). Folded into
   the same test file, mirroring the repo's existing source-contract test style
   (`tests/admin-panel.test.ts`).

3. **Validate against codex 0.8.0** (what the next deploy will actually run): confirm `next build`
   still emits the `/apollo-verify` route and the message format still matches after the aggregate
   moves to 0.8.0. (The codex bump itself is Topic 2's mechanical change; Topic 1 only asserts the
   verifier survives it. If Topic 2 runs first the validation is automatic; if Topic 1 ships first,
   note that production will still float to 0.8.0 on the next deploy regardless.)

No change to `app/apollo-verify/*` is expected — it's already correct. If the validation surfaces an
actual drift in codex 0.8.0's `ApolloVerifyView`, that becomes a Codex-package concern (out of this
repo) and is reported to the operator, not worked around in Mnemosyne.

## Acceptance criteria

- [ ] `tests/apollo-verify-contract.test.ts` exists and asserts the byte-exact 4-line canonical
      message format (`Apollo ownership proof` / `apollo: <A>` / `nonce: <n>` / `rp: <rp>`,
      `\n`-joined, no trailing newline), matching Pythia's `canonicalMessage.ts`.
- [ ] The same test asserts `/apollo-verify` is still served: `app/apollo-verify/page.tsx` renders a
      client-only mount, `ApolloVerifyApp.tsx` imports `ApolloVerifyView` from
      `@ancientpantheon/codex/ui` and gates it behind the restore→unlock flow.
- [ ] `vitest`, `tsc`, and `next build` are green; `next build`'s route table lists `/apollo-verify`.
- [ ] The operator is handed the exact verifier origin to register in Pythia's admin
      (`https://codex.ancientholdings.eu`, deep-linked as `…/apollo-verify`) and a plain statement of
      the round-trip that becomes testable once registered.

## Out of scope

- Any change to the codex package's `ApolloVerifyView` (a Codex-repo concern if drift is found).
- Registering Mnemosyne in Pythia's admin (the operator does this).
- The codex `0.6.1 → 0.8.0` version bump itself (Topic 2's mechanical change; Topic 1 only validates
  the verifier survives it).
- Any full browser/jsdom round-trip harness.
