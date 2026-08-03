import { DualLinkConnector, PythiaClient, splitDualLinkKey } from "@ancientpantheon/pythia-client";

import { readAdminSettings } from "../adminSettings";
import { createMnemosyneApolloSigner } from "./apolloSigner";
import { readConnectorState } from "./connectorStatus";

/**
 * Ongoing gated Pythia access, reworked around ONE `DualLinkConnector`
 * (`@ancientpantheon/pythia-client` 2.7.x) driven by the operator-pasted
 * dual-link-key — mirroring Pythia's own self-consumer (`apps/pythia`'s
 * `SelfConnectorLoop`), adapted for a real EXTERNAL consumer. Two entry points:
 *
 *  - `getDualLinkConnector()` lazily builds (and memoizes) a single
 *    `DualLinkConnector` over the two Apollo halves split from the stored
 *    dual-link-key (`readConnectorState`, T3). Each half is signed by
 *    Mnemosyne's own codex-backed `createMnemosyneApolloSigner` (T2). Unlike
 *    Pythia — which injects an in-process `fetchImpl` because it IS the read
 *    engine — Mnemosyne dials the REAL gateway, so it wires NO `fetchImpl`
 *    (the SDK's default global `fetch`) and NO `SecretStorage` (the connector
 *    holds the ephemeral `x-pythia-key` in memory, re-minting via the signers
 *    near expiry). It is NOT `.start()`ed: Mnemosyne is a pull consumer and
 *    resolves the key request-time via `keyProvider()`, not a background loop.
 *
 *  - `getGatedPythiaClient()` is what the rest of Mnemosyne calls for any
 *    Pythia access that wants gated attribution when available. It is strictly
 *    additive and never throws: with nothing linked (no stored key) OR no
 *    configured gateway URL, it degrades to a plain, unattributed
 *    `PythiaClient` — behaving EXACTLY as Mnemosyne did before this connector
 *    existed. Once a key is linked and a URL is set, it wires `pythiaKey` from
 *    the connector's own `keyProvider()` (the SDK's "resolved fresh per
 *    request, no manual refresh loop" idiom).
 */

interface MemoizedConnector {
  /** The dual-link-key the memoized connector was built from. */
  dualLinkKey: string;
  /** The gateway base URL the memoized connector was built from. */
  baseUrl: string;
  connector: DualLinkConnector;
}

let memoized: MemoizedConnector | null = null;

/**
 * The single `DualLinkConnector` for the currently-stored dual-link-key, or
 * `null` when nothing is linked. Memoized so repeated calls reuse one instance,
 * but rebuilt whenever the stored `dualLinkKey` OR the configured `pythiaUrl`
 * changes since the memoized build.
 */
export function getDualLinkConnector(): DualLinkConnector | null {
  const { dualLinkKey } = readConnectorState();
  if (!dualLinkKey) return null;

  const baseUrl = readAdminSettings().pythiaUrl;
  if (memoized && memoized.dualLinkKey === dualLinkKey && memoized.baseUrl === baseUrl) {
    return memoized.connector;
  }

  const halves = splitDualLinkKey(dualLinkKey);
  const connector = new DualLinkConnector({
    dualLinkKey,
    baseUrl,
    standardSigner: createMnemosyneApolloSigner(halves.standardApollo),
    smartSigner: createMnemosyneApolloSigner(halves.smartApollo),
  });
  memoized = { dualLinkKey, baseUrl, connector };
  return connector;
}

export function getGatedPythiaClient(): PythiaClient {
  const baseUrl = readAdminSettings().pythiaUrl;
  const connector = baseUrl ? getDualLinkConnector() : null;
  if (!connector) {
    return new PythiaClient({ baseUrl });
  }
  return new PythiaClient({ baseUrl, pythiaKey: connector.keyProvider() });
}
