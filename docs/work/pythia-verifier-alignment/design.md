# Mnemosyne — Pythia verifier + Pantheonic alignment — Project design

## Problem

Pythia's connector-linking flow now delegates ownership-proof to an external **verifier**: the
operator picks a consumer's two Apollo halves (`₱.` standard + `Π.` smart), is redirected to a
chosen verifier that holds the user's Apollo keys in a Codex, the verifier signs Pythia's challenge
in-browser and redirects back with the signatures, and once both halves prove, Pythia autonomously
fires `A_LinkDualApiKey`. The Pantheon architecture names **Mnemosyne and OuronetUI** as the first
two supported verifier entities. Pythia's side is fully built and live. Mnemosyne needs to (a) be a
correct verifier and (b) be brought up to the current Pantheonic architecture where it still drifts.

## Phase 1 — Gap report (Mnemosyne ↔ current Pantheonic architecture)

Compared against the library through CHANGELOG 2026-08-03 (Tier-3 URL addressability, the
pythia-verifier entity doc, and the "DELEGATE key resolution to Codex" khronoton refinement).
Mnemosyne is at **v0.9.1**. **The headline finding: almost everything already conforms** — prior
topics this project ran (`pantheonic-ui-migration`, `section-urls`, `deploy-panel-05`,
`pythia-constructor`/`pythia-connector-auth`, and this session's §1e row-order fix) already closed
the design-system, width, header, routing, vault, and deploy-panel gaps. Two items are actionable;
the rest are pre-existing drift explicitly out of scope.

| Standard | Verdict | Evidence |
|---|---|---|
| Colour tokens (`design/` §2) | **CONFORMS** | `public/assets/pantheon-tokens.css` declares the canonical set; pinned by `tests/pantheon-tokens.test.ts`. |
| Content width `--maxw: 1536px` (§1) | **CONFORMS** | single constant, test-enforced; the 860/1080/1280 drift is retired. |
| 3-tier header (§3) | **CONFORMS** | `components/PantheonHeader.tsx` implements L1/L2/L3 + `variant="admin"`; `tests/pantheon-header.test.ts`. |
| Admin Tier-1 URL routing (§3.7/§5.1) | **CONFORMS** | `AdminShell.client.tsx` derives the view from `location.hash` + a `hashchange` listener; every `/admin/<section>` is a redirect stub. Hash-addressable = §3.7-compliant ("path or #hash"). The "in-memory shell" concern in the brief is inaccurate for Tier-1. |
| Landing §3.7 | **CONFORMS** | each of 11 deck views has its own `#slug` (`section-urls` topic). |
| Automaton blueprint (`automaton/04`) | **CONFORMS** | Mnemosyne is the reference implementation; all §12 files present. |
| Master-key / codex vault (`automaton/02`) | **CONFORMS** | `mnemosyneVault.ts`/`mnemosyneCodexStore.ts`/`mnemosyneRotation.ts` + proof tests; §6b single lock; §7a re-key delegates to `@ancientpantheon/codex/ouronet`'s `rekeyCodex`. |
| Deploy panel (`automaton/05`, incl. §1e) | **CONFORMS** | CONSTRUCTORS order Pythia→Codex→Khronoton (commit `fd09251`); full status/stream/heartbeat/auto-attach. |
| Pythia client wire-in (`organs/06`) | **CONFORMS** | v0.9.0 adopted the third constructor + connector-auth. |
| **Verifier `/apollo-verify` (`identity/`)** | **CONFORMS (already built + live)** | Route served (`app/apollo-verify/*`), mounts `ApolloVerifyView` from `@ancientpantheon/codex/ui`; the package's builder is **byte-for-byte identical** to Pythia's `canonicalMessage.ts`; redirect shape (`challenge=<nonce>&proofs=<encodeURIComponent(JSON.stringify([{apollo,sig}…]))>`, `%5B%5D` when none) and per-account skip are correct. Codex custody ✓, stable HTTPS origin ✓ (`codex.ancientholdings.eu`). |
| **Khronoton KeyResolver (`organs/05`)** | **GAP (actionable, in scope)** | `lib/khronoton/keyResolver.ts` hand-rolls koala-only derivation (`assertHexSecret` hex-only regex + hardcoded `seedType:"koala"` + a koala-SLIP-10 `fromSeedAccount` that throws its wrong-key guard on chainweaver/eckowallet seeds). Must delegate to Codex's headless seedType-aware resolver per the 2026-08-03 CHANGELOG ("Mnemosyne carries the identical latent bug … should adopt the delegation too"). |
| Kadena-only pubkey filter (`organs/05`, 2026-08-02) | **GAP (actionable, fold into the above)** | neither the resolver nor `createMnemosyneSignerSource().listSignerDescriptors()` filters codex accounts to `/^[0-9a-fA-F]{64}$/` bare pubkeys, so Apollo `<len>.<xy>` keys can leak into the Kadena signer set. |
| Tier-3 addressability in the Khronoton pane (§3.7 newest) | **GAP (pre-existing, OUT OF SCOPE)** | `KhronotonApp.tsx` flips list/detail/builder via `useState` behind a static `/admin#khronoton` URL — a Tier-3 opacity the newest rule forbids. Unrelated to verifier work; a clean follow-up (`#khronoton/<id>`). |
| Admin CSS raw hex (§1) | **PARTIAL (pre-existing, OUT OF SCOPE)** | `app/admin/admin.css` uses `#b8860b*` literals instead of `var(--accent-dim)`; renders identically, token-hygiene only. |
| pythia-client pin `2.3.0` (`organs/06` §2e) | **NOTE (OUT OF SCOPE)** | self-connector helpers (`DualLinkConnector`/`maskSecret`) arrived at `2.5.0`/`2.6.0`; only needed if Mnemosyne links its **own** dual-Apollo pair. |

## Approach

Two independent topics, run in order. They touch disjoint files and can ship/register
independently, but the codex-version bump in Topic 2 is the one coupling (it re-pulls the whole
`@ancientpantheon/codex` aggregate, including the verifier's `ApolloVerifyView`), so Topic 2 must
validate that the bump doesn't regress the verifier.

1. **`pythia-verifier`** — the Phase-2 headline deliverable. Mnemosyne already serves a
   contract-correct `/apollo-verify`. Work: pin the byte-exact canonical-message contract with a
   regression-guard test (Mnemosyne has none today), confirm the route renders + parses params +
   builds the correct message/redirect against the *actually-deployed* codex version, and hand the
   operator the exact origin URL to register in Pythia's admin. Small, low-risk.

2. **`khronoton-headless-resolver`** — the one real architecture-drift code change. Bump
   `@ancientpantheon/codex` `^0.6.1 → ^0.8.0+` for the pre-bound, node-safe
   `createHeadlessKadenaResolver` (from `@ancientpantheon/codex/ouronet`), rewrite
   `keyResolver.ts` to delegate (mirroring Pythia's `apps/pythia/src/automaton/khronoton/
   keyResolver.ts`), delete the koala hardcodes / `assertHexSecret` / `fromSeedAccount`, add the
   Kadena-only pubkey filter to both the resolver and the signer source, keep a thin ouro-account
   fallback, and validate the codex bump against the verifier + `/codex` mount + connector-auth.
   Medium; real-money-signing-adjacent (Khronoton autonomous tx signing) + a live-app dependency
   bump — the higher-risk topic, done second and reviewed hard.

**Reconciliation with the earlier open gap.** `docs/work/pythia-connector-auth/design.md`'s
Decisions flagged a koala-only/hex-only signing family as open. Topic 2 resolves the **Khronoton
Kadena-seed** side of it (chainweaver/eckowallet seeds now sign). It does **NOT** resolve the
separate Apollo-curve-Pact-signing sub-problem (`deployApolloHalf`/`linkDualApiKey` needing Apollo
keys to sign Pact transactions) — the headless resolver is Kadena-key-only. That onboarding gap
stays open and clearly out of scope here.

## Acceptance criteria (project-level)

- [ ] A written gap report exists (this document) covering the full architecture library, tagging
      each standard CONFORMS/GAP/PARTIAL with evidence.
- [ ] Mnemosyne serves `/apollo-verify` and signs the byte-exact canonical message — pinned by a
      regression test that diffs against Pythia's `canonicalMessage.ts`.
- [ ] The Khronoton KeyResolver delegates to Codex's headless seedType-aware resolver (no koala-only
      hand-roll, no `assertHexSecret`), with a Kadena-only pubkey filter; `vitest`/`tsc`/`next build`
      green after the codex bump; the verifier and `/codex` mount still work.
- [ ] The operator is given the exact verifier origin URL to register in Pythia's admin, and a clear
      statement of what round-trip is ready to test.

## Out of scope

- Registering Mnemosyne in Pythia's admin verifier registry (the operator's deliberate on-ramp).
- Tier-3 addressability in the Khronoton pane; admin CSS token hygiene; pythia-client `2.6.0`
  self-connector bump — all pre-existing drift, noted above for future topics.
- The Apollo-curve-Pact-signing onboarding gap (separate, tracked in `pythia-connector-auth`).

## Topics

1. `pythia-verifier` — confirm the already-built `/apollo-verify`, pin the byte-exact message with a
   regression test, hand the operator the origin URL to register.
2. `khronoton-headless-resolver` — codex bump + KeyResolver delegation + Kadena-only filter, mirroring
   Pythia's reference resolver.

## Decisions

- Structured as a project with the gap report embedded here (Phase-1 deliverable) rather than a
  standalone report file — the report *is* the shared context both topics build on.
- Verifier kept as its own topic despite being mostly confirmation + one guard test, because the
  operator asked for it tracked as the headline deliverable with an explicit origin-URL handoff.
