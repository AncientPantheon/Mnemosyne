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

/** One half's diagnostic state — a distinct chip per the Pantheonic connector
 *  panel spec (organs/06 §"Consumer panel"): `active` (green) / `pending`
 *  (cyan) / `checking` while status is still loading. */
type HalfState = "checking" | "pending" | "active";

const halfState = (half: ConnectorHalfStatus | null | undefined): HalfState =>
  half == null ? "checking" : half.status === "active" ? "active" : "pending";

const HALF_CHIP: Record<HalfState, string> = {
  checking: "mnemo-chip mnemo-chip--pending",
  pending: "mnemo-chip mnemo-chip--pending",
  active: "mnemo-chip mnemo-chip--active",
};
const HALF_LABEL: Record<HalfState, string> = {
  checking: "checking…",
  pending: "pending",
  active: "active",
};

/** `Xh Ym Zs` (dropping the hours when < 1h) / `expired` — the depleting text
 *  countdown beside the timer bar. `expires in` prefix lives in the markup. */
const expiryCountdown = (expiresAt: number | null, now: number): string => {
  if (expiresAt === null) return "—";
  const remaining = expiresAt - now;
  if (remaining <= 0) return "expired";
  const s = Math.floor(remaining / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
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

  // Poll the status route the whole time a pair is linked. Each poll drives a
  // connector tick server-side, which (a) converges a freshly-pasted pair from
  // pending → active (prove → Pythia's resolver links → prove → secret) and
  // (b) picks up each ~expiry secret ROTATION, so the masked key + bar refresh
  // rather than freezing on a stale value. Stopped only when not linked.
  useEffect(() => {
    const shouldPoll = status?.linked === true;
    if (shouldPoll && intervalRef.current === null) {
      intervalRef.current = setInterval(() => void loadStatus(), CONNECTOR_STATUS_POLL_MS);
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
  }, [status?.linked, loadStatus]);

  // A 1s tick drives the countdown text + the depleting bar smoothly, decoupled
  // from the 4s data poll.
  useEffect(() => {
    if (status?.linked !== true) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [status?.linked]);

  // The timer bar needs a TOTAL lifetime, but the status route only exposes
  // `expiresAt` (the server owns the TTL and never sends it). Track the MAX
  // remaining ever observed for the CURRENT masked secret: a fresh mint's first
  // observation ≈ full TTL, so the bar starts full and depletes; a rotation
  // (new masked secret) resets it. Robust to any server TTL, no server change.
  const barTotalRef = useRef<{ secret: string; totalMs: number } | null>(null);
  useEffect(() => {
    if (!status?.maskedSecret || status.expiresAt == null) {
      barTotalRef.current = null;
      return;
    }
    const remaining = Math.max(0, status.expiresAt - Date.now());
    const cur = barTotalRef.current;
    barTotalRef.current =
      cur && cur.secret === status.maskedSecret
        ? { secret: status.maskedSecret, totalMs: Math.max(cur.totalMs, remaining) }
        : { secret: status.maskedSecret, totalMs: remaining };
  }, [status?.maskedSecret, status?.expiresAt]);

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

  // Depleting bar fill: remaining / max-observed-total for the current secret.
  const remainingMs =
    status?.expiresAt != null ? Math.max(0, status.expiresAt - now) : 0;
  const totalMs = barTotalRef.current?.totalMs ?? 0;
  const barPct = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMs / totalMs) * 100)) : 0;

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
          {/* One framed "zone" per Apollo half — label + state chip on their own
              top line, the 162-char address ellipsis-truncated on its own line so
              it never bleeds out of the box (mirrors Pythia's Self Connector). */}
          <div className="mnemo-acct-card">
            <div className="mnemo-acct-card-top">
              <span className="mnemo-acct-card-label">Standard</span>
              <span className={HALF_CHIP[halfState(status?.standard)]}>
                {HALF_LABEL[halfState(status?.standard)]}
              </span>
            </div>
            <div className="mnemo-acct-card-addr" title={status?.standardApollo ?? undefined}>
              {status?.standardApollo ?? "—"}
            </div>
          </div>

          <div className="mnemo-acct-card">
            <div className="mnemo-acct-card-top">
              <span className="mnemo-acct-card-label">Smart</span>
              <span className={HALF_CHIP[halfState(status?.smart)]}>
                {HALF_LABEL[halfState(status?.smart)]}
              </span>
            </div>
            <div className="mnemo-acct-card-addr" title={status?.smartApollo ?? undefined}>
              {status?.smartApollo ?? "—"}
            </div>
          </div>

          {/* ONE consolidated ephemeral-key card — the single masked x-pythia-key
              the whole pair uses, a depleting timer bar, and the text countdown.
              Shown only once a secret has been minted; a still-proving pair shows
              the note below instead. */}
          {status?.maskedSecret ? (
            <div className="mnemo-ttl-card">
              <code className="mnemo-ttl-key">{status.maskedSecret}</code>
              <div className="mnemo-ttl-bar">
                <div
                  className="mnemo-ttl-bar-fill"
                  style={{ width: `${barPct}%` }}
                  aria-hidden="true"
                />
              </div>
              <span className="mnemo-ttl-expiry">
                expires in {expiryCountdown(status.expiresAt, now)}
              </span>
            </div>
          ) : (
            <p className="mnemo-admin-muted">
              Proving ownership with Pythia — the ephemeral key is minted once both
              halves are verified and the link is active on-chain.
            </p>
          )}

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
