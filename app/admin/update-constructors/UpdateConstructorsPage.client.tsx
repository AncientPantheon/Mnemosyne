"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";

import { AdminGate } from "../AdminGate.client";

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

/** `/api/admin/codex-version` payload. */
interface CodexVersionInfo {
  installed: string;
  available: string | null;
  updateAvailable: boolean;
  /** "bundle" = live standalone (update via redeploy); "dev" = localhost (pull works). */
  deployMode?: "bundle" | "dev";
}

/** `/api/admin/khronoton-version` payload. */
interface KhronotonVersionInfo {
  installed: string;
  available: string | null;
  updateAvailable: boolean;
  /** false until the Khronoton package is wired into Mnemosyne. */
  wired: boolean;
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
  // On the live standalone bundle, codex is compiled in — an in-app pull can't
  // change the running app, so the update path is a redeploy. Only offer the real
  // pull on localhost (dev).
  const isBundle = info?.deployMode === "bundle";

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
            ? "Couldn't reach npm to check for updates."
            : "Checking npm for the latest version…"
          : updateAvailable
            ? `Update available — v${installed} → v${available}.`
            : `Up to date — running the latest published codex (v${installed}).`}
      </p>
      {isBundle ? (
        <p className="mnemo-admin-muted">
          This is the live build — codex is compiled into the deployed bundle, so it
          updates on <strong>redeploy</strong> (push to <code>main</code>; CI rebuilds
          against the latest npm version), not from a button here. The versions above
          tell you when a redeploy is worth it.
        </p>
      ) : (
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
      )}
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
 * Update Khronoton (SCAFFOLD): the same installed-vs-available shape as
 * {@link UpdateCodexSection}, but for the future `@ancientpantheon/khronoton-core`
 * automaton engine. Khronoton is NOT wired into Mnemosyne yet, so `/api/admin/
 * khronoton-version` reports `installed: "not wired"` and `wired: false`; we still
 * show the latest-on-npm version as a preview so the operator can see the package
 * is taking shape. The Update button stays disabled until the package is wired in.
 */
function UpdateKhronotonSection(): ReactElement {
  const [info, setInfo] = useState<KhronotonVersionInfo | null>(null);

  const loadVersions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/khronoton-version", { cache: "no-store" });
      if (res.ok) setInfo((await res.json()) as KhronotonVersionInfo);
    } catch {
      /* leave info null → the "checking…" placeholder stays */
    }
  }, []);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const installed = info?.installed ?? "not wired";
  const available = info?.available ?? null;

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Update Khronoton</h2>
      <ul className="mnemo-admin-chainlist">
        <li>
          <span className="mnemo-admin-chain">
            Installed · <code>@ancientpantheon/khronoton-core</code>
          </span>
          <span className="mnemo-admin-badge">{installed}</span>
        </li>
        <li>
          <span className="mnemo-admin-chain">Latest on npm</span>
          <span className="mnemo-admin-badge mnemo-admin-badge--live">
            {available ? `v${available}` : info ? "unreachable" : "checking…"}
          </span>
        </li>
      </ul>
      <p className="mnemo-admin-muted">
        The Khronoton engine isn&apos;t wired into Mnemosyne yet — the{" "}
        <code>@ancientpantheon/khronoton-core</code> package is being built into a
        plug-and-play automaton engine (see{" "}
        <code>docs/handoffs/03-khronoton-automaton-package.md</code>). This panel will
        pull + wire it once the package is ready.
      </p>
      <button
        type="button"
        className="mnemo-admin-btn mnemo-admin-btn--primary"
        disabled
        title="Khronoton not yet wired"
      >
        Update Khronoton
      </button>
    </section>
  );
}

export function UpdateConstructorsPage({
  codexVersion,
}: {
  codexVersion: string;
}): ReactElement {
  return (
    <AdminGate title="Update Constructors">
      <UpdateCodexSection codexVersion={codexVersion} />
      <UpdateKhronotonSection />
    </AdminGate>
  );
}

export default UpdateConstructorsPage;
