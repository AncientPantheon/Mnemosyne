"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";

/** `/api/admin/security/rotate-master-key` GET payload (no secrets). */
interface SecurityStatus {
  configured: boolean;
  provisioned: boolean;
  initialized: boolean;
}

/**
 * Codex Security: master-key status + rotation for Mnemosyne's sealed operator codex.
 * On mount, GETs the ancient-gated `/api/admin/security/rotate-master-key` for the
 * status rows (never any key material). Rotation is guarded by a required
 * acknowledgement checkbox — a rotation without a recoverable backup of the CURRENT
 * key is irreversible — and POSTs `{ acknowledgedExport: true }`, re-sealing the whole
 * codex under a fresh server-generated key.
 */
function SecuritySection(): ReactElement {
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/security/rotate-master-key", {
        cache: "no-store",
      });
      if (res.ok) setStatus((await res.json()) as SecurityStatus);
    } catch {
      /* leave status null → the rows show "checking…" */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const rotate = useCallback(async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/security/rotate-master-key", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ acknowledgedExport: true }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        rotatedFiles?: number;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setError(body.error ?? `Rotation failed (${res.status})`);
        return;
      }
      setResult(
        `✓ Rotated — re-sealed ${body.rotatedFiles ?? 0} codex ${
          body.rotatedFiles === 1 ? "file" : "files"
        } under a new key.`,
      );
      setAcknowledged(false);
      void loadStatus();
    } catch {
      setError("Rotation failed — network error.");
    } finally {
      setBusy(false);
    }
  }, [loadStatus]);

  const statusLabel = (
    ready: boolean | undefined,
    yes: string,
    no: string,
  ): string => (status === null ? "checking…" : ready ? yes : no);

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Codex Security</h2>
      <p className="mnemo-admin-muted">
        The master key seals Mnemosyne&apos;s operator codex at rest. Rotation
        re-seals the entire vault under a fresh key in one atomic step, so it never
        breaks the codex — but a rotation without a recoverable backup of the{" "}
        <strong>current</strong> key is irreversible.
      </p>

      <ul className="mnemo-admin-chainlist">
        <li>
          <span className="mnemo-admin-chain">Master key</span>
          <span
            className={`mnemo-admin-badge${status?.configured ? " mnemo-admin-badge--live" : ""}`}
          >
            {statusLabel(status?.configured, "configured", "not configured")}
          </span>
        </li>
        <li>
          <span className="mnemo-admin-chain">Codex</span>
          <span
            className={`mnemo-admin-badge${status?.provisioned ? " mnemo-admin-badge--live" : ""}`}
          >
            {statusLabel(status?.provisioned, "provisioned", "empty")}
          </span>
        </li>
      </ul>

      <p className="mnemo-admin-muted">
        <label>
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={busy}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />{" "}
          I hold a recoverable backup of the current master key (rotation is
          irreversible).
        </label>
      </p>

      <div className="mnemo-admin-row">
        <button
          type="button"
          className="mnemo-admin-btn mnemo-admin-btn--primary"
          disabled={busy || !acknowledged}
          onClick={() => void rotate()}
        >
          {busy ? "Rotating…" : "Rotate master key"}
        </button>
      </div>

      {error ? (
        <p className="mnemo-admin-status" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <p className="mnemo-admin-status">{result}</p> : null}
    </section>
  );
}

export function SecurityPage(): ReactElement {
  return <SecuritySection />;
}

export default SecurityPage;
