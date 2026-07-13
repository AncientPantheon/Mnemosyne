"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

import { AdminGate } from "../AdminGate.client";

/** One constructor row from `/api/admin/deploy` (GET). */
interface ConstructorStatus {
  key: "codex" | "khronoton";
  label: string;
  npmPackage: string;
  installed: string;
  available: string | null;
  wired: boolean;
  updateAvailable: boolean;
}

interface ConstructorsStatus {
  constructors: ConstructorStatus[];
  anyUpdateAvailable: boolean;
  deployMode: "bundle" | "dev";
}

type Phase = "idle" | "arming" | "running" | "success" | "failed";

/** Status badge for one constructor (installed + npm-latest, wired-aware). */
function ConstructorRow({ c }: { c: ConstructorStatus }): ReactElement {
  const availLabel = c.available ? `v${c.available}` : "unreachable";
  return (
    <li>
      <span className="mnemo-admin-chain">
        {c.label} · <code>{c.npmPackage}</code>
      </span>
      <span className="mnemo-admin-badges">
        <span
          className={`mnemo-admin-badge${c.wired ? " mnemo-admin-badge--live" : ""}`}
          title="Installed in this build"
        >
          {c.wired ? `v${c.installed}` : "not wired"}
        </span>
        <span className="mnemo-admin-arrow">→</span>
        <span
          className={`mnemo-admin-badge${c.updateAvailable ? "" : " mnemo-admin-badge--live"}`}
          title="Latest on npm"
        >
          {availLabel}
        </span>
      </span>
    </li>
  );
}

/**
 * Update Constructors — the single Deploy surface. One status table shows every
 * constructor (Codex is wired; Khronoton is a preview until its package ships), and
 * ONE Deploy button rebuilds the automaton. The button "comes alive" (primary,
 * enabled-with-emphasis) when any wired constructor has a newer npm version, but a
 * manual re-deploy is always allowed (e.g. to pick up code changes). Progress streams
 * live into the terminal below over SSE.
 *
 * - Live (`bundle`): the on-box host deployer does a zero-downtime blue-green rebuild.
 * - Localhost (`dev`): pulls the constructors at `@latest`; reload picks them up.
 */
function DeployPanel(): ReactElement {
  const [status, setStatus] = useState<ConstructorsStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [log, setLog] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const termRef = useRef<HTMLPreElement | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as ConstructorsStatus);
    } catch {
      /* leave null → "checking…" */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    return () => esRef.current?.close();
  }, [loadStatus]);

  // Auto-scroll the terminal as lines arrive.
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [log]);

  const openStream = useCallback(
    (id: string) => {
      esRef.current?.close();
      const es = new EventSource(`/api/admin/deploy/stream/${id}`);
      esRef.current = es;
      // Each (re)connection resends the log from offset 0 (survives a container
      // swap), so reset the buffer on open to avoid duplicated lines.
      es.onopen = () => setLog("");
      es.onmessage = (ev) => setLog((prev) => prev + ev.data + "\n");
      es.addEventListener("status", (ev) => {
        const s = (ev as MessageEvent).data as string;
        if (s === "running") setPhase("running");
      });
      es.addEventListener("done", (ev) => {
        const s = (ev as MessageEvent).data as string;
        es.close();
        setPhase(s === "success" ? "success" : "failed");
        void loadStatus();
      });
      es.onerror = () => {
        // Not terminal → the browser will auto-reconnect (e.g. mid-swap). If it's
        // actually dead the phase stays "running"; the operator can reload.
      };
    },
    [loadStatus],
  );

  const startDeploy = useCallback(async () => {
    setError(null);
    setLog("");
    setPhase("running");
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      if (!res.ok) {
        setError(`Deploy request failed (HTTP ${res.status}).`);
        setPhase("failed");
        return;
      }
      const { id } = (await res.json()) as { id: string };
      openStream(id);
    } catch {
      setError("Deploy request failed — network error.");
      setPhase("failed");
    }
  }, [openStream]);

  const isBundle = status?.deployMode === "bundle";
  const anyUpdate = status?.anyUpdateAvailable ?? false;
  const busy = phase === "running";

  const buttonLabel =
    phase === "running"
      ? "Deploying…"
      : anyUpdate
        ? "Deploy update"
        : "Re-deploy";

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Constructors</h2>
      <ul className="mnemo-admin-chainlist">
        {status ? (
          status.constructors.map((c) => <ConstructorRow key={c.key} c={c} />)
        ) : (
          <li>
            <span className="mnemo-admin-chain">Checking constructors…</span>
          </li>
        )}
      </ul>

      <p className="mnemo-admin-muted">
        {status == null
          ? "Reading installed versions and checking npm…"
          : anyUpdate
            ? "An update is available. Deploy rebuilds the automaton with the latest constructors."
            : "All wired constructors are up to date. You can still re-deploy to pick up code changes."}
      </p>
      <p className="mnemo-admin-muted">
        {isBundle
          ? "Live build — Deploy runs an on-box, zero-downtime rebuild (blue-green swap). Progress streams below; the site stays up throughout."
          : "Localhost — Deploy pulls the constructors at @latest; reload the page afterwards to pick them up."}
      </p>
      {status?.constructors.some((c) => !c.wired) ? (
        <p className="mnemo-admin-muted">
          Khronoton&apos;s engine is published but <strong>not wired</strong> yet —
          turning it on (autonomous codex-signing) is gated until all three Constructors
          are finalized. Preview its UI under <code>Mnemosyne Khronoton</code>.
        </p>
      ) : null}

      {phase === "arming" ? (
        <div className="mnemo-admin-confirm">
          <p className="mnemo-admin-status">
            Confirm: rebuild and redeploy the automaton now?
          </p>
          <div className="mnemo-admin-btnrow">
            <button
              type="button"
              className="mnemo-admin-btn mnemo-admin-btn--primary"
              onClick={() => void startDeploy()}
            >
              Yes, deploy
            </button>
            <button
              type="button"
              className="mnemo-admin-btn"
              onClick={() => setPhase("idle")}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`mnemo-admin-btn ${anyUpdate ? "mnemo-admin-btn--primary" : ""}`}
          disabled={busy}
          onClick={() => setPhase("arming")}
        >
          {buttonLabel}
        </button>
      )}

      {error ? (
        <p className="mnemo-admin-status" role="alert">
          {error}
        </p>
      ) : null}

      {phase === "running" || phase === "success" || phase === "failed" ? (
        <div className="mnemo-admin-result">
          <p className="mnemo-admin-status">
            {phase === "running"
              ? "▶ Deploy in progress…"
              : phase === "success"
                ? "✓ Deploy complete."
                : "✗ Deploy failed — see the log."}
          </p>
          <pre className="mnemo-admin-log mnemo-admin-term" ref={termRef}>
            {log || "Waiting for the deployer…"}
          </pre>
          {phase === "success" && !isBundle ? (
            <p className="mnemo-admin-muted">Reload the page to run the new build.</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function UpdateConstructorsPage(): ReactElement {
  return (
    <AdminGate title="Update Constructors">
      <DeployPanel />
    </AdminGate>
  );
}

export default UpdateConstructorsPage;
