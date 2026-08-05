// ============================================================================
// networkSettings — the Mnemosyne codex mount's surfaced, editable network config.
// Ported from apps/codex-playground/src/networkSettings.ts.
//
// Surfaces the two-mode Network tab:
//   - Pythia connector (GLOBAL): a Pythia gateway base URL. Empty today — the
//     operator-injected Pythia connector (serving all Mnemosyne users) is a
//     later phase (admin-set). When set + reachable, the chains Pythia advertises
//     flip to "Live via Pythia" and their per-chain local field auto-disables.
//   - Network (LOCAL, per-user): the StoaChain node URL (defaults to the node2
//     host the Codex taps today) and the Arweave gateway (local/testnet, never
//     mainnet — the Arweave path is not yet verified).
//
// Persisted to localStorage (browser-scoped) so edits survive a reload. The
// connection seam is KEYLESS — this module carries only endpoint URLs, never keys.
// ============================================================================

import {
  createConnectionResolver,
  createPythiaConnection,
  type NetworkSettingsModel,
} from "@ancientpantheon/codex";
import {
  createStoaChainConnection,
  STOACHAIN_DEFAULT_NODE_URL,
} from "@ancientpantheon/codex/ouronet";
import { effectivePythiaUrl } from "@/lib/pythiaUrl";
export { fetchOperatorPythiaUrl, fetchOperatorTransport } from "@/lib/pythiaUrl";
export type { OperatorTransport } from "@/lib/pythiaUrl";

/** The StoaChain connection chain id (matches createStoaChainConnection). */
export const STOACHAIN_CHAIN_ID = "stoachain" as const;

// ARWEAVE_CHAIN_ID is the stable literal "arweave" (codex-arweave). We INLINE it
// rather than `import { ARWEAVE_CHAIN_ID } from "@ancientpantheon/codex/arweave"`
// because that aggregate barrel also re-exports the Node-only sqlite address-book
// adapter, which webpack drags into the client component's server trace and fails
// on `Can't resolve 'sqlite'`. The Arweave path is unverified in Mnemosyne anyway
// (local override left undefined below), so a value-identical inline is safe and
// keeps the Node-only arweave adapter out of the browser bundle.
export const ARWEAVE_CHAIN_ID = "arweave" as const;

/** Arweave gateway default — local/testnet, NEVER mainnet arweave.net. */
export const DEFAULT_GATEWAY_URL = "http://localhost:1984" as const;

/** The persisted, editable connection config. */
export interface NetworkSettings {
  /** The Pythia (GLOBAL) base URL. Empty = no global connector → both chains local. */
  pythiaUrl: string;
  /** The StoaChain node URL the dashboard reads/broadcasts against (LOCAL). */
  stoaChainNodeUrl: string;
  /** The Arweave gateway URL the Arweave panel reads/broadcasts against (LOCAL). */
  arweaveGatewayUrl: string;
}

export const NETWORK_SETTINGS_STORAGE_KEY = "mnemosyne:codex:network-settings";

/** Mnemosyne defaults: the StoaChain node2 host (what the Codex taps today, so
 *  the loaded codex reads a live chain out of the box), the local Arweave
 *  gateway, and NO Pythia global yet (operator-injected Pythia is a later phase). */
export const DEFAULT_NETWORK_SETTINGS: NetworkSettings = {
  pythiaUrl: "",
  stoaChainNodeUrl: STOACHAIN_DEFAULT_NODE_URL,
  arweaveGatewayUrl: DEFAULT_GATEWAY_URL,
};

/** Load the surfaced config from localStorage, falling back to defaults per field. */
export function loadNetworkSettings(): NetworkSettings {
  try {
    const raw = window.localStorage.getItem(NETWORK_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NETWORK_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<NetworkSettings>;
    return {
      pythiaUrl:
        typeof parsed.pythiaUrl === "string"
          ? parsed.pythiaUrl
          : DEFAULT_NETWORK_SETTINGS.pythiaUrl,
      stoaChainNodeUrl:
        typeof parsed.stoaChainNodeUrl === "string" && parsed.stoaChainNodeUrl.length > 0
          ? parsed.stoaChainNodeUrl
          : DEFAULT_NETWORK_SETTINGS.stoaChainNodeUrl,
      arweaveGatewayUrl:
        typeof parsed.arweaveGatewayUrl === "string" && parsed.arweaveGatewayUrl.length > 0
          ? parsed.arweaveGatewayUrl
          : DEFAULT_NETWORK_SETTINGS.arweaveGatewayUrl,
    };
  } catch {
    return { ...DEFAULT_NETWORK_SETTINGS };
  }
}

/** Persist the surfaced network config to localStorage. */
export function saveNetworkSettings(settings: NetworkSettings): void {
  try {
    window.localStorage.setItem(
      NETWORK_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings),
    );
  } catch {
    /* storage unavailable (private mode / quota) — state is still live in memory */
  }
}

/**
 * Build the per-chain `NetworkSettingsModel` off the surfaced state. The GLOBAL
 * Pythia connection is the OPERATOR-set gateway (fetched from `/api/config`), which
 * takes precedence over the per-user field so it applies to ALL Mnemosyne users;
 * the per-user field is only a fallback when no operator global is set. No effective
 * pythiaUrl → both chains resolve LOCAL + editable. A pythiaUrl promotes Pythia to
 * the GLOBAL connection (StoaChain-only coverage today, read dynamically from
 * health()); Arweave falls back to its LOCAL gateway.
 */
/** The transport the READ lane branches on — mirrors the server's
 *  `resolveServerTransport`, sourced from `/api/config`. */
export interface ReadTransport {
  operatorPythiaUrl?: string;
  /** `direct-node` = the admin Network Fallback is ON (break-glass). */
  mode?: "pythia" | "direct-node";
  /** The admin-configured direct-node base URL (used only in `direct-node`). */
  fallbackNodeUrl?: string;
}

export function resolveNetworkModel(
  settings: NetworkSettings,
  transport: ReadTransport = {},
): Promise<NetworkSettingsModel> {
  const { operatorPythiaUrl = "", mode = "pythia", fallbackNodeUrl = "" } = transport;

  // BREAK-GLASS: while the admin Network Fallback is on `direct-node`, the READ
  // lane talks straight to the configured Stoa node (UNMETERED) — matching the
  // send/sim lanes. This is the ONLY way a direct-node connection is built, and
  // it is admin-gated (`HANDOFF-mnemosyne-network-fallback.md`).
  if (mode === "direct-node" && fallbackNodeUrl.trim()) {
    const resolver = createConnectionResolver({
      supportedChains: [STOACHAIN_CHAIN_ID, ARWEAVE_CHAIN_ID],
      global: undefined,
      local: {
        [STOACHAIN_CHAIN_ID]: createStoaChainConnection({
          kind: "direct",
          nodeUrl: fallbackNodeUrl,
        }).connection,
        [ARWEAVE_CHAIN_ID]: undefined,
      },
      locked: false,
    });
    return resolver.resolve();
  }

  // DEFAULT: all reads through the GLOBAL Pythia connection. NO per-user
  // direct-node fallback — StoaChain resolves through Pythia or not at all
  // (`organs/06` §6).
  const pythiaUrl = effectivePythiaUrl(operatorPythiaUrl, settings.pythiaUrl);
  const resolver = createConnectionResolver({
    supportedChains: [STOACHAIN_CHAIN_ID, ARWEAVE_CHAIN_ID],
    global: pythiaUrl
      ? createPythiaConnection({ baseUrl: pythiaUrl, chainId: STOACHAIN_CHAIN_ID })
      : undefined,
    local: {
      [STOACHAIN_CHAIN_ID]: undefined,
      [ARWEAVE_CHAIN_ID]: undefined,
    },
    locked: false,
  });
  return resolver.resolve();
}
