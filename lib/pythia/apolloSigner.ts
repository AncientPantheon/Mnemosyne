import type { ApolloSigner } from "@ancientpantheon/pythia-client";
import { smartDecrypt } from "@stoachain/stoa-core/crypto";
import { Apollo, createDefaultRegistry, createOuronetAccount } from "@stoachain/stoa-core/dalos";
import type { CreateAccountOptions } from "@stoachain/stoa-core/dalos";
import type { IPureKeypair } from "@ancientpantheon/codex/ouronet";

import { getOrCreateCodexPassword } from "../mnemosyneCodexStore";
import { loadCodexSnapshot, ouroAccountsOf, pureKeypairsOf } from "./codexSnapshot";

/**
 * Mnemosyne's server-side `ApolloSigner` — off-chain proof-of-possession for
 * Pythia's connector-auth challenge/verify wire protocol (organs/06 §1c),
 * entirely automated, no human in the loop. Composes the exact primitives
 * `lib/khronoton/keyResolver.ts` already uses for the sealed operator codex
 * (via the shared `./codexSnapshot` helper): `getOrCreateCodexPassword()` +
 * unseal/parse the `CodexSnapshot` → `smartDecrypt` the matched account's
 * secret (`@stoachain/stoa-core/crypto`) → re-derive the Apollo keypair and
 * sign the canonical ownership message directly against
 * `@stoachain/stoa-core/dalos`'s `createOuronetAccount`/`Apollo` primitives.
 *
 * `input.apolloAccount` is always the `₱./Π.`-prefixed 162-char ADDRESS —
 * what Pythia's real wire protocol requires, and what `apolloIdentity.ts`'s
 * `ensureConnectorApolloPair` returns for exactly this purpose (its
 * `standardAddress`/`smartAddress` fields, as opposed to the raw
 * `standardPublicKey`/`smartPublicKey` the on-chain leg needs instead — see
 * that file). Both the `pureKeypairs` and `ouroAccounts` lookups below match
 * by ADDRESS, never by the raw public key, and the signed message is built
 * from `input.apolloAccount` itself (not an independently re-derived value
 * that could silently diverge from what was actually asked to be signed for).
 *
 * This DELIBERATELY does not import `signApolloOwnership`/
 * `buildApolloOwnershipMessage` from `@ancientpantheon/codex/ui` — that
 * subpath is a single bundled React UI component library (it calls
 * `React.createContext` etc. at module scope) and breaks `next build`'s
 * server-route webpack bundling (react-server condition) even though it
 * imports fine under plain-Node vitest. See
 * `docs/work/pythia-connector-auth/design.md`'s Decisions section. The logic
 * below reimplements that function's exact behavior (message shape, mode
 * dispatch, ownership-mismatch guard) directly against the React-free
 * `dalos` subpath instead.
 *
 * The snapshot is re-read on every call, mirroring `keyResolver.ts`'s own
 * "no cache invalidation, plaintext never outlives the call" posture. No
 * private key material ever leaves this process — only the signature.
 */

const APOLLO_PRIMITIVE_ID = "dalos-apollo";

/**
 * The canonical Apollo-ownership message — sign EXACTLY this (byte-for-byte).
 * Four lines, `\n`-joined, UTF-8, no trailing newline. Inlined from
 * `@ancientpantheon/codex/ui`'s own `buildApolloOwnershipMessage` (a trivial,
 * exact known source) so this module needs no import from that package's
 * React-bearing `/ui` subpath.
 */
function buildApolloOwnershipMessage(account: string, nonce: string, rp: string): string {
  return ["Apollo ownership proof", `apollo: ${account}`, `nonce: ${nonce}`, `rp: ${rp}`].join("\n");
}

/** A `pureKeypairs` entry plus its derived `₱./Π.` address and `isSmart`
 * flag — computed once per lookup so the match and the sign step below share
 * the exact same derivation instead of recomputing (or worse, diverging). */
function withDerivedAddress(kp: IPureKeypair): { kp: IPureKeypair; address: string; isSmart: boolean } {
  const isSmart = (kp.label ?? "").toLowerCase().includes("smart");
  return { kp, isSmart, address: Apollo.publicKeyToAddress(kp.publicKey, isSmart) };
}

/**
 * Re-derive the Apollo keypair from a decrypted secret, verify the derived
 * `₱./Π.` address matches `apolloAccount` (guards against the wrong
 * codex/password producing a valid-but-unrelated key — mirrors
 * `signApolloOwnership`'s own ownership-mismatch check), then sign the
 * canonical ownership message built from `apolloAccount` itself — never an
 * independently-recomputed value, so there is no seam for the signed message
 * to diverge from what was actually asked to be signed for. `originMode`
 * mirrors `IOuroAccount.originMode`'s two shapes this signer ever sees:
 * `"seedWords"` for `ouroAccounts` entries (space-joined seed-word secret),
 * `"integerBase49"` for `pureKeypairs` entries (raw base-49 private scalar,
 * the shape `apolloIdentity.ts`'s `ensureConnectorApolloPair` writes).
 */
function signOwnershipProof(
  secretPlaintext: string,
  originMode: "seedWords" | "integerBase49",
  isSmart: boolean,
  apolloAccount: string,
  nonce: string,
  rp: string,
): string {
  const registry = createDefaultRegistry();
  registry.register(Apollo);

  const options: CreateAccountOptions =
    originMode === "integerBase49"
      ? { mode: "integerBase49", data: secretPlaintext, primitiveId: APOLLO_PRIMITIVE_ID }
      : {
          mode: "seedWords",
          data: secretPlaintext.trim().split(/\s+/).filter(Boolean),
          primitiveId: APOLLO_PRIMITIVE_ID,
        };
  const full = createOuronetAccount(registry, options);

  const derivedAddress = isSmart ? full.smartAddress : full.standardAddress;
  if (derivedAddress !== apolloAccount) {
    throw new Error(
      "pythia apollo signer: the recovered key doesn't match this Apollo account — " +
        "make sure the correct Mnemosyne operator codex is unlocked.",
    );
  }

  if (!Apollo.sign) throw new Error("pythia apollo signer: Apollo signing primitive unavailable in this build.");
  return Apollo.sign(full.keyPair, buildApolloOwnershipMessage(apolloAccount, nonce, rp));
}

export class MnemosyneApolloSigner implements ApolloSigner {
  async sign(input: { apolloAccount: string; nonce: string; rp: string }): Promise<{ signature: string }> {
    const [snapshot, codexPassword] = await Promise.all([
      loadCodexSnapshot(
        "pythia apollo signer: the Mnemosyne operator codex is not initialized — " +
          "populate it under /admin/codex before signing Apollo ownership proofs.",
      ),
      getOrCreateCodexPassword(),
    ]);

    const pureMatch = pureKeypairsOf(snapshot)
      .map(withDerivedAddress)
      .find((entry) => entry.address === input.apolloAccount);
    if (pureMatch) {
      const secretPlaintext = await smartDecrypt(pureMatch.kp.encryptedPrivateKey, codexPassword);
      const signature = signOwnershipProof(
        secretPlaintext,
        "integerBase49",
        pureMatch.isSmart,
        input.apolloAccount,
        input.nonce,
        input.rp,
      );
      return { signature };
    }

    const ouro = ouroAccountsOf(snapshot).find((acc) => acc.address === input.apolloAccount);
    if (ouro) {
      const secretPlaintext = await smartDecrypt(ouro.secret, codexPassword);
      const signature = signOwnershipProof(
        secretPlaintext,
        "seedWords",
        ouro.isSmart,
        input.apolloAccount,
        input.nonce,
        input.rp,
      );
      return { signature };
    }

    throw new Error(
      `pythia apollo signer: Apollo account ${input.apolloAccount} is not held by the ` +
        "Mnemosyne operator codex.",
    );
  }
}

/** Factory mirroring `createMnemosyneKeyResolver()`'s own naming convention. */
export function createMnemosyneApolloSigner(): ApolloSigner {
  return new MnemosyneApolloSigner();
}
