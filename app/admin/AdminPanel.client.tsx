"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";

import { AuthStatus } from "@/components/AuthStatus";

import "./admin.css";

/** The `/api/me` shape (mirrors the route handler payload). */
interface MeResponse {
  authenticated: boolean;
  name?: string;
  roles?: string[];
}

interface RebuildResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  command: string;
  note: string;
  versionBefore: string;
  versionAfter: string;
  changed: boolean;
}

function isAncient(me: MeResponse | null): boolean {
  return Boolean(me?.authenticated && me.roles?.includes("ancient"));
}

/**
 * The ancient-only admin panel. Gates client-side off `/api/me` (the routes gate
 * again server-side — this is UX, not the security boundary):
 *  - not authenticated  → a "Login with AncientHub" prompt;
 *  - authenticated, not ancient → a "Not authorized" notice;
 *  - ancient → the panel: Pythia connector config, Update Codex, network status.
 *
 * The panel is a SHELL — {@link PanelSections} lists the sections so a later phase
 * (the operator-identity/Automaton section) can add one without touching the gate.
 */
export function AdminPanel({ codexVersion }: { codexVersion: string }): ReactElement {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: MeResponse) => {
        if (active) setMe(data);
      })
      .catch(() => {
        if (active) setMe({ authenticated: false });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mnemo-admin">
      <header className="mnemo-admin-header">
        <div className="mnemo-admin-headleft">
          <a className="mnemo-admin-btn mnemo-admin-btn--ghost" href="/">
            ← Back to Mnemosyne
          </a>
          <h1 className="mnemo-admin-title">Mnemosyne Admin</h1>
        </div>
        <AuthStatus />
      </header>

      {me === null ? (
        <p className="mnemo-admin-muted">Checking your session…</p>
      ) : !me.authenticated ? (
        <section className="mnemo-admin-gate">
          <p className="mnemo-admin-muted">
            Sign in with your AncientHub account to manage Mnemosyne.
          </p>
          <a className="mnemo-admin-btn mnemo-admin-btn--primary" href="/admin/login">
            Login with AncientHub
          </a>
        </section>
      ) : !isAncient(me) ? (
        <section className="mnemo-admin-gate">
          <p className="mnemo-admin-notice" role="alert">
            Not authorized — the admin panel requires the <strong>ancient</strong>{" "}
            role. You are signed in as {me.name ?? "an operator"}
            {me.roles?.length ? ` (${me.roles.join(", ")})` : ""}.
          </p>
        </section>
      ) : (
        <PanelSections codexVersion={codexVersion} />
      )}
    </main>
  );
}

/** The ancient-only sections. Later phases add sections here (Phase 5: signing lane). */
function PanelSections({ codexVersion }: { codexVersion: string }): ReactElement {
  return (
    <div className="mnemo-admin-sections">
      <MnemosyneCodexSection />
      <PythiaConnectorSection />
      <UpdateCodexSection codexVersion={codexVersion} />
      <NetworkStatusSection />
      {/* Later phases contribute additional ancient-only sections here. */}
    </div>
  );
}

/**
 * Mnemosyne's own operator codex — sealed on the server under the master key,
 * auto-unlocked for the ancient admin (no password). Opens the full codex-ui at
 * /admin/codex, where the admin populates Seeds + Ouronet Accounts on the spot
 * and every change saves in real time.
 */
function MnemosyneCodexSection(): ReactElement {
  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Mnemosyne Codex</h2>
      <p className="mnemo-admin-muted">
        Mnemosyne&apos;s own operator codex — sealed on the server under the master
        key and auto-unlocked for you (no password). Populate it with Seeds and
        Ouronet Accounts on the spot; every change saves in real time.
      </p>
      <a className="mnemo-admin-btn mnemo-admin-btn--primary" href="/admin/codex">
        Open Mnemosyne Codex →
      </a>
    </section>
  );
}

/**
 * Pythia connector: set/clear the operator gateway that becomes the Codex `global`
 * connection for all Mnemosyne users. Loads the current value from the public
 * `/api/config`, saves through the ancient-gated `/api/admin/pythia`.
 */
function PythiaConnectorSection(): ReactElement {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { pythiaUrl?: string }) => {
        if (active) setUrl(data.pythiaUrl ?? "");
      })
      .catch(() => {
        /* leave empty — operator can still set one */
      });
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(
    async (value: string) => {
      setBusy(true);
      setStatus(null);
      try {
        const res = await fetch("/api/admin/pythia", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pythiaUrl: value }),
        });
        const body = (await res.json()) as { pythiaUrl?: string; error?: string };
        if (!res.ok) {
          setStatus(body.error ?? `Save failed (${res.status})`);
          return;
        }
        setUrl(body.pythiaUrl ?? "");
        setStatus(
          body.pythiaUrl
            ? "Saved — this Pythia gateway is now the global connector for all users."
            : "Cleared — users fall back to their local node.",
        );
      } catch {
        setStatus("Save failed — network error.");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Pythia connector</h2>
      <p className="mnemo-admin-muted">
        The gateway injected as the Codex global connection for every Mnemosyne user.
        Leave empty to clear it. URLs only — no keys.
      </p>
      <div className="mnemo-admin-row">
        <input
          className="mnemo-admin-input"
          type="url"
          placeholder="https://pythia.ancientholdings.eu"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={busy}
        />
        <button
          type="button"
          className="mnemo-admin-btn mnemo-admin-btn--primary"
          disabled={busy}
          onClick={() => void save(url)}
        >
          Save
        </button>
        <button
          type="button"
          className="mnemo-admin-btn"
          disabled={busy}
          onClick={() => void save("")}
        >
          Clear
        </button>
      </div>
      {status ? <p className="mnemo-admin-status">{status}</p> : null}
    </section>
  );
}

/** `/api/admin/codex-version` payload. */
interface CodexVersionInfo {
  installed: string;
  available: string | null;
  updateAvailable: boolean;
}

/**
 * Update Codex: shows the INSTALLED `@ancientpantheon/codex` version alongside the
 * latest AVAILABLE version on npm, and pulls `@latest` on demand. The version pair
 * is fetched live from `/api/admin/codex-version` (and re-fetched after a pull) so
 * the operator can see whether an update exists before clicking. Never restarts the
 * server — see the note the server action returns.
 */
function UpdateCodexSection({ codexVersion }: { codexVersion: string }): ReactElement {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RebuildResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<CodexVersionInfo | null>(null);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/codex-version", { cache: "no-store" });
      if (res.ok) setInfo((await res.json()) as CodexVersionInfo);
    } catch {
      /* leave info null → fall back to the installed prop only */
    }
  }, []);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/update-codex", { method: "POST" });
      setResult((await res.json()) as RebuildResult);
      void loadVersions(); // refresh installed/available after the pull
    } catch {
      setError("Update request failed — network error.");
    } finally {
      setBusy(false);
    }
  }, [loadVersions]);

  const installed = info?.installed ?? codexVersion;
  const available = info?.available ?? null;
  const updateAvailable = info?.updateAvailable ?? false;

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Update Codex</h2>
      <ul className="mnemo-admin-chainlist">
        <li>
          <span className="mnemo-admin-chain">
            Installed · <code>@ancientpantheon/codex</code>
          </span>
          <span className="mnemo-admin-badge mnemo-admin-badge--live">v{installed}</span>
        </li>
        <li>
          <span className="mnemo-admin-chain">Latest on npm</span>
          <span
            className={`mnemo-admin-badge${updateAvailable ? "" : " mnemo-admin-badge--live"}`}
          >
            {available ? `v${available}` : info ? "unreachable" : "checking…"}
          </span>
        </li>
      </ul>
      <p className="mnemo-admin-muted">
        {available === null
          ? info
            ? "Couldn't reach npm to check for updates — you can still pull the latest."
            : "Checking npm for the latest version…"
          : updateAvailable
            ? `Update available — v${installed} → v${available}.`
            : `Up to date — running the latest published codex (v${installed}).`}
      </p>
      <button
        type="button"
        className="mnemo-admin-btn mnemo-admin-btn--primary"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy
          ? "Pulling latest codex…"
          : updateAvailable
            ? `Update to v${available}`
            : "Re-pull latest"}
      </button>
      {error ? (
        <p className="mnemo-admin-status" role="alert">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mnemo-admin-result">
          <p className="mnemo-admin-status">
            {result.ok
              ? result.changed
                ? `✓ Pull complete — codex updated ${result.versionBefore} → ${result.versionAfter}`
                : `✓ Pull complete — already on the latest codex (${result.versionAfter}); nothing to update`
              : `✗ Pull failed (exit ${result.exitCode})`}
          </p>
          <p className="mnemo-admin-muted">
            <code>{result.command}</code>
          </p>
          {result.ok && result.changed ? (
            <p className="mnemo-admin-muted">
              Reload to pick up the new build (dev). On the live site, redeploy to
              rebuild the bundle against the new version.
            </p>
          ) : null}
          <p className="mnemo-admin-muted">{result.note}</p>
          {result.stderr ? (
            <pre className="mnemo-admin-log">{result.stderr}</pre>
          ) : null}
          {result.stdout ? (
            <pre className="mnemo-admin-log">{result.stdout}</pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Network surfacing: the per-chain connection status. StoaChain is live; the Arweave
 * path is not yet verified for Mnemosyne (its connection factory is not publicly
 * exported and the flow is unproven), so it is shown as such.
 */
function NetworkStatusSection(): ReactElement {
  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Network status</h2>
      <ul className="mnemo-admin-chainlist">
        <li>
          <span className="mnemo-admin-chain">StoaChain</span>
          <span className="mnemo-admin-badge mnemo-admin-badge--live">live</span>
        </li>
        <li>
          <span className="mnemo-admin-chain">Arweave</span>
          <span className="mnemo-admin-badge">not-yet-verified</span>
        </li>
      </ul>
    </section>
  );
}

export default AdminPanel;
