"use client";

// ============================================================================
// The /apollo-verify surface — mounts the GENERIC ApolloVerifyView (from
// @ancientpantheon/codex/ui) behind the SAME load -> restore -> unlock flow the
// /codex page uses (CodexApp.tsx).
//
// A relying party (Pythia first; any consumer via its own `rp`) deep-links here
// with ?accounts&challenge&rp&callback. Because the Codex is MEMORY-ONLY
// (MemoryCodexAdapter — nothing persists across page loads), a fresh landing has
// no codex, so the user uploads the encrypted `.json` + unlocks right here; then
// ApolloVerifyView reads the URL params, signs the ownership challenge with the
// held Apollo keys, and redirects back to the RP. The private key never leaves
// the browser — only the signatures return.
// ============================================================================

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import { CodexProvider } from "@ancientpantheon/codex/provider";
import { useCodex, useCodexAuth, useCodexBackup } from "@ancientpantheon/codex/hooks";
import { MemoryCodexAdapter } from "@ancientpantheon/codex/ouronet";
import { ApolloVerifyView } from "@ancientpantheon/codex/ui";

import { UnlockScreen } from "../codex/UnlockScreen";
import "../codex/app.css";

type LoadedState =
  | { kind: "idle" }
  | { kind: "encrypted"; adapter: MemoryCodexAdapter; backupText: string };

function StatusScreen({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="cxpg-app cxpg-landing">
      <div className="cxpg-card cxpg-card--status">{children}</div>
    </div>
  );
}

/**
 * Mounted inside an EMPTY <CodexProvider>: restore the uploaded backup INTO the
 * mounted store (importFromCloud must wait for `isReady` — the provider's own
 * init effect sets the adapter, and child effects run first), gate on unlock,
 * then render the verify view (which reads the URL params + signs). Mirrors
 * EncryptedSession in CodexApp.tsx, but ends in ApolloVerifyView not Dashboard.
 */
function VerifySession({ backupText }: { backupText: string }): ReactElement {
  const { importFromCloud } = useCodexBackup();
  const { isLocked } = useCodexAuth();
  const { isReady } = useCodex();
  const [restored, setRestored] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!isReady || started.current) return;
    started.current = true;
    importFromCloud(backupText)
      .then(() => setRestored(true))
      .catch((err: unknown) => setRestoreError(err instanceof Error ? err.message : String(err)));
  }, [isReady, importFromCloud, backupText]);

  if (restoreError !== null) {
    return (
      <StatusScreen>
        <p className="cxpg-error" role="alert">Could not restore backup: {restoreError}</p>
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
  if (isLocked) return <UnlockScreen />;
  return <ApolloVerifyView />;
}

export function ApolloVerifyApp(): ReactElement {
  const [loaded, setLoaded] = useState<LoadedState>({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Context from the relying party's deep-link, shown on the load screen so the
  // user knows who is asking and how many keys.
  const ctx = useMemo(() => {
    if (typeof window === "undefined") return { rp: "", count: 0 };
    const p = new URLSearchParams(window.location.search);
    const accounts = (p.get("accounts") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return { rp: p.get("rp") ?? "", count: accounts.length };
  }, []);

  const onUpload = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backupText = await file.text();
      setLoaded({ kind: "encrypted", adapter: new MemoryCodexAdapter("dev"), backupText });
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  if (loadError !== null) {
    return (
      <StatusScreen>
        <p className="cxpg-error" role="alert">Could not load codex: {loadError}</p>
        <button type="button" className="cxpg-btn cxpg-btn--primary" onClick={() => setLoadError(null)}>
          Try another file
        </button>
      </StatusScreen>
    );
  }

  if (loaded.kind === "idle") {
    return (
      <div className="cxpg-app cxpg-landing">
        <div className="cxpg-card">
          <div className="cxpg-logo" aria-hidden="true">◈</div>
          <h1 className="cxpg-title">Prove Apollo ownership</h1>
          <p className="cxpg-subtitle">
            {ctx.rp
              ? `“${ctx.rp}” asks you to prove control of ${ctx.count} Apollo ${ctx.count === 1 ? "key" : "keys"}.`
              : "Load the Codex that holds the requested Apollo keys."}
          </p>
          <label htmlFor="apollo-codex-file" className="cxpg-upload">
            <span className="cxpg-upload-icon" aria-hidden="true">⭳</span>
            <span className="cxpg-upload-title">Load your Codex</span>
            <span className="cxpg-upload-hint">
              Choose the <code>.json</code> you exported from your wallet
            </span>
            <input
              id="apollo-codex-file"
              className="cxpg-file-input"
              type="file"
              accept="application/json,.json"
              onChange={onUpload}
            />
          </label>
          <p className="cxpg-note">Nothing leaves this device — only the signature returns to the relying party.</p>
        </div>
      </div>
    );
  }

  return (
    <CodexProvider adapter={loaded.adapter} deviceVariant="dev">
      <VerifySession backupText={loaded.backupText} />
    </CodexProvider>
  );
}

export default ApolloVerifyApp;
