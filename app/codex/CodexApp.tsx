"use client";

// ============================================================================
// The mounted standalone Codex — ported from apps/codex-playground/src/App.tsx.
//
// It mounts the REAL codex-ouronet dashboard (CodexProvider + CodexUiRoot + the
// tabs) against a file-upload-hydrated MemoryCodexAdapter. The product flow is a
// single path: no codex loaded -> a clean "Load your Codex" screen; upload the
// encrypted `.json` you exported from your wallet -> restore it into the mounted
// store via the REAL useCodexBackup().importFromCloud -> unlock with your
// password -> the full Codex UI.
//
// Mount an EMPTY adapter FIRST, restore the uploaded backup INTO the mounted
// store via importFromCloud (the single-reader restore path — a hook that
// operates on the mounted store, so it can't run pre-mount), gate on
// <UnlockScreen/> until useCodexAuth().authenticate seeds the cache, THEN render
// the dashboard.
//
// The phase-1 milestone is the core flow; the playground's Arweave foreign-chain
// toggle and its editable network-settings rows are intentionally not ported —
// CodexSettingsSection renders with no network config (its `network` prop is
// optional).
//
// SECRET HYGIENE: nothing here logs a password, a snapshot, or a backup blob.
// The uploaded backup text is handed straight to importFromCloud; the password
// lives only inside <UnlockScreen>'s masked input.
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { CodexProvider, useCodexStore } from "@ancientpantheon/codex/provider";
import {
  CodexUiRoot,
  CodexTabs,
  CodexSettingsSection,
  CodexDebouncerPanel,
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
import {
  ObservationalCodexIdDisplay,
  CodexPasswordPrompt,
} from "@ancientpantheon/codex/ui";
import {
  useCodex,
  useCodexAuth,
  useCodexBackup,
} from "@ancientpantheon/codex/hooks";
import { MemoryCodexAdapter } from "@ancientpantheon/codex/ouronet";

import { UnlockScreen } from "./UnlockScreen";
import "./app.css";

/** What the App is currently rendering: the load screen, or a mounted codex. */
type LoadedState =
  | { kind: "idle" }
  | { kind: "encrypted"; adapter: MemoryCodexAdapter; backupText: string };

/**
 * The dashboard — the real shipped shell inside a slim chrome (title + export +
 * "load a different codex"). Rendered inside <CodexProvider> so its hooks
 * (useCodexBackup) see the mounted store.
 */
export function Dashboard({ onReset }: { onReset?: () => void } = {}): ReactElement {
  const { downloadAsJson } = useCodexBackup();
  const { isReady } = useCodex();
  const store = useCodexStore();

  // The Codex UI / Codex UI Settings view toggle (consumer-composed — CodexUiRoot
  // is only a token-scope boundary; the split is the app's to build).
  const [activeView, setActiveView] = useState<"ui" | "settings">("ui");

  // ── Network settings (the "Network" tab in Codex UI Settings) ──────────────
  // Surfaced, editable, per-user endpoints (StoaChain node + Arweave gateway) plus
  // the Pythia connector URL, persisted to localStorage. Without this `network`
  // prop the settings section renders with no Network tab — which is why it was
  // missing in the first Phase-1 mount.
  const [network, setNetwork] = useState<NetworkSettings>(() =>
    loadNetworkSettings(),
  );
  const [networkModel, setNetworkModel] = useState<NetworkSettingsModel | null>(
    null,
  );
  // The operator-injected Pythia gateway (set by an ancient in /admin, served from
  // /api/config). It is the GLOBAL connection for ALL Mnemosyne users and takes
  // precedence over the empty per-user field — fetched once at mount.
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

  // Persist edits so they survive a reload.
  useEffect(() => {
    saveNetworkSettings(network);
  }, [network]);

  // Push the StoaChain node into uiSettings (selectedNode:"custom"/customNodeUrl)
  // — the seam the dashboard's reads/signing follow. Gated on isReady: the
  // adapter is wired only after the provider's init effect runs.
  useEffect(() => {
    if (!isReady) return;
    void store.getState().actions.updateUiSettings({
      selectedNode: "custom",
      customNodeUrl: network.stoaChainNodeUrl,
    });
  }, [isReady, network.stoaChainNodeUrl, store]);

  // Build the per-chain NetworkSettingsModel off the surfaced state + the operator
  // global (async resolve). The operator Pythia URL wins over the per-user field.
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
              Codex
            </h1>
            <span className="cxpg-badge">standalone</span>
            <p className="cxpg-tagline">
              The standalone Codex — your multi-chain key vault, local &amp; offline.
            </p>
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
          <div className="cxpg-codexbar-actions">
            <button
              type="button"
              className="cxpg-btn cxpg-btn--primary cxpg-btn--sm"
              onClick={() => void downloadAsJson()}
            >
              Export codex to JSON
            </button>
            {onReset ? (
              <button
                type="button"
                className="cxpg-btn cxpg-btn--ghost cxpg-btn--sm"
                onClick={onReset}
              >
                Load a different codex
              </button>
            ) : null}
          </div>
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
              consumerName="Mnemosyne"
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

/**
 * Mounted inside an EMPTY <CodexProvider>. On mount it restores the uploaded
 * backup INTO the mounted store via the REAL importFromCloud (a hook that
 * operates on the mounted store — it cannot run pre-mount), then gates the
 * dashboard behind <UnlockScreen/> until authenticate() unlocks the store.
 */
function EncryptedSession({
  backupText,
  onReset,
}: {
  backupText: string;
  onReset: () => void;
}): ReactElement {
  const { importFromCloud } = useCodexBackup();
  const { isLocked } = useCodexAuth();
  const { isReady } = useCodex();
  const [restored, setRestored] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const restoreStarted = useRef(false);

  useEffect(() => {
    // The provider's OWN init effect (a parent effect) sets the store's adapter;
    // child effects run first, so restore must WAIT for `isReady` — otherwise
    // importFromCloud reads a null adapter and throws. Restore exactly once
    // (StrictMode double-invokes effects; re-running would re-hydrate needlessly).
    if (!isReady || restoreStarted.current) return;
    restoreStarted.current = true;
    importFromCloud(backupText)
      .then(() => setRestored(true))
      // A malformed / wrong-version upload rejects with CodexImportError, whose
      // message names only the stage + field (already secret-free — no uploaded
      // bytes, no password). Surface it and offer the load screen instead of
      // hanging forever on the "Restoring backup…" spinner.
      .catch((err: unknown) => {
        setRestoreError(err instanceof Error ? err.message : String(err));
      });
  }, [isReady, importFromCloud, backupText]);

  if (restoreError !== null) {
    return (
      <StatusScreen>
        <p className="cxpg-error" role="alert">
          Could not restore backup: {restoreError}
        </p>
        <button type="button" className="cxpg-btn cxpg-btn--primary" onClick={onReset}>
          Try another file
        </button>
      </StatusScreen>
    );
  }
  if (!restored) {
    return (
      <StatusScreen>
        <p className="cxpg-status">Restoring backup…</p>
      </StatusScreen>
    );
  }
  if (isLocked) {
    return <UnlockScreen />;
  }
  return <Dashboard onReset={onReset} />;
}

export function CodexApp({ codexVersion = "unknown" }: { codexVersion?: string } = {}): ReactElement {
  const [loaded, setLoaded] = useState<LoadedState>({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether the "Back to Mnemosyne" overlay is showing. While true the codex tree
  // is only HIDDEN (display:none) — never unmounted — so a loaded codex is kept
  // in memory and the user can return to it (item 2). No secrets are persisted.
  const [showMnemosyne, setShowMnemosyne] = useState(false);

  const reset = useCallback(() => {
    setLoadError(null);
    setLoaded({ kind: "idle" });
  }, []);

  // Leave the Codex entirely and return to the Mnemosyne landing. A full document
  // navigation tears down the in-memory MemoryCodexAdapter — i.e. a real logout
  // (item 1). Also used as the "back" from the load screen (item 3), where there
  // is nothing loaded to preserve.
  const goHome = useCallback(() => {
    window.location.href = "/";
  }, []);

  // While the "Back to Mnemosyne" overlay is open, the landing runs inside our
  // iframe and rewrites its "Launch Codex" buttons to "Back to Codex", which
  // postMessage this signal up. Returning to the still-loaded codex = closing
  // the overlay (the codex tree was only hidden, never unmounted).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data === "mnemo:back-to-codex") setShowMnemosyne(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setShowMnemosyne(false);
    }
    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const loadEncrypted = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const backupText = await file.text();
        // Mount an EMPTY adapter; EncryptedSession restores INTO it post-mount.
        setLoaded({
          kind: "encrypted",
          adapter: new MemoryCodexAdapter("dev"),
          backupText,
        });
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : String(err));
      }
    },
    [],
  );

  let content: ReactElement;
  if (loadError !== null) {
    content = (
      <StatusScreen>
        <p className="cxpg-error" role="alert">
          Could not load codex: {loadError}
        </p>
        <button type="button" className="cxpg-btn cxpg-btn--primary" onClick={reset}>
          Try another file
        </button>
      </StatusScreen>
    );
  } else if (loaded.kind === "idle") {
    content = (
      <LoadCodexScreen
        onUploadBackup={loadEncrypted}
        onBack={goHome}
        codexVersion={codexVersion}
      />
    );
  } else {
    // Mount empty -> restore -> unlock -> dashboard, under the Mnemosyne host bar.
    content = (
      <>
        <MnemosyneBar
          onBackToMnemosyne={() => setShowMnemosyne(true)}
          onLogout={goHome}
        />
        <CodexProvider adapter={loaded.adapter} deviceVariant="dev">
          <EncryptedSession backupText={loaded.backupText} onReset={reset} />
        </CodexProvider>
      </>
    );
  }

  return (
    <>
      <div className={showMnemosyne ? "mnemo-hidden" : undefined}>{content}</div>
      {showMnemosyne ? <MnemosyneOverlay /> : null}
    </>
  );
}

export default CodexApp;

/**
 * The slim Mnemosyne host bar shown above an active codex session. "Back to
 * Mnemosyne" keeps the codex loaded (overlay); "Log out" tears it down and
 * returns to the Mnemosyne landing.
 */
function MnemosyneBar({
  onBackToMnemosyne,
  onLogout,
}: {
  onBackToMnemosyne: () => void;
  onLogout: () => void;
}): ReactElement {
  return (
    <div className="mnemo-bar">
      <span className="mnemo-bar-brand">
        <span className="mnemo-lambda" aria-hidden="true">
          ΛΛ
        </span>
        nemosyne
      </span>
      <div className="mnemo-bar-actions">
        <button
          type="button"
          className="mnemo-btn mnemo-btn--ghost"
          onClick={onBackToMnemosyne}
        >
          ← Back to Mnemosyne
        </button>
        <button
          type="button"
          className="mnemo-btn mnemo-btn--solid"
          onClick={onLogout}
        >
          Log out
        </button>
      </div>
    </div>
  );
}

/**
 * The "Back to Mnemosyne (keep codex loaded)" overlay — the Mnemosyne landing in
 * an iframe rendered ON TOP of the still-mounted (display:none'd) codex, with a
 * prominent control to return to the loaded codex. Because the codex tree is
 * never unmounted, its in-memory state survives (item 2).
 */
function MnemosyneOverlay(): ReactElement {
  // No parent "Back to Codex" button — the embedded landing's own nav button
  // (rewritten to "Back to Codex", next to the v0.1 pill) is the single return
  // path; it postMessages up to close this overlay. Esc also closes it (handled
  // in CodexApp) as a keyboard safety net.
  return (
    <div className="mnemo-overlay">
      <iframe className="mnemo-overlay-frame" src="/" title="Mnemosyne" />
    </div>
  );
}

/** A centered chrome wrapper for the load / status / error screens. */
function StatusScreen({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="cxpg-app cxpg-landing">
      <div className="cxpg-card cxpg-card--status">{children}</div>
    </div>
  );
}

/**
 * The load screen — the single product entry point: upload the encrypted codex
 * `.json` you exported from your wallet. No demo/fixture shortcuts; you always
 * load a real codex.
 */
function LoadCodexScreen({
  onUploadBackup,
  onBack,
  codexVersion,
}: {
  onUploadBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  onBack: () => void;
  codexVersion: string;
}): ReactElement {
  return (
    <div className="cxpg-app cxpg-landing">
      {/* Leave without loading a codex, back to the Mnemosyne site (item 3). */}
      <button
        type="button"
        className="mnemo-btn mnemo-btn--ghost mnemo-loadback"
        onClick={onBack}
      >
        ← Back to Mnemosyne
      </button>
      <div className="cxpg-card">
        <div className="cxpg-logo" aria-hidden="true">
          ◈
        </div>
        <h1 className="cxpg-title">Codex</h1>
        <p className="cxpg-subtitle">
          Your multi-chain key vault — local &amp; offline.
        </p>

        <label htmlFor="codex-file" className="cxpg-upload">
          <span className="cxpg-upload-icon" aria-hidden="true">
            ⭳
          </span>
          <span className="cxpg-upload-title">Load your Codex</span>
          <span className="cxpg-upload-hint">
            Choose the <code>.json</code> you exported from your wallet
          </span>
          <input
            id="codex-file"
            className="cxpg-file-input"
            type="file"
            accept="application/json,.json"
            onChange={onUploadBackup}
          />
        </label>

        <p className="cxpg-note">Nothing leaves this device — no account, no cloud.</p>
        <p className="cxpg-note cxpg-engine-badge">
          Codex engine <strong>v{codexVersion}</strong>
          <span className="cxpg-engine-pkg"> · @ancientpantheon/codex</span>
        </p>
      </div>
    </div>
  );
}
