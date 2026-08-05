import { createStoachainRuntime } from "@ancientpantheon/khronoton-core/blockchain/stoachain";
import type { ChainRuntime } from "@ancientpantheon/khronoton-core/server";

import { routeChainRuntimeThroughPythia } from "./pythiaRoutedRuntime";

/**
 * The ChainRuntime seam — khronoton's `/blockchain/stoachain` adapter wrapping
 * the `@stoachain/*` SDK (client, universal signer, gas, network constants), so
 * Mnemosyne injects ONE object instead of reaching for `@stoachain/*` directly.
 *
 * The factory is async (it lazy-imports the SDK sequentially — see the package's
 * Node-interop note) and built exactly once per process: the promise itself is
 * the `globalThis` singleton, so concurrent first-callers (instrumentation +
 * an early API hit) share one in-flight creation.
 *
 * Every knob defaults to the `@stoachain/*` constants; env vars override for
 * a custom chainweb node or a test network.
 */
const g = globalThis as unknown as { __mnemosyneKhronotonRuntime?: Promise<ChainRuntime> };

export function getChainRuntime(): Promise<ChainRuntime> {
  if (g.__mnemosyneKhronotonRuntime) return g.__mnemosyneKhronotonRuntime;
  const base = createStoachainRuntime({
    ...(process.env.KHRONOTON_NODE_BASE_URL
      ? { nodeBaseUrl: process.env.KHRONOTON_NODE_BASE_URL }
      : {}),
    ...(process.env.KHRONOTON_NETWORK_ID
      ? { networkId: process.env.KHRONOTON_NETWORK_ID }
      : {}),
    ...(process.env.KHRONOTON_NAMESPACE
      ? { namespace: process.env.KHRONOTON_NAMESPACE }
      : {}),
    ...(process.env.KHRONOTON_GAS_STATION
      ? { gasStationAccount: process.env.KHRONOTON_GAS_STATION }
      : {}),
  });
  // ALWAYS wrap: the wrapper resolves the live transport mode PER FIRE, routing
  // through Pythia by default and switching to the admin-configured direct node
  // only while the Network Fallback (or the MNEMOSYNE_KHRONOTON_DIRECT_NODE env
  // override) is active. `HANDOFF-mnemosyne-network-fallback.md`.
  g.__mnemosyneKhronotonRuntime = base.then((rt) => routeChainRuntimeThroughPythia(rt));
  return g.__mnemosyneKhronotonRuntime;
}
