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
  // §7c: pass the REFRESHABLE key source ({ get, invalidate }), NOT a pre-called
  // `keyProvider()` — this is the ephemeral-key linkage that lets PythiaClient's
  // transport self-heal a dead key: on a clean `401 { error: "invalid or expired
  // connector key" }` it invalidates → re-mints → retries once (activation is
  // on-chain, so the re-mint needs no human re-link). `organs/06` §7.
  return new PythiaClient({ baseUrl, pythiaKey: connector.asKeySource() });
}

// ── §7e · consumer-side self-heal (Mnemosyne PROXIES gated calls) ─────────────
// Mnemosyne relays gated traffic through its own backend (the /api/pythia/relay
// route + the Khronoton runtime), so a dead ephemeral key frequently reaches us
// as a RETURNED BODY (`{ error: "invalid or expired connector key" }`) or a
// re-thrown app error — NOT the clean transport 401 that §7c's `asKeySource()`
// heal can see. This body-level wrapper is the belt-and-suspenders layer
// `organs/06` §7e mandates for proxying consumers: detect-by-message → drop the
// memoized (dead-secret) connector → force a re-mint → retry the call ONCE.

/** The exact substring the gateway returns/re-throws when the ephemeral key is
 *  dead. Match on the MESSAGE, not the HTTP status — the status is usually gone by
 *  the time it reaches a proxying consumer. */
const CONNECTOR_KEY_MISS = "invalid or expired connector key";

/** True if a thrown error OR a returned body/value carries the key-miss message. */
export function isConnectorKeyMiss(v: unknown): boolean {
  if (v == null) return false;
  if (v instanceof Error) return v.message.includes(CONNECTOR_KEY_MISS);
  if (typeof v === "string") return v.includes(CONNECTOR_KEY_MISS);
  try {
    return JSON.stringify(v).includes(CONNECTOR_KEY_MISS);
  } catch {
    return false;
  }
}

/** Drop the memoized connector so the next `getDualLinkConnector()` rebuilds it.
 *  The memo caches the connector's DEAD ephemeral secret; a rebuild starts clean.
 *  Call on link/unlink too, so a re-link always re-mints. */
export function resetGatedConnector(): void {
  memoized = null;
}

let healingInFlight: Promise<void> | null = null;

/** Reset the memo, rebuild the connector, and force a fresh re-mint NOW (don't
 *  wait for the expiry margin). Concurrent heals collapse to one in-flight re-mint. */
export function healGatedConnector(): Promise<void> {
  if (healingInFlight) return healingInFlight;
  healingInFlight = (async () => {
    resetGatedConnector();
    const connector = getDualLinkConnector(); // rebuilt fresh (no cached secret)
    if (!connector) return;
    try {
      await connector.invalidate();
      await connector.keyProvider()(); // pull a fresh secret immediately
    } catch {
      // 202 pending (gateway's on-chain mirror cold for one poll cycle after a
      // restart) or a transient miss — the heartbeat converges; the retry/next call
      // succeeds. Never throw from the heal itself.
    }
  })().finally(() => {
    healingInFlight = null;
  });
  return healingInFlight;
}

/** Wrap a gated call so a key-miss (thrown OR returned in the body) triggers
 *  heal → retry EXACTLY ONCE. `fn` must re-resolve the client each call (via
 *  `getGatedPythiaClient()`), so the retry binds to the rebuilt connector. */
export async function withConnectorSelfHeal<T>(fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    if (isConnectorKeyMiss(result)) {
      await healGatedConnector();
      return await fn();
    }
    return result;
  } catch (err) {
    if (isConnectorKeyMiss(err)) {
      await healGatedConnector();
      return await fn(); // retry once; a second miss surfaces (no loop)
    }
    throw err;
  }
}
