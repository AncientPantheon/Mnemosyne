import type { CodexSnapshot, IOuroAccount, IPureKeypair } from "@ancientpantheon/codex/ouronet";

import { loadBackup } from "../mnemosyneCodexStore";

/**
 * Shared "unseal codex backup → null-check → parse as `CodexSnapshot`" seam
 * for the two Pythia connector modules that both need read-only access to
 * the sealed operator codex (`lib/pythia/apolloIdentity.ts`,
 * `lib/pythia/apolloSigner.ts`). Extracted so those two files don't each
 * carry their own near-identical copy of this trio. `lib/khronoton/
 * keyResolver.ts` has an equivalent private copy of its own — pre-existing
 * code outside this feature's scope, deliberately left untouched.
 *
 * `notInitializedMessage` is the caller's own full error message (each call
 * site's wording names the specific feature that needs the codex, e.g.
 * "onboarding the Pythia connector" vs "signing Apollo ownership proofs"),
 * so this helper stays a pure plumbing seam rather than forcing one generic
 * message on every caller.
 */
export async function loadCodexSnapshot(notInitializedMessage: string): Promise<CodexSnapshot> {
  const backup = await loadBackup();
  if (backup === null) {
    throw new Error(notInitializedMessage);
  }
  return JSON.parse(backup) as CodexSnapshot;
}

/** Defensive accessor: `snapshot.pureKeypairs`, or `[]` if absent/malformed. */
export function pureKeypairsOf(snapshot: CodexSnapshot): IPureKeypair[] {
  return Array.isArray(snapshot.pureKeypairs) ? snapshot.pureKeypairs : [];
}

/** Defensive accessor: `snapshot.ouroAccounts`, or `[]` if absent/malformed. */
export function ouroAccountsOf(snapshot: CodexSnapshot): IOuroAccount[] {
  return Array.isArray(snapshot.ouroAccounts) ? snapshot.ouroAccounts : [];
}
