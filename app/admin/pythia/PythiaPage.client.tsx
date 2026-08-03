"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

/** One half of the dual-link pair as reported by the status route. The raw per-half
 *  `secret` from `DualLinkConnector.status()` is STRIPPED server-side and never crosses
 *  the wire — only the masked, top-level `maskedSecret` does. */
type ConnectorHalfStatus =
  | { status: "pending" }
  | { status: "active"; expiresAt: number };

/**
 * `GET /api/admin/pythia-connector/status` payload. The route derives this from the
 * stored dual-link-key + the live `DualLinkConnector.status()`; `maskedSecret` is
 * already masked server-side (display verbatim — never unmask).
 */
interface ConnectorStatus {
  linked: boolean;
  standardApollo: string | null;
  smartApollo: string | null;
  standard: ConnectorHalfStatus | null;
  smart: ConnectorHalfStatus | null;
  maskedSecret: string | null;
  expiresAt: number | null;
}

const CONNECTOR_STATUS_POLL_MS = 4000;

const halfLabel = (half: ConnectorHalfStatus | null | undefined): string => {
  if (half == null) return "checking…";
  return half.status === "active" ? "active" : "pending";
};

/** Human "in Nm Ns" / "expired" countdown from a `DualLinkConnector` expiry epoch (ms). */
const expiryCountdown = (expiresAt: number | null, now: number): string => {
  if (expiresAt === null) return "—";
  const remaining = expiresAt - now;
  if (remaining <= 0) return "expired";
  const totalSeconds = Math.floor(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
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
 * Pythia connector identity: links Mnemosyne to its dual-Apollo (Standard + Smart)
 * connector-auth pair by pasting a **dual-link-key** — the two Apollo account
 * addresses joined by `|`. The pair itself is generated and activated on-chain
 * ("Activate as Pythia Key") in the Codex tab; this panel only stores the resulting
 * public key and reports live status.
 *
 * On mount, GETs the ancient-gated `/api/admin/pythia-connector/status` for the
 * derived status (linked/per-half/masked secret/expiry — the secret arrives already
 * masked server-side, never unmasked here). While linked but not yet fully active,
 * polls the same endpoint on an interval so the operator sees the ephemeral key mint
 * without a manual refresh. `Link` POSTs `{ dualLinkKey }`; `Unlink` DELETEs.
 */
function ConnectorIdentitySection(): ReactElement {
  const [status, setStatus] = useState<ConnectorStatus | null>(null);
  const [dualLinkKey, setDualLinkKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/pythia-connector/status", {
        cache: "no-store",
      });
      if (res.ok) setStatus((await res.json()) as ConnectorStatus);
    } catch {
      /* leave status as-is — the rows show "checking…" until it resolves */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // Poll while linked but not yet both-active: the ephemeral x-pythia-key is minted
  // by the codex-backed signers on the first gated request, so a freshly-linked pair
  // sits "pending" until the connector proves each half. Stop once both halves are
  // active (nothing left to watch) or when not linked at all.
  useEffect(() => {
    const bothActive =
      status?.standard?.status === "active" && status?.smart?.status === "active";
    const shouldPoll = status?.linked === true && !bothActive;

    if (shouldPoll && intervalRef.current === null) {
      intervalRef.current = setInterval(() => {
        setNow(Date.now());
        void loadStatus();
      }, CONNECTOR_STATUS_POLL_MS);
    } else if (!shouldPoll && intervalRef.current !== null) {
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

  const link = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pythia-connector", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dualLinkKey: dualLinkKey.trim() }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        // The route surfaces the SDK's specific `splitDualLinkKey` message on a
        // malformed key — show it verbatim so the operator can correct the paste.
        setError(body.error ?? `Link failed (${res.status})`);
        return;
      }
      setDualLinkKey("");
      await loadStatus();
    } catch {
      setError("Link failed — network error.");
    } finally {
      setBusy(false);
    }
  }, [dualLinkKey, loadStatus]);

  const unlink = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pythia-connector", { method: "DELETE" });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Unlink failed (${res.status})`);
        return;
      }
      await loadStatus();
    } catch {
      setError("Unlink failed — network error.");
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  const linked = status?.linked === true;

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Connector identity</h2>
      <p className="mnemo-admin-muted">
        Generate Mnemosyne&apos;s Standard + Smart Apollo pair and click{" "}
        <strong>Activate as Pythia Key</strong> in the{" "}
        <a href="/admin#codex">Codex tab</a>
        , then paste the resulting dual-link-key below. That key is two public Apollo
        account addresses joined by <code>|</code> — never a secret.
      </p>

      {linked ? (
        <>
          <ul className="mnemo-admin-chainlist">
            <li>
              <span className="mnemo-admin-chain">Standard Apollo</span>
              <span className="mnemo-admin-badge">
                {status?.standardApollo ?? "—"}
              </span>
            </li>
            <li>
              <span className="mnemo-admin-chain">Standard half</span>
              <span
                className={`mnemo-admin-badge${status?.standard?.status === "active" ? " mnemo-admin-badge--live" : ""}`}
              >
                {halfLabel(status?.standard)}
              </span>
            </li>
            <li>
              <span className="mnemo-admin-chain">Smart Apollo</span>
              <span className="mnemo-admin-badge">
                {status?.smartApollo ?? "—"}
              </span>
            </li>
            <li>
              <span className="mnemo-admin-chain">Smart half</span>
              <span
                className={`mnemo-admin-badge${status?.smart?.status === "active" ? " mnemo-admin-badge--live" : ""}`}
              >
                {halfLabel(status?.smart)}
              </span>
            </li>
            <li>
              <span className="mnemo-admin-chain">Active key</span>
              <span className="mnemo-admin-badge">
                {status?.maskedSecret ?? "not yet minted"}
              </span>
            </li>
            <li>
              <span className="mnemo-admin-chain">Expires in</span>
              <span className="mnemo-admin-badge">
                {expiryCountdown(status?.expiresAt ?? null, now)}
              </span>
            </li>
          </ul>

          <div className="mnemo-admin-row">
            <button
              type="button"
              className="mnemo-admin-btn"
              disabled={busy}
              onClick={() => void unlink()}
            >
              {busy ? "Working…" : "Unlink"}
            </button>
          </div>
        </>
      ) : (
        <div className="mnemo-admin-row">
          <input
            className="mnemo-admin-input"
            type="text"
            placeholder="standard-apollo|smart-apollo"
            value={dualLinkKey}
            onChange={(e) => setDualLinkKey(e.target.value)}
            disabled={busy}
          />
          <button
            type="button"
            className="mnemo-admin-btn mnemo-admin-btn--primary"
            disabled={busy || dualLinkKey.trim() === ""}
            onClick={() => void link()}
          >
            {busy ? "Linking…" : "Link"}
          </button>
        </div>
      )}

      {error ? (
        <p className="mnemo-admin-status" role="alert">
          {error}
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
