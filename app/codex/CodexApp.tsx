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

import { CodexProvider } from "@ancientpantheon/codex/provider";
import {
  useCodex,
  useCodexAuth,
  useCodexBackup,
  useCodexLifecycle,
} from "@ancientpantheon/codex/hooks";
import { MemoryCodexAdapter } from "@ancientpantheon/codex/ouronet";
import { setPactReader } from "@stoachain/stoa-core/reads";
import { KadenaWalletBuilder } from "@stoachain/stoa-core/wallet";
import {
  createCodexDirectPythiaSigningClient,
  createCodexDirectPythiaPactReader,
} from "./codexRelaySigningClient";

// Route EVERY codex display read (`pactRead`) through Pythia's public `/read`
// instead of node-direct (the default reader), so a consumer's reads are metered
// (`organs/06` §6a). Keyless browser-direct (a public visitor has no operator
// key); break-glass Network Fallback goes node-direct. Installed at module load.
setPactReader(createCodexDirectPythiaPactReader());

import { CodexShell } from "./CodexShell";

import { UnlockScreen } from "./UnlockScreen";
import "./app.css";

/** The three Stoa seed types a new codex's prime seed can be derived under. */
export type SeedType = "koala" | "chainweaver" | "eckowallet";

/** What the App is currently rendering: the load screen, or a mounted codex. */
type LoadedState =
  | { kind: "idle" }
  | { kind: "encrypted"; adapter: MemoryCodexAdapter; backupText: string }
  | { kind: "creating"; adapter: MemoryCodexAdapter; seedType: SeedType; password: string };

/**
 * The dashboard — the real shipped shell inside a slim chrome (title + export +
 * "load a different codex"). Rendered inside <CodexProvider> so its hooks
 * (useCodexBackup) see the mounted store.
 */
export function Dashboard({ onReset }: { onReset?: () => void } = {}): ReactElement {
  // The consumer surface: the shared CodexShell + the upload-flow top-bar actions
  // (export the loaded codex / load a different one). Layout lives in CodexShell so
  // this stays identical to the server /admin/codex surface.
  const { downloadAsJson } = useCodexBackup();
  return (
    <CodexShell
      brand="Codex"
      badge="standalone"
      tagline="Your multi-chain key vault — local & offline."
      consumerName="Mnemosyne"
      topbarActions={
        <>
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
        </>
      }
    />
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

const CREATE_TTL_MINUTES = 60;

/**
 * Mounted inside an EMPTY <CodexProvider> to CREATE a brand-new codex from
 * scratch. On mount (once, when the store is ready): sets the password, generates
 * a fresh mnemonic of the chosen Stoa seed type, and `kickstart`s the codex — the
 * package derives the double-Apollo identity, the CodexGuard, the duoPrime kadena
 * keys (pos0 payment + pos1 guard), and the Prime Ouronet account (UNACTIVATED;
 * on-chain deploy is a later step). All local — no secret leaves the device.
 * Then shows the recovery phrase (the mnemonic) ONCE before the dashboard.
 */
function CreateSession({
  seedType,
  password,
  onReset,
}: {
  seedType: SeedType;
  password: string;
  onReset: () => void;
}): ReactElement {
  const { authenticate } = useCodexAuth();
  const { kickstart } = useCodexLifecycle();
  const { downloadAsJson } = useCodexBackup();
  const { isReady } = useCodex();
  const [phrase, setPhrase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [entered, setEntered] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!isReady || started.current) return;
    started.current = true;
    void (async () => {
      try {
        // Password FIRST: kickstart reads the cached password to encrypt secrets.
        authenticate(password, CREATE_TTL_MINUTES);
        // 12-word BIP39 — the format the Kadena wallets (Chainweaver / eckoWALLET,
        // and Koala) accept, so the generated seed can later be imported into the
        // chosen wallet type.
        const mnemonic = await KadenaWalletBuilder.generateMnemonic(12);
        await kickstart({
          codexIdSeed: { mode: "words", value: mnemonic },
          codexPrimeSeed: { source: "reuse-codexid-whole" },
          duoPrime: { mode: "kadena-seed", seedType, mnemonic },
        });
        setPhrase(mnemonic);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [isReady, authenticate, kickstart, password, seedType]);

  if (error !== null) {
    return (
      <StatusScreen>
        <p className="cxpg-error" role="alert">
          Could not create the codex: {error}
        </p>
        <button type="button" className="cxpg-btn cxpg-btn--primary" onClick={onReset}>
          Back
        </button>
      </StatusScreen>
    );
  }
  if (phrase === null) {
    return (
      <StatusScreen>
        <p className="cxpg-status">Creating your codex…</p>
      </StatusScreen>
    );
  }
  if (entered) {
    return <Dashboard onReset={onReset} />;
  }
  const words = phrase.split(/\s+/);
  return (
    <StatusScreen>
      <h1 className="cxpg-title">Save your recovery phrase</h1>
      <p className="cxpg-mnemo-warn" role="alert">
        These <strong>{words.length} words</strong> are the ONLY way to recover this codex — a
        <code> {seedType} </code> Stoa seed. Write them down and keep them offline. Anyone with the
        phrase controls the codex; if you lose it, the codex is unrecoverable.
      </p>
      <ol className="cxpg-mnemo-grid">
        {words.map((w, i) => (
          <li key={i} className="cxpg-mnemo-word">
            <span className="cxpg-mnemo-idx">{i + 1}</span>
            {w}
          </li>
        ))}
      </ol>
      <div className="cxpg-mnemo-actions">
        <button
          type="button"
          className="cxpg-btn cxpg-btn--ghost cxpg-btn--sm"
          onClick={() => void navigator.clipboard?.writeText(phrase)}
        >
          Copy phrase
        </button>
        <button
          type="button"
          className="cxpg-btn cxpg-btn--ghost cxpg-btn--sm"
          onClick={() => void downloadAsJson()}
        >
          Download codex (.json)
        </button>
      </div>
      <label className="cxpg-mnemo-confirm">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have written down my recovery phrase and understand it cannot be shown again.
      </label>
      <button
        type="button"
        className="cxpg-btn cxpg-btn--primary"
        disabled={!saved}
        onClick={() => setEntered(true)}
      >
        Open Codex
      </button>
    </StatusScreen>
  );
}

export function CodexApp({ codexVersion = "unknown" }: { codexVersion?: string } = {}): ReactElement {
  const [loaded, setLoaded] = useState<LoadedState>({ kind: "idle" });
  const [loadError, setLoadError] = useState<string | null>(null);

  // Route a consumer's own-codex on-chain WRITES through Pythia's meter so a
  // user activating an Apollo half (or any tx) COUNTS as a transaction, instead
  // of the codex signing strategy submitting direct-to-node. This is the PUBLIC
  // surface (any visitor's uploaded codex), so it broadcasts KEYLESS straight to
  // Pythia's public `/stoachain/send` (attributed "direct") — never through
  // Mnemosyne's operator key. (organs/06 §6/§6a.) Stable for the mount lifetime.
  const signingClient = useRef<ReturnType<typeof createCodexDirectPythiaSigningClient> | null>(null);
  if (signingClient.current === null) {
    signingClient.current = createCodexDirectPythiaSigningClient();
  }
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

  // Create a brand-new codex from scratch: mount an EMPTY adapter; CreateSession
  // sets the password + kickstarts the prime seed/identity post-mount.
  const createCodex = useCallback((seedType: SeedType, password: string) => {
    setLoadError(null);
    setLoaded({ kind: "creating", adapter: new MemoryCodexAdapter("dev"), seedType, password });
  }, []);

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
        onCreate={createCodex}
        onBack={goHome}
        codexVersion={codexVersion}
      />
    );
  } else {
    // Mount empty -> (restore | create) -> unlock -> dashboard, under the host bar.
    content = (
      <>
        <MnemosyneBar
          onBackToMnemosyne={() => setShowMnemosyne(true)}
          onLogout={goHome}
        />
        <CodexProvider
          adapter={loaded.adapter}
          deviceVariant="dev"
          signingClient={signingClient.current}
        >
          {loaded.kind === "creating" ? (
            <CreateSession seedType={loaded.seedType} password={loaded.password} onReset={reset} />
          ) : (
            <EncryptedSession backupText={loaded.backupText} onReset={reset} />
          )}
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
const SEED_TYPES: { value: SeedType; label: string }[] = [
  { value: "koala", label: "Koala" },
  { value: "chainweaver", label: "Chainweaver" },
  { value: "eckowallet", label: "eckoWALLET" },
];

function LoadCodexScreen({
  onUploadBackup,
  onCreate,
  onBack,
  codexVersion,
}: {
  onUploadBackup: (event: ChangeEvent<HTMLInputElement>) => void;
  onCreate: (seedType: SeedType, password: string) => void;
  onBack: () => void;
  codexVersion: string;
}): ReactElement {
  const [mode, setMode] = useState<"load" | "create">("load");
  const [seedType, setSeedType] = useState<SeedType>("koala");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;
  const canCreate = password.length >= 8 && password === confirm;

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

        <div className="cxpg-tabs" role="tablist" aria-label="Load or create">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "load"}
            className={`cxpg-tab${mode === "load" ? " cxpg-tab--active" : ""}`}
            onClick={() => setMode("load")}
          >
            Load a Codex
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "create"}
            className={`cxpg-tab${mode === "create" ? " cxpg-tab--active" : ""}`}
            onClick={() => setMode("create")}
          >
            Create a new Codex
          </button>
        </div>

        {mode === "load" ? (
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
        ) : (
          <form
            className="cxpg-create"
            onSubmit={(e) => {
              e.preventDefault();
              if (canCreate) onCreate(seedType, password);
            }}
          >
            <fieldset className="cxpg-seedtype">
              <legend className="cxpg-create-label">Stoa seed type</legend>
              {SEED_TYPES.map((s) => (
                <label key={s.value} className="cxpg-seedtype-opt">
                  <input
                    type="radio"
                    name="seedType"
                    value={s.value}
                    checked={seedType === s.value}
                    onChange={() => setSeedType(s.value)}
                  />
                  {s.label}
                </label>
              ))}
            </fieldset>
            <p className="cxpg-create-hint">
              A fresh seed of this type is generated (its first two keys), and the Prime Ouronet account
              is derived from the same words — <strong>unactivated</strong>.
            </p>
            <input
              className="cxpg-input"
              type="password"
              placeholder="Codex password (min 8 chars)"
              value={password}
              autoComplete="new-password"
              onChange={(e) => setPassword(e.target.value)}
            />
            <input
              className="cxpg-input"
              type="password"
              placeholder="Confirm password"
              value={confirm}
              autoComplete="new-password"
              onChange={(e) => setConfirm(e.target.value)}
            />
            {mismatch ? <p className="cxpg-error">Passwords don&rsquo;t match.</p> : null}
            <button type="submit" className="cxpg-btn cxpg-btn--primary" disabled={!canCreate}>
              Create Codex
            </button>
          </form>
        )}

        <p className="cxpg-note">Nothing leaves this device — no account, no cloud.</p>
        <p className="cxpg-note cxpg-engine-badge">
          Codex engine <strong>v{codexVersion}</strong>
          <span className="cxpg-engine-pkg"> · @ancientpantheon/codex</span>
        </p>
      </div>
    </div>
  );
}
