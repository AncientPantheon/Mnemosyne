import { readAdminSettings } from "@/lib/adminSettings";

/**
 * The ONE server-side transport seam. Every server lane (the `/api/pythia/relay`
 * route and the Khronoton chain runtime) resolves the active mode HERE, live, so
 * an ancient flipping the Network Fallback takes effect on the next read/fire —
 * no restart, no cache. `HANDOFF-mnemosyne-network-fallback.md`.
 *
 * `pythia` (default) → all chain traffic through Pythia (metered).
 * `direct-node`      → break-glass straight to a Stoa node (UNMETERED).
 */
export type TransportMode = "pythia" | "direct-node";

export interface ResolvedTransport {
  mode: TransportMode;
  /** The direct-node base URL (used only while `mode === "direct-node"`). */
  nodeUrl: string;
  /** The Pythia gateway base URL (used while `mode === "pythia"`). */
  pythiaUrl: string;
}

/** StoaChain network + chain the daimon operates on. */
const STOA_NETWORK = "stoa";
const STOA_CHAIN_ID = "0";

/** Resolve the live transport from admin settings. The env flag
 *  `MNEMOSYNE_KHRONOTON_DIRECT_NODE=1` is an additional server-only force-direct
 *  override (kept from the earlier stub); either it OR the admin toggle ⇒ direct. */
export function resolveServerTransport(
  read: typeof readAdminSettings = readAdminSettings,
): ResolvedTransport {
  const s = read();
  const forcedDirect = process.env.MNEMOSYNE_KHRONOTON_DIRECT_NODE === "1";
  const mode: TransportMode =
    forcedDirect || s.transportFallback === "direct-node" ? "direct-node" : "pythia";
  return { mode, nodeUrl: s.nodeUrl, pythiaUrl: s.pythiaUrl };
}

/** Build a chainweb Pact base URL for a Stoa node (the break-glass target). */
export function pactBaseUrl(nodeUrl: string, chainId: string = STOA_CHAIN_ID): string {
  const origin = nodeUrl.replace(/\/+$/, "");
  return `${origin}/chainweb/0.0/${STOA_NETWORK}/chain/${chainId}/pact`;
}
