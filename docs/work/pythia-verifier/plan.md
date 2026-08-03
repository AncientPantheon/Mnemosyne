# Pythia verifier — Plan

Topic 1 of the `pythia-verifier-alignment` project. Deliberately lean: the `/apollo-verify` route
is already built, contract-correct, and live (see `design.md`). The only code artifact is one
regression-guard test file; the build-gate and the operator URL-handoff are the topic's closing
steps (run by build/review and delivered in the final report), not separate plan tasks.

## Wave 1

- [x] T1: Add `tests/apollo-verify-contract.test.ts` — a byte-exact canonical-message regression
      guard plus source-contract assertions that `/apollo-verify` stays served and client-only.
      Follow this repo's established source-contract test style (regex/string assertions over file
      source + direct import of package builders in the node vitest env — see
      `tests/admin-panel.test.ts` for the source-contract style and `tests/pythia-apollo-signer.test.ts`
      for the precedent of importing `buildApolloOwnershipMessage` from `@ancientpantheon/codex/ui`
      in vitest, which already works in the node env). Do NOT introduce jsdom / React Testing Library
      — the repo has no such harness and this is a format + source guard, not a render test.

      The file has two `describe` blocks:

      **(a) Byte-exact canonical message.** Import `buildApolloOwnershipMessage` from
      `@ancientpantheon/codex/ui` (this is the exact function `ApolloVerifyView` — which Mnemosyne
      mounts — uses to build what it signs). Define the EXPECTED message independently in the test
      (the test owns the source of truth, so a codex-package drift fails loudly rather than the test
      vacuously re-deriving whatever the package does):
      `["Apollo ownership proof", `apollo: ${a}`, `nonce: ${n}`, `rp: ${rp}`].join("\n")`.
      Assert, for at least one `₱.`-standard and one `Π.`-smart sample account plus a hex nonce and
      `rp: "pythia.ancientholdings.eu"`:
        - `buildApolloOwnershipMessage(a, n, rp)` equals the expected string exactly (`toBe`);
        - it is exactly 4 lines when split on `"\n"` (`.split("\n").length === 4`);
        - line 0 is exactly `"Apollo ownership proof"`, line 1 is `"apollo: " + a`, line 2 is
          `"nonce: " + n`, line 3 is `"rp: " + rp` (single colon-space each, exact order);
        - there is NO trailing newline (`.endsWith("\n") === false`);
        - the message contains the full `₱.`/`Π.` account string verbatim.
      This mirrors, byte-for-byte, the 4-line form in
      `constructors/Pythia/apps/pythia/src/connectors/verify/canonicalMessage.ts`
      (`buildChallengeMessage`) — the RP side that must `Apollo.verify` the same bytes. (Reference
      that path in a comment; do not import cross-repo Pythia source into Mnemosyne's suite.)

      **(b) Source-contract: the route stays served + client-only.** Read the source of the three
      route files and assert (regex/`toMatch`, mirroring `tests/admin-panel.test.ts`'s `read(...)`
      helper style):
        - `app/apollo-verify/page.tsx` renders `ApolloVerifyMount` (the client mount), not any codex
          component directly (server page stays codex-free);
        - `app/apollo-verify/ApolloVerifyMount.client.tsx` lazy-loads with `ssr: false` (the codex
          tree must never run during SSR — a regression here SSR-breaks the route);
        - `app/apollo-verify/ApolloVerifyApp.tsx` imports `ApolloVerifyView` from
          `@ancientpantheon/codex/ui` and gates it behind the restore→unlock flow (references
          `UnlockScreen` and only renders `ApolloVerifyView` after unlock).

      — done when: `npx vitest run tests/apollo-verify-contract.test.ts` passes; the message-format
      block fails if any of the 4 lines, the colon-spacing, the order, or the no-trailing-newline
      invariant is changed (verify by locally mutating the expected string and confirming red, then
      reverting); `npx tsc --noEmit` introduces no new errors in the new file; and the full topic
      gate (`npx vitest run`, `npx next build --webpack` with `/apollo-verify` present in the route
      table) is green.
  - files: `tests/apollo-verify-contract.test.ts`
