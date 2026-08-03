import type { ApolloSigner } from "@ancientpantheon/pythia-client";

import { getOrCreateCodexPassword } from "../mnemosyneCodexStore";
import { loadCodexSnapshot } from "./codexSnapshot";

/**
 * Mnemosyne's connector-auth `ApolloSigner` — the off-chain
 * proof-of-possession seam Pythia's `/connectors/auth/*` challenge/verify
 * protocol needs. A THIN delegate to Codex's own `autoSignApolloChallenge`
 * (`@ancientpantheon/codex/ouronet`), mirroring Pythia's own
 * `automaton/codexApolloSigner.ts` — no hand-rolled `@stoachain` Apollo
 * derivation, no local key material, only the signature crosses back.
 *
 * Every `sign()` re-reads the sealed operator codex snapshot + machine
 * password fresh (fire-time, never cached — a codex edit is picked up on the
 * next call and plaintext key material never outlives the call), then hands
 * the whole thing to `autoSignApolloChallenge`, which locates the account in
 * `ouroAccounts`, `smartDecrypt`s its secret, and signs the canonical
 * ownership message. `CodexSnapshot` satisfies the function's
 * `ApolloSnapshotLike` (`{ ouroAccounts? }`) structurally, so no narrowing is
 * needed.
 */

/** An `ApolloSigner` scoped to `apolloAccount`, backed by the operator
 * codex's `autoSignApolloChallenge`. The connector builds one per dual-link
 * half (`createMnemosyneApolloSigner(halves.standardApollo)` /
 * `halves.smartApollo`), so a signer refuses to mint a proof for any account
 * it wasn't scoped to — even one the codex also holds. Mirrors
 * `createCodexApolloSigner`'s own scope guard. */
export function createMnemosyneApolloSigner(apolloAccount: string): ApolloSigner {
  return {
    sign: async ({ apolloAccount: signedAccount, nonce, rp }) => {
      if (signedAccount !== apolloAccount) {
        throw new Error(
          `pythia apollo signer: asked to sign for ${signedAccount} but this signer is scoped to ${apolloAccount}`,
        );
      }
      const [snapshot, codexPassword] = await Promise.all([
        loadCodexSnapshot(
          "pythia apollo signer: the Mnemosyne operator codex is not initialized — " +
            "populate it under /admin/codex before signing Apollo ownership proofs.",
        ),
        getOrCreateCodexPassword(),
      ]);
      const { autoSignApolloChallenge } = await import("@ancientpantheon/codex/ouronet");
      const { sig } = await autoSignApolloChallenge(snapshot, codexPassword, apolloAccount, nonce, rp);
      return { signature: sig };
    },
  };
}
