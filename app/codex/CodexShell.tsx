"use client";

// ============================================================================
// CodexShell — the ONE codex dashboard layout, shared by BOTH surfaces:
//   - the consumer /codex (upload → MemoryCodexAdapter), and
//   - the server /admin/codex (Mnemosyne Codex → MnemosyneServerCodexAdapter).
//
// Both mount the SAME `@ancientpantheon/codex` components; only the adapter and
// the top-bar actions differ. Extracting the layout here guarantees the two
// render identically (the Mnemosyne codex previously drifted — a long tagline
// wrapped the top-bar-right over the body). Must be rendered INSIDE a
// <CodexProvider> (it uses the codex hooks + store).
// ============================================================================

import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

import { useCodexStore } from "@ancientpantheon/codex/provider";
import { useCodex } from "@ancientpantheon/codex/hooks";
import {
  CodexUiRoot,
  CodexTabs,
  CodexSettingsSection,
  CodexDebouncerPanel,
} from "@ancientpantheon/codex/ui";
import {
  ObservationalCodexIdDisplay,
  CodexPasswordPrompt,
} from "@ancientpantheon/codex/ui";
import type { NetworkSettingsModel } from "@ancientpantheon/codex";

import {
  loadNetworkSettings,
  saveNetworkSettings,
  resolveNetworkModel,
  fetchOperatorPythiaUrl,
  STOACHAIN_CHAIN_ID,
  ARWEAVE_CHAIN_ID,
  type NetworkSettings,
} from "./networkSettings";

export interface CodexShellProps {
  /** Brand word next to the ◈ mark (e.g. "Codex" / "Mnemosyne Codex"). */
  brand: string;
  /** Uppercase pill (e.g. "standalone" / "server-sealed"). */
  badge: string;
  /** Short one-line tagline. KEEP IT SHORT — a long tagline wraps the top-bar. */
  tagline: string;
  /** Consumer name passed to CodexSettingsSection. */
  consumerName: string;
  /** Top-bar-right actions (Export/Load for the consumer, Lock for the server codex). */
  topbarActions: ReactNode;
}

/**
 * The shared codex dashboard: the top-bar (brand + view tabs + actions +
 * debouncer) and the body card (CodexID + tabs / settings), plus the network
 * wiring (the operator GLOBAL Pythia from /api/config + the per-browser local
 * StoaChain node override) that both surfaces share.
 */
export function CodexShell({
  brand,
  badge,
  tagline,
  consumerName,
  topbarActions,
}: CodexShellProps): ReactElement {
  const { isReady } = useCodex();
  const store = useCodexStore();

  const [activeView, setActiveView] = useState<"ui" | "settings">("ui");

  // ── Network settings (the "Network" tab) — shared by both surfaces ──────────
  const [network, setNetwork] = useState<NetworkSettings>(() =>
    loadNetworkSettings(),
  );
  const [networkModel, setNetworkModel] = useState<NetworkSettingsModel | null>(
    null,
  );
  // The operator-injected GLOBAL Pythia (set by an ancient in /admin, served from
  // /api/config) — takes precedence over the empty per-user field.
  const [operatorPythiaUrl, setOperatorPythiaUrl] = useState("");

  useEffect(() => {
    let live = true;
    void fetchOperatorPythiaUrl().then((url) => {
      if (live) setOperatorPythiaUrl(url);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    saveNetworkSettings(network);
  }, [network]);

  useEffect(() => {
    if (!isReady) return;
    void store.getState().actions.updateUiSettings({
      selectedNode: "custom",
      customNodeUrl: network.stoaChainNodeUrl,
    });
  }, [isReady, network.stoaChainNodeUrl, store]);

  useEffect(() => {
    let live = true;
    void resolveNetworkModel(network, operatorPythiaUrl).then((model) => {
      if (live) setNetworkModel(model);
    });
    return () => {
      live = false;
    };
  }, [network, operatorPythiaUrl]);

  const setChainUrl = useCallback((chainId: string, url: string) => {
    setNetwork((prev) => {
      if (chainId === STOACHAIN_CHAIN_ID) return { ...prev, stoaChainNodeUrl: url };
      if (chainId === ARWEAVE_CHAIN_ID) return { ...prev, arweaveGatewayUrl: url };
      return prev;
    });
  }, []);

  const setPythiaUrl = useCallback(
    (url: string) => setNetwork((prev) => ({ ...prev, pythiaUrl: url })),
    [],
  );

  return (
    <div className="cxpg-container">
      {/* Global codex password prompt — the modal the CodexID lock control opens.
          Kept OUT of the header flow (mirrors OuronetUI's codex-ui route). */}
      <CodexUiRoot>
        <CodexPasswordPrompt />
      </CodexUiRoot>

      <div className="cxpg-topbar">
        <div className="cxpg-topbar-left">
          <div className="cxpg-titlerow">
            <h1 className="cxpg-brand">
              <span className="cxpg-brand-mark" aria-hidden="true">
                ◈
              </span>
              {brand}
            </h1>
            <span className="cxpg-badge">{badge}</span>
            <p className="cxpg-tagline">{tagline}</p>
          </div>
          <div className="cxpg-viewtabs" role="tablist" aria-label="Codex view">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "ui"}
              className={`cxpg-viewtab${activeView === "ui" ? " cxpg-viewtab--active" : ""}`}
              onClick={() => setActiveView("ui")}
            >
              Codex UI
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "settings"}
              className={`cxpg-viewtab${activeView === "settings" ? " cxpg-viewtab--active" : ""}`}
              onClick={() => setActiveView("settings")}
            >
              Codex UI Settings
            </button>
          </div>
        </div>
        <div className="cxpg-topbar-right">
          <div className="cxpg-codexbar-actions">{topbarActions}</div>
          <CodexUiRoot>
            <CodexDebouncerPanel />
          </CodexUiRoot>
        </div>
      </div>

      <div className="cxpg-bodycard">
        <CodexUiRoot>
          <ObservationalCodexIdDisplay />
        </CodexUiRoot>
        <div className="cxpg-separator" aria-hidden="true" />
        <CodexUiRoot>
          {activeView === "ui" ? (
            <CodexTabs />
          ) : (
            <CodexSettingsSection
              consumerName={consumerName}
              network={
                networkModel
                  ? {
                      model: networkModel,
                      urls: {
                        [STOACHAIN_CHAIN_ID]: network.stoaChainNodeUrl,
                        [ARWEAVE_CHAIN_ID]: network.arweaveGatewayUrl,
                      },
                      onSetChainUrl: setChainUrl,
                      pythiaUrl: network.pythiaUrl,
                      onSetPythiaUrl: setPythiaUrl,
                    }
                  : undefined
              }
            />
          )}
        </CodexUiRoot>
      </div>
    </div>
  );
}

export default CodexShell;
