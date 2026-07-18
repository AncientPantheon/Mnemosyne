"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";

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

export function PythiaPage(): ReactElement {
  return <PythiaConnectorSection />;
}

export default PythiaPage;
