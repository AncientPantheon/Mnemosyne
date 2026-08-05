"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";

/**
 * Network surfacing: the per-chain connection status + the break-glass **Network
 * Fallback** control (`HANDOFF-mnemosyne-network-fallback.md`). By default all
 * chain traffic — reads, simulations, sends, and the autonomous Khronoton fires —
 * flows through Pythia (metered). An ancient can flip to a direct Stoa node
 * (UNMETERED) if Pythia is unreachable. Admin-gated (this pane only mounts inside
 * the admin shell); the toggle governs BOTH lanes (read + send) + Khronoton.
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

type Mode = "pythia" | "direct-node";

const NODE_PRESETS: { label: string; url: string }[] = [
  { label: "node2 (default)", url: "https://node2.stoachain.com" },
  { label: "node1", url: "https://node1.stoachain.com" },
];

/** The break-glass Pythia ⇆ direct-node toggle + node target + test. */
function NetworkFallbackPanel(): ReactElement {
  const [mode, setMode] = useState<Mode>("pythia");
  const [nodeUrl, setNodeUrl] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/admin/network-fallback", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { transportFallback?: Mode; nodeUrl?: string } | null) => {
        if (!live || !body) return;
        setMode(body.transportFallback === "direct-node" ? "direct-node" : "pythia");
        setNodeUrl(typeof body.nodeUrl === "string" ? body.nodeUrl : "");
        setLoaded(true);
      })
      .catch(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  const save = useCallback(async (next: { transportFallback?: Mode; nodeUrl?: string }) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/admin/network-fallback", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        error?: string;
        transportFallback?: Mode;
        nodeUrl?: string;
      };
      if (!res.ok || !body.ok) {
        setStatus(body.error ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      if (body.transportFallback) setMode(body.transportFallback);
      if (typeof body.nodeUrl === "string") setNodeUrl(body.nodeUrl);
      setStatus(
        body.transportFallback === "direct-node"
          ? "Saved — traffic now BYPASSES Pythia (unmetered)."
          : "Saved — traffic routes through Pythia (metered).",
      );
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const testConnection = useCallback(async () => {
    setTestResult("Testing…");
    try {
      const res = await fetch("/api/admin/network-fallback/test", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeUrl }),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        status?: number;
        nodeVersion?: string;
        error?: string;
      };
      setTestResult(
        body.ok
          ? `Reachable ✓ (HTTP ${body.status}${body.nodeVersion ? `, ${body.nodeVersion}` : ""})`
          : `Unreachable ✗ ${body.error ?? ""}`,
      );
    } catch (err) {
      setTestResult(`Unreachable ✗ ${err instanceof Error ? err.message : ""}`);
    }
  }, [nodeUrl]);

  const isDirect = mode === "direct-node";

  return (
    <section className="mnemo-admin-card">
      <h2 className="mnemo-admin-h2">Network Fallback (break-glass)</h2>
      <p className="mnemo-admin-muted">
        All chain traffic — reads, sends, and Mnemosyne&rsquo;s autonomous Khronoton fires — routes
        through Pythia by default (metered). Flip to a direct Stoa node only if Pythia is unreachable.
      </p>

      {isDirect ? (
        <p className="mnemo-fallback-warn" role="alert">
          ⚠ Direct-node is ACTIVE — traffic bypasses Pythia and is <strong>UNMETERED</strong>. Return to
          Pythia as soon as it is healthy.
        </p>
      ) : null}

      <div className="mnemo-admin-row" role="radiogroup" aria-label="Transport mode">
        <button
          type="button"
          role="radio"
          aria-checked={!isDirect}
          disabled={busy || !loaded}
          className={`mnemo-admin-btn${!isDirect ? " mnemo-admin-btn--primary" : ""}`}
          onClick={() => save({ transportFallback: "pythia" })}
        >
          Pythia (default · metered)
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={isDirect}
          disabled={busy || !loaded}
          className={`mnemo-admin-btn${isDirect ? " mnemo-fallback-btn--danger" : ""}`}
          onClick={() => save({ transportFallback: "direct-node" })}
        >
          Direct Node (break-glass · unmetered)
        </button>
      </div>

      <p className="mnemo-admin-status">
        Active transport:{" "}
        <strong>{isDirect ? `Direct node → ${nodeUrl || "(no node set)"}` : "Pythia gateway"}</strong>
      </p>

      <h3 className="mnemo-admin-h" style={{ marginTop: "1rem" }}>
        Fallback node
      </h3>
      <div className="mnemo-admin-row">
        {NODE_PRESETS.map((p) => (
          <button
            key={p.url}
            type="button"
            disabled={busy}
            className={`mnemo-admin-btn${nodeUrl === p.url ? " mnemo-admin-btn--primary" : ""}`}
            onClick={() => setNodeUrl(p.url)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="mnemo-admin-row">
        <input
          className="mnemo-admin-input"
          type="url"
          placeholder="https://your-stoa-node.example"
          value={nodeUrl}
          onChange={(e) => setNodeUrl(e.target.value)}
          aria-label="Fallback node URL"
        />
        <button
          type="button"
          className="mnemo-admin-btn"
          disabled={busy || !nodeUrl}
          onClick={testConnection}
        >
          Test Connection
        </button>
        <button
          type="button"
          className="mnemo-admin-btn mnemo-admin-btn--primary"
          disabled={busy || !nodeUrl}
          onClick={() => save({ nodeUrl })}
        >
          Save node
        </button>
      </div>

      {testResult ? <p className="mnemo-admin-status">{testResult}</p> : null}
      {status ? <p className="mnemo-admin-status">{status}</p> : null}
    </section>
  );
}

export function NetworkPage(): ReactElement {
  return (
    <>
      <NetworkStatusSection />
      <NetworkFallbackPanel />
    </>
  );
}

export default NetworkPage;
