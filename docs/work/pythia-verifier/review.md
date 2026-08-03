# Pythia verifier — Review

Scope: one new file, `tests/apollo-verify-contract.test.ts` (no production code changed — the
`/apollo-verify` route was already built + live). ≤3-file tier → correctness + conventions, inline.

## Correctness
- The byte-exact message guard imports the REAL builder Mnemosyne uses
  (`buildApolloOwnershipMessage` from `@ancientpantheon/codex/ui`, the function inside the mounted
  `ApolloVerifyView`) and diffs it against an expected string the test owns independently — so it is
  a genuine regression guard, not a vacuous self-diff. **Verified red-on-mutation:** injecting a
  double colon-space into the expected `apollo:` line turned 2 tests red; reverting returned green.
- Source-contract block pins the three load-bearing invariants (client mount, `ssr:false`,
  `ApolloVerifyView` gated behind unlock) that would SSR-break or silently drop the verifier route.
- No CONFIRMED findings.

## Conventions
- Mirrors `tests/admin-panel.test.ts` (`read()` helper + source-contract regex style) and
  `tests/pythia-apollo-signer.test.ts` (importing `buildApolloOwnershipMessage` from
  `@ancientpantheon/codex/ui` in the node vitest env, an established, working precedent). No new test
  infrastructure introduced (no jsdom/RTL), per design. No findings.

## Gate (after last edit)
```
Test Files  51 passed (51)
     Tests  402 passed (402)
```
`tsc --noEmit`: 66 errors, all pre-existing/unrelated (zero reference the new file). `next build
--webpack`: compiled clean, `/apollo-verify` present in the route table.

## Note carried to the umbrella / Topic 2
Topic 1's gate ran against the repo-pinned codex `0.6.1`. Production floats codex at `@latest`
(currently 0.7.0; the next deploy pulls 0.8.0). Topic 2 bumps the pin to `^0.8.0` and re-runs the
full gate — that is where the verifier is validated against the codex version the next deploy will
actually serve. The message guard is version-independent by construction (it owns the expected
bytes), so it holds across the bump unless codex genuinely changes the format — in which case it
fails loudly, which is the point.

**Clean pass, 1 round.**
