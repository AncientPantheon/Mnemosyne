import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildApolloOwnershipMessage } from "@ancientpantheon/codex/ui";

// ── Pythia-verifier contract guard ──────────────────────────────────────────────
//
// Mnemosyne is a Pythia *verifier*: /apollo-verify mounts @ancientpantheon/codex/ui's
// ApolloVerifyView, which signs an "Apollo ownership proof" challenge that Pythia then
// verifies on-chain with `Apollo.verify`. The signed message must be BYTE-FOR-BYTE
// identical to what Pythia builds in
//   constructors/Pythia/apps/pythia/src/connectors/verify/canonicalMessage.ts
// (`buildChallengeMessage`): 4 lines, "\n"-joined, UTF-8, no trailing newline —
//     Apollo ownership proof
//     apollo: <A>
//     nonce: <nonce>
//     rp: <rp>
// A single differing byte fails verification on Pythia's side (the #1 integration bug).
//
// The codex aggregate is re-pulled at @latest on every deploy (production has floated
// codex 0.6.1 → 0.7.0 → 0.8.0), so the version that actually renders /apollo-verify is
// not pinned in this repo. This test OWNS the expected message format independently and
// diffs the codex package's actual builder against it, so any drift introduced by a
// codex bump fails loudly here rather than silently in the field.

/** The canonical message, reconstructed independently from the contract (NOT re-using
 *  the package's own builder) — this is the test's own source of truth. Mirrors
 *  Pythia's `buildChallengeMessage` verbatim. */
function expectedMessage(apollo: string, nonce: string, rp: string): string {
  return ["Apollo ownership proof", `apollo: ${apollo}`, `nonce: ${nonce}`, `rp: ${rp}`].join("\n");
}

// Representative Apollo accounts: ₱. (U+20B1) standard and Π. (U+03A0) smart.
const STANDARD = "₱.abc123def456";
const SMART = "Π.789ghi012jkl";
const NONCE = "9f8e7d6c5b4a39281706";
const RP = "pythia.ancientholdings.eu";

describe("apollo-verify — byte-exact canonical message (must match Pythia's canonicalMessage.ts)", () => {
  it("builds the exact 4-line message the RP verifies, for a ₱. standard account", () => {
    const msg = buildApolloOwnershipMessage(STANDARD, NONCE, RP);
    expect(msg).toBe(expectedMessage(STANDARD, NONCE, RP));
  });

  it("builds the exact 4-line message for a Π. smart account", () => {
    const msg = buildApolloOwnershipMessage(SMART, NONCE, RP);
    expect(msg).toBe(expectedMessage(SMART, NONCE, RP));
  });

  it("is exactly four lines in the fixed label order with single colon-space separators", () => {
    const lines = buildApolloOwnershipMessage(STANDARD, NONCE, RP).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("Apollo ownership proof");
    expect(lines[1]).toBe(`apollo: ${STANDARD}`);
    expect(lines[2]).toBe(`nonce: ${NONCE}`);
    expect(lines[3]).toBe(`rp: ${RP}`);
  });

  it("has NO trailing newline (a trailing byte would fail Apollo.verify)", () => {
    const msg = buildApolloOwnershipMessage(STANDARD, NONCE, RP);
    expect(msg.endsWith("\n")).toBe(false);
  });

  it("embeds the full ₱./Π. account string verbatim", () => {
    expect(buildApolloOwnershipMessage(STANDARD, NONCE, RP)).toContain(STANDARD);
    expect(buildApolloOwnershipMessage(SMART, NONCE, RP)).toContain(SMART);
  });
});

// ── Source-contract: the /apollo-verify route stays served + client-only ─────────────
//
// The codex tree pulls Buffer/window/browser-crypto and MUST NOT run during SSR; the
// route is a client-only mount (`ssr: false`) of ApolloVerifyView behind the Codex
// restore→unlock flow. These assertions pin that wiring so a future refactor can't
// silently drop the verifier route or SSR-break it. Style mirrors tests/admin-panel.test.ts.

const root = process.cwd();
const read = (...p: string[]): string => readFileSync(join(root, ...p), "utf8");

describe("apollo-verify — the route stays served and client-only (source contract)", () => {
  it("the server page renders the client mount, not a codex component directly", () => {
    const page = read("app", "apollo-verify", "page.tsx");
    expect(page).toMatch(/ApolloVerifyMount/);
    // The server page must not import the browser-only codex UI directly.
    expect(page).not.toMatch(/@ancientpantheon\/codex\/ui/);
  });

  it("the mount lazy-loads with ssr:false so the codex tree never runs during SSR", () => {
    const mount = read("app", "apollo-verify", "ApolloVerifyMount.client.tsx");
    expect(mount).toMatch(/^["']use client["'];?/m);
    expect(mount).toMatch(/ssr:\s*false/);
    expect(mount).toMatch(/import\(["']\.\/ApolloVerifyApp["']\)/);
  });

  it("mounts ApolloVerifyView from @ancientpantheon/codex/ui behind the restore→unlock flow", () => {
    const app = read("app", "apollo-verify", "ApolloVerifyApp.tsx");
    expect(app).toMatch(/import\s*\{\s*ApolloVerifyView\s*\}\s*from\s*["']@ancientpantheon\/codex\/ui["']/);
    // Gated: the verify view only renders after the codex is unlocked.
    expect(app).toMatch(/UnlockScreen/);
    expect(app).toMatch(/<ApolloVerifyView\s*\/>/);
  });
});
