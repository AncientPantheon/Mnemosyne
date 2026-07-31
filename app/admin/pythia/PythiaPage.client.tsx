"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

/** `GET /api/admin/pythia-connector/status` payload — mirrors `ConnectorStatus`. */
interface ConnectorStatus {
  stage:
    | "idle"
    | "ensuring-identity"
    | "deploying-standard"
    | "deploying-smart"
    | "linking"
    | "proving-standard"
    | "proving-smart"
    | "success"
    | "failed";
  standardApollo: string | null;
  smartApollo: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  lastError: string | null;
}

const CONNECTOR_STATUS_POLL_MS = 4000;

const stageLabel = (stage: ConnectorStatus["stage"] | undefined): string => {
  switch (stage) {
    case undefined:
      return "checking…";
    case "idle":
      return "not started";
    case "success":
      return "active";
    case "failed":
      return "failed";
    default:
      return `in progress — ${stage}`;
  }
};

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

/**
 * Pythia connector identity: onboards Mnemosyne's dual-Apollo (Standard `₱` + Smart
 * `Π`) connector-auth identity — an irreversible, real-cost (STOA) on-chain action.
 * On mount, GETs the ancient-gated `/api/admin/pythia-connector/status` for the
 * current stage (never any secret material). While a stage is in progress (not
 * idle/success/failed), polls the same endpoint on an interval so the operator sees
 * live progress without a manual refresh. The trigger is guarded by a required
 * acknowledgement checkbox and POSTs `{ acknowledgedSpend: true }`.
 */
function ConnectorIdentitySection(): ReactElement {
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pythia-connector/status", {
        cache: "no-store",
      });
      if (res.ok) setStatus((await res.json()) as ConnectorStatus);
    } catch {
      /* leave status as-is — the stage row shows "checking…" until it resolves */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const inProgress =
      status !== null &&
      status.stage !== "idle" &&
      status.stage !== "success" &&
      status.stage !== "failed";

    if (inProgress && intervalRef.current === null) {
      intervalRef.current = setInterval(() => void loadStatus(), CONNECTOR_STATUS_POLL_MS);
    } else if (!inProgress && intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [status, loadStatus]);

  const startOnboarding = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pythia-connector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acknowledgedSpend: true }),
      });
      const body = (await res.json()) as { status?: ConnectorStatus; error?: string };
      if (!res.ok) {
        setError(body.error ?? `Onboarding failed to start (${res.status})`);
        return;
      }
      if (body.status) setStatus(body.status);
    } catch {
      setError("Onboarding failed to start — network error.");
    } finally {
      setBusy(false);
    }
  }, []);

  // `busy` only spans the fire-and-forget initial POST (it resolves as soon as the
  // background job is accepted with a 202) — the job itself can then run for minutes
  // through stages like "deploying-standard"/"linking"/"proving-smart". The trigger
  // must stay disabled for that whole window too, not just while `busy` is true, or a
  // second click during a legitimate in-progress run hits the backend's 409 guard.
  const activeOrRunning =
    status !== null && status.stage !== "idle" && status.stage !== "failed";

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Connector identity</h2>
      <p className="mnemo-admin-muted">
        Onboards Mnemosyne&apos;s own dual-Apollo (Standard + Smart) connector-auth
        identity with Pythia: deploys both Apollo accounts on-chain, links them, and
        proves ownership. This spends real STOA and cannot be undone.
      </p>

      <ul className="mnemo-admin-chainlist">
        <li>
          <span className="mnemo-admin-chain">Stage</span>
          <span
            className={`mnemo-admin-badge${status?.stage === "success" ? " mnemo-admin-badge--live" : ""}`}
          >
            {stageLabel(status?.stage)}
          </span>
        </li>
        {status?.standardApollo ? (
          <li>
            <span className="mnemo-admin-chain">Standard Apollo</span>
            <span className="mnemo-admin-badge">{status.standardApollo}</span>
          </li>
        ) : null}
        {status?.smartApollo ? (
          <li>
            <span className="mnemo-admin-chain">Smart Apollo</span>
            <span className="mnemo-admin-badge">{status.smartApollo}</span>
          </li>
        ) : null}
      </ul>

      <p className="mnemo-admin-muted">
        <label>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />{" "}
          I understand this deploys two Apollo accounts on-chain and spends real STOA
          (irreversible).
        </label>
      </p>

      <div className="mnemo-admin-row">
        <button
          type="button"
          className="mnemo-admin-btn mnemo-admin-btn--primary"
          disabled={busy || !acknowledged || activeOrRunning}
          onClick={() => void startOnboarding()}
        >
          {busy
            ? "Starting…"
            : activeOrRunning
              ? status?.stage === "success"
                ? "Already onboarded"
                : "In progress…"
              : "Start onboarding"}
        </button>
      </div>

      {error ? (
        <p className="mnemo-admin-status" role="alert">
          {error}
        </p>
      ) : null}
      {status?.lastError ? (
        <p className="mnemo-admin-status" role="alert">
          {status.lastError}
        </p>
      ) : null}
    </section>
  );
}

export function PythiaPage(): ReactElement {
  return (
    <>
      <PythiaConnectorSection />
      <ConnectorIdentitySection />
    </>
  );
}

export default PythiaPage;
