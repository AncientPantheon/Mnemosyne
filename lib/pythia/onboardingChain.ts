import { PythiaClient } from "@ancientpantheon/pythia-client";
import type {
  IKadenaKeypair,
  IUnsignedCommand,
  UniversalKeypair,
} from "@ancientpantheon/khronoton-core/server";

import { readAdminSettings } from "../adminSettings";
import { createMnemosyneKeyResolver } from "../khronoton/keyResolver";
import { getChainRuntime } from "../khronoton/runtime";

/**
 * The on-chain leg of Pythia onboarding: build a Pact transaction via the SAME
 * generic build+sign pipeline Khronoton's autonomous engine already uses
 * (`getChainRuntime()` → `Pact.builder.execution(...)` → `universalSignTransaction`
 * — see `lib/khronoton/keyResolver.ts` and `docs/work/pythia-connector-auth/
 * design.md`'s Signing section), then relay the signed command through a plain,
 * ungated `PythiaClient.send` — deliberately NOT `executeCodexTransaction`, which
 * submits straight to a chain node and bypasses Pythia entirely (this step runs
 * BEFORE any gated Pythia identity exists).
 *
 * This module makes REAL chain calls (spends real STOA, creates a permanent
 * on-chain identity) — it is reachable only from `lib/pythia/onboardingJob.ts`'s
 * `runOnboarding()`, itself reachable only from the ancient-gated
 * `POST /api/admin/pythia-connector`. Never call this from build, deploy,
 * startup, or any scheduled/background process.
 */

/**
 * `setMeta`/gas shape mirrored from `@ancientpantheon/khronoton-core`'s OWN
 * internal `buildTransaction` (`dist/server/executor.js`) and its cronoton-
 * builder UI defaults (`dist/ui/index.js`'s `makeEmptyBuilderState` /
 * `detailToBuilderState`) — copied rather than guessed:
 *  - the meta field is `senderAccount` (NOT `sender` — the vendored `@stoachain/
 *    kadena-stoic-legacy` `setMeta` reducer's own type signature is
 *    `Partial<Omit<meta, "sender">> & {senderAccount?: string}`, remapping
 *    `senderAccount` to `sender` internally);
 *  - `chainId: "0"`, `gasLimit: 1500`, `ttl: 600` are Khronoton's own builder
 *    defaults for a fresh cronoton;
 *  - `gasPrice` is stored/passed in ANU (10000, the protocol floor per
 *    Khronoton's own builder validation message) and converted to STOA via
 *    `runtime.anuToStoa(...)` immediately before `setMeta`, exactly like the
 *    internal `buildTransaction` does.
 * No `@stoachain/*` or `@ancientpantheon/khronoton-core` constant for any of
 * these numeric defaults was found beyond the UI's own initial-state literals —
 * this is the closest confirmed source in this repo, not a Pythia-specific value.
 */
const CHAIN_ID = "0";
const GAS_LIMIT = 1500;
const GAS_PRICE_ANU = 10000;
const TTL_SECONDS = 600;

/** A structural view of the chainable Pact builder — `ChainRuntime.Pact.builder.
 * execution(code)`'s return type is `unknown` (declared that way deliberately, so
 * the seam carries no `@stoachain/*` type reference); this is the subset of
 * methods the internal `buildTransaction` (and this module) actually calls. */
interface PactBuilderChain {
  setMeta(meta: Record<string, unknown>): PactBuilderChain;
  setNetworkId(id: string): PactBuilderChain;
  addSigner(publicKey: string): PactBuilderChain;
  createTransaction(): unknown;
}

/** `IKadenaKeypair.privateKey` (the key resolver's own field name) maps to
 * `UniversalKeypair.secretKey` (what `universalSignTransaction` expects) — the
 * exact remap `lib/khronoton/keyResolver.ts`'s own doc comment specifies. */
function toUniversalKeypair(kp: IKadenaKeypair): UniversalKeypair {
  return {
    publicKey: kp.publicKey,
    secretKey: kp.privateKey,
    seedType: kp.seedType,
    encryptedSecretKey: kp.encryptedSecretKey,
    password: kp.password,
  };
}

/**
 * SECOND, INDEPENDENT UNRESOLVED GAP in this on-chain leg (alongside the
 * "VERIFY AGAINST THE LIVE PYTHIA.pact MODULE" Pact-parameter gap on the two
 * pact-code builders below — at least as important, confirmed by direct
 * investigation, not guessed): `signerPublicKeys` here are always the
 * connector's OWN Standard/Smart Apollo public keys (`ensureConnectorApolloPair()`,
 * `apolloIdentity.ts`, via `deriveDoubleApollo`) — `dalos-apollo` Schnorr-v2-curve
 * keys, stored as base-49 scalars. `createMnemosyneKeyResolver()`
 * (`lib/khronoton/keyResolver.ts`) and the `universalSignTransaction` pipeline it
 * feeds (`@stoachain/stoa-core/signing`) were built for Kadena-native keys only —
 * confirmed against the installed packages directly: `UniversalKeypair.seedType`
 * is `"koala" | "chainweaver" | "eckowallet" | "foreign"` (no apollo/Schnorr
 * variant exists at all, and the vendored `@stoachain/kadena-stoic-legacy` Pact
 * client's own `SignerScheme` type is `'ED25519'` only), and its runtime dispatch
 * does NOT reject an unrecognized seed type on its own — anything other than
 * `"chainweaver"`/`"eckowallet"` falls straight into the Ed25519 `tweetnacl`
 * signing lane regardless of its real scheme. The ONLY thing standing between
 * this function and a silently-wrong signature today is `keyResolver.ts`'s
 * `assertHexSecret` guard, which happens to reject an Apollo secret's base-49
 * shape as a byproduct of a plain hex-format check, not a deliberate scheme
 * check — so this throws before any transaction is even built. No working
 * precedent for signing a Pact command with an Apollo/Schnorr key was found
 * anywhere in this monorepo (`@stoachain/kadena-stoic-legacy`/`@stoachain/
 * stoa-core`'s own dist output has zero Apollo/Schnorr reference near signing;
 * the only real, working Apollo-signing code in this repo,
 * `lib/pythia/apolloSigner.ts`, signs a short off-chain challenge message, never
 * a Pact command). Nor is it confirmed that a DIFFERENT, Kadena-native account
 * should sign instead with the Apollo keys passed as plain data — Pythia's own
 * `A_LinkDualApiKey` cronoton (`constructors/Pythia/apps/pythia/src/automaton/
 * khronoton/dualLinkActivateResolver.ts`) does exactly that (Apollo accounts via
 * `read-msg`, Pythia's own keyset as the actual signer), but that is a DIFFERENT
 * function with different authority (Pythia activating on her own behalf), and
 * this module's own `ownerAccount` is currently the Apollo public key itself
 * (`onboardingJob.ts`), not a distinct Kadena-native account — so which account,
 * if any, is meant to sign `C_DeployApolloPythiaApiKey`/`C_LinkDualApiKey` remains
 * unconfirmed. See design.md's Decisions for the full investigation trail. THIS
 * CODE PATH MUST NOT BE TRIGGERED LIVE until a human with StoaChain domain
 * expertise / live chain access resolves this.
 */
function explainApolloKeyResolutionFailure(publicKey: string, cause: unknown): Error {
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  return new Error(
    `onboardingChain: failed to resolve a Kadena-native signing keypair for Apollo public ` +
      `key "${publicKey}". KNOWN, UNRESOLVED GAP (see this file's own doc comment on ` +
      `buildSignAndRelay, and design.md's Decisions): this connector's Standard/Smart Apollo ` +
      `keys are dalos-apollo Schnorr-v2-curve keys, but the Kadena-native signing pipeline this ` +
      `function calls (createMnemosyneKeyResolver → universalSignTransaction) supports only ` +
      `Ed25519-family seed types ("koala" | "chainweaver" | "eckowallet" | "foreign") — Apollo-` +
      `curve keys are not yet supported here, and this code path must not be triggered live until ` +
      `that is resolved. Underlying resolver error: ${causeMessage}`,
  );
}

/**
 * Build, sign (with every keypair in `signerPublicKeys`, in order — the first is
 * also used as the tx `senderAccount`/gas payer), and relay `pactCode` through a
 * plain, ungated `PythiaClient.send`. Shared by both exported onboarding calls.
 */
async function buildSignAndRelay(
  pactCode: string,
  signerPublicKeys: string[],
): Promise<unknown> {
  const runtime = await getChainRuntime();
  const resolver = createMnemosyneKeyResolver();
  const keypairs = await Promise.all(
    signerPublicKeys.map(async (publicKey) => {
      try {
        return await resolver.getKeyPairByPublicKey(publicKey);
      } catch (err) {
        throw explainApolloKeyResolutionFailure(publicKey, err);
      }
    }),
  );

  const builder = runtime.Pact.builder.execution(pactCode) as unknown as PactBuilderChain;
  builder
    .setMeta({
      senderAccount: signerPublicKeys[0],
      chainId: CHAIN_ID,
      gasLimit: GAS_LIMIT,
      gasPrice: runtime.anuToStoa(GAS_PRICE_ANU),
      ttl: TTL_SECONDS,
    })
    .setNetworkId(runtime.networkId);
  for (const publicKey of signerPublicKeys) builder.addSigner(publicKey);
  const tx = builder.createTransaction() as unknown as IUnsignedCommand;

  const signed = await runtime.universalSignTransaction(tx, keypairs.map(toUniversalKeypair));

  const client = new PythiaClient({ baseUrl: readAdminSettings().pythiaUrl });
  return client.send({ cmds: [signed] });
}

/**
 * `C_DeployApolloPythiaApiKey` — deploys ONE Apollo half (Standard or Smart) as a
 * PYTHIA API-key row, self-service (doc §1a: "user-called, self-service" — the
 * half being deployed authorizes its own deploy, so it is the sole signer here).
 * Namespace-qualified as `ouronet-ns.PYTHIA.*`, the exact qualified form this
 * repo's own live Pythia callers use for this module (confirmed by grep —
 * `constructors/Codex/packages/codex-ouronet/src/zbom/pythia/deployApiKey.ts`'s
 * `ouronet-ns.PYTHIA.UR_ApiKeyRowOrNull` / `PYTHIA.PYTHIA|INFO_DeployApiKey`
 * reads; no `free.PYTHIA.*` reference to this module exists anywhere in this
 * monorepo).
 *
 * VERIFY AGAINST THE LIVE PYTHIA.pact MODULE BEFORE THIS PATH IS EVER TRIGGERED
 * — the exact parameter list beyond `(owner-account, apollo-public, is-standard)`
 * was not confirmable from any source in this repo; see design.md's Signing
 * section. (That same live-caller investigation also found `constructors/Codex`'s
 * OWN in-repo deploy caller uses a different function name/arity entirely —
 * `ouronet-ns.TS01-C4.PYTHIA|C_DeployApiKey patron owner-account apollo-account
 * public` — underscoring that this signature is a best-effort placeholder, not a
 * confirmed contract.)
 */
function buildDeployApolloHalfPactCode(
  ownerAccount: string,
  apolloPublicKey: string,
  isStandard: boolean,
): string {
  return `(ouronet-ns.PYTHIA.C_DeployApolloPythiaApiKey "${ownerAccount}" "${apolloPublicKey}" ${isStandard})`;
}

export async function deployApolloHalf(
  ownerAccount: string,
  apolloPublicKey: string,
  isStandard: boolean,
): Promise<unknown> {
  const pactCode = buildDeployApolloHalfPactCode(ownerAccount, apolloPublicKey, isStandard);
  return buildSignAndRelay(pactCode, [apolloPublicKey]);
}

/**
 * `C_LinkDualApiKey` — links the Standard + Smart halves into one active dual
 * connector identity under `consumerLane`. Requires BOTH half-owners'
 * authorization per the doc, so both keypairs sign (both `addSigner` calls, both
 * entries in `universalSignTransaction`'s keypairs array — never just one).
 * Namespace-qualified `ouronet-ns.PYTHIA.*`, same confirmed form as
 * `buildDeployApolloHalfPactCode` above.
 *
 * VERIFY AGAINST THE LIVE PYTHIA.pact MODULE BEFORE THIS PATH IS EVER TRIGGERED
 * — the exact parameter list was not confirmable from any source in this repo;
 * see design.md's Signing section.
 */
function buildLinkDualApiKeyPactCode(
  standardPublicKey: string,
  smartPublicKey: string,
  consumerLane: string,
): string {
  return `(ouronet-ns.PYTHIA.C_LinkDualApiKey "${standardPublicKey}" "${smartPublicKey}" "${consumerLane}")`;
}

export async function linkDualApiKey(
  standardPublicKey: string,
  smartPublicKey: string,
  consumerLane: string,
): Promise<unknown> {
  const pactCode = buildLinkDualApiKeyPactCode(standardPublicKey, smartPublicKey, consumerLane);
  return buildSignAndRelay(pactCode, [standardPublicKey, smartPublicKey]);
}
