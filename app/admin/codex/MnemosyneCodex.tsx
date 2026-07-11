"use client";

// ============================================================================
// MnemosyneCodex — Mnemosyne's OWN operator codex, mounted for the ancient admin.
//
// Ported from AncientHoldings' CodexDropIn. It mounts the SAME real codex-ui as
// the consumer /codex surface (CodexProvider + CodexUiRoot + tabs/settings), but
// against the server-custody MnemosyneServerCodexAdapter instead of an uploaded
// MemoryCodexAdapter. There is NO upload and NO password screen:
//
//   1. Storage: MnemosyneServerCodexAdapter — every mutation seals the whole
//      snapshot server-side (master-key) via /api/admin/codex. Empty on first
//      open (emptySnapshot); the admin populates Seeds + Ouronet Accounts on the
//      spot and each change saves in real time.
//   2. Master-key unlock, no typing: the machine codex password is fetched from
//      /api/admin/codex/unlock.
//        - AutoUnlockOnReady: authenticates once as soon as the store is ready,
//          so the admin lands on an already-open codex (no click, no password).
//        - PasswordAutoResolver: whenever ANY package flow needs the password
//          (signing, reveal, spawn, or re-auth after the cache TTL), it submits
//          the master-key password automatically — so operations "unlock on
//          their own", with no modal.
//        - MnemosyneLockControl: an explicit Lock / Unlock affordance (no
//          password field).
//   3. Network: the SAME wiring as /codex — the operator-set GLOBAL Pythia (from
//      /api/config) plus this admin's per-browser local StoaChain node override.
//      Both surfaces read the same global connector; the local Network-tab
//      override is browser-scoped, so it only affects this operator.
//
// Loaded via next/dynamic({ ssr: false }) from the gate — browser-only.
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";

import {
  CodexProvider,
  useCodexStore,
} from "@ancientpantheon/codex-ouronet/provider";
import {
  useCodex,
  useCodexAuth,
} from "@ancientpantheon/codex-ouronet/hooks";
import {
  CodexUiRoot,
  CodexTabs,
  CodexSettingsSection,
  CodexDebouncerPanel,
} from "@ancientpantheon/codex-ouronet/ui";
import { ObservationalCodexIdDisplay } from "@ancientpantheon/codex-ui/ui";
import type { NetworkSettingsModel } from "@ancientpantheon/codex-core";

import { MnemosyneServerCodexAdapter } from "@/lib/codex-dropin/MnemosyneServerCodexAdapter";
import {
  loadNetworkSettings,
  saveNetworkSettings,
  resolveNetworkModel,
  fetchOperatorPythiaUrl,
  STOACHAIN_CHAIN_ID,
  ARWEAVE_CHAIN_ID,
  type NetworkSettings,
} from "../../codex/networkSettings";
import "../../codex/app.css";

// Cache the master-key unlock for a normal admin session. Modest on purpose —
// any operation re-unlocks on its own after expiry via PasswordAutoResolver.
const SESSION_TTL_MINUTES = 60;

/** Fetch the master-key-sealed codex password (ancient-admin gated). */
async function fetchCodexPassword(): Promise<string> {
  const res = await fetch("/api/admin/codex/unlock", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as
    | { ok: true; password: string }
    | { ok: false; error: string };
  if (!body.ok || !body.password) {
    throw new Error(body.ok ? "empty password" : body.error);
  }
  return body.password;
}

/**
 * Authenticate ONCE as soon as the store is ready, so the codex opens without a
 * click. If the fetch fails we release the latch so the admin can retry via the
 * lock control.
 */
function AutoUnlockOnReady(): null {
  const { isReady } = useCodex();
  const { isLocked, authenticate } = useCodexAuth();
  const done = useRef(false);

  useEffect(() => {
    if (!isReady || !isLocked || done.current) return;
    done.current = true;
    void fetchCodexPassword()
      .then((pw) => authenticate(pw, SESSION_TTL_MINUTES))
      .catch(() => {
        done.current = false;
      });
  }, [isReady, isLocked, authenticate]);

  return null;
}

/**
 * Whenever any package flow calls requestPassword() (signing, reveal, spawn, or
 * re-auth after the cache TTL), submit the master-key password automatically —
 * no modal, no typing. This is what makes self-execution "unlock on its own".
 */
function PasswordAutoResolver(): null {
  const store = useCodexStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = store((s: any) => s.pendingPasswordRequest);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    void (async () => {
      try {
        const pw = await fetchCodexPassword();
        if (cancelled) return;
        store.getState().actions.submitPasswordRequest(pw, SESSION_TTL_MINUTES);
      } catch {
        if (!cancelled) store.getState().actions.cancelPasswordRequest();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending, store]);

  return null;
}

/** One-click lock/unlock — unlock fetches the master-key password (no field). */
function MnemosyneLockControl(): ReactElement {
  const { isLocked, authenticate, lock } = useCodexAuth();
  const [busy, setBusy] = useState(false);

  const onUnlock = useCallback(async () => {
    setBusy(true);
    try {
      const pw = await fetchCodexPassword();
      authenticate(pw, SESSION_TTL_MINUTES);
    } catch {
      /* stays locked; admin can retry */
    } finally {
      setBusy(false);
    }
  }, [authenticate]);

  if (isLocked) {
    return (
      <button
        type="button"
        className="cxpg-btn cxpg-btn--primary cxpg-btn--sm"
        onClick={() => void onUnlock()}
        disabled={busy}
        title="Sealed under the Mnemosyne Master Key. Unlock without a password — access is already restricted to the ancient admin."
      >
        {busy ? "Unlocking…" : "🔓 Unlock with Master Key"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className="cxpg-btn cxpg-btn--ghost cxpg-btn--sm"
      onClick={() => lock()}
      title="Hide decrypted views. Operations still auto-unlock with the Master Key when needed."
    >
      🔒 Lock Codex
    </button>
  );
}

/**
 * The body — the real codex-ui shell, with the network wiring reused from the
 * consumer /codex Dashboard. Rendered inside <CodexProvider> so its hooks see
 * the mounted store.
 */
function CodexBody(): ReactElement {
  const { isReady, initError } = useCodex();
  const store = useCodexStore();

  const [activeView, setActiveView] = useState<"ui" | "settings">("ui");

  // ── Network settings (same as the consumer /codex surface) ────────────────
  const [network, setNetwork] = useState<NetworkSettings>(() =>
    loadNetworkSettings(),
  );
  const [networkModel, setNetworkModel] = useState<NetworkSettingsModel | null>(
    null,
  );
  // The operator-injected GLOBAL Pythia (set by an ancient in /admin, served from
  // /api/config) — the same global connection the consumer surface reads.
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

  // Persist per-browser edits so they survive a reload (local, this operator only).
  useEffect(() => {
    saveNetworkSettings(network);
  }, [network]);

  // Push the StoaChain node into uiSettings (the seam reads/signing follow).
  useEffect(() => {
    if (!isReady) return;
    void store.getState().actions.updateUiSettings({
      selectedNode: "custom",
      customNodeUrl: network.stoaChainNodeUrl,
    });
  }, [isReady, network.stoaChainNodeUrl, store]);

  // Build the per-chain model — the operator GLOBAL Pythia wins over the local field.
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

  if (initError) {
    return (
      <div className="cxpg-app cxpg-landing">
        <div className="cxpg-card cxpg-card--status">
          <p className="cxpg-error" role="alert">
            Failed to load the Mnemosyne Codex: {initError.message}
          </p>
        </div>
      </div>
    );
  }

  if (!isReady) {
    return (
      <div className="cxpg-app cxpg-landing">
        <div className="cxpg-card cxpg-card--status">
          <p className="cxpg-status">Opening the sealed codex…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cxpg-container">
      <div className="cxpg-topbar">
        <div className="cxpg-topbar-left">
          <div className="cxpg-titlerow">
            <h1 className="cxpg-brand">
              <span className="cxpg-brand-mark" aria-hidden="true">
                ◈
              </span>
              Mnemosyne Codex
            </h1>
            <span className="cxpg-badge">server-sealed</span>
            <p className="cxpg-tagline">
              Mnemosyne&apos;s own operator codex — sealed on the server, auto-unlocked
              for you. Populate it on the spot; every change saves in real time.
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
            <MnemosyneLockControl />
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

export default function MnemosyneCodex(): ReactElement {
  // Stable adapter instance for the lifetime of the mount.
  const adapter = useRef<MnemosyneServerCodexAdapter | null>(null);
  if (adapter.current === null) {
    adapter.current = new MnemosyneServerCodexAdapter("main");
  }

  return (
    <CodexProvider
      adapter={adapter.current}
      deviceVariant="main"
      passwordCacheMinutes={SESSION_TTL_MINUTES}
      initialUiSettings={{ passwordCacheMinutes: SESSION_TTL_MINUTES }}
    >
      <AutoUnlockOnReady />
      <PasswordAutoResolver />
      <CodexBody />
    </CodexProvider>
  );
}
