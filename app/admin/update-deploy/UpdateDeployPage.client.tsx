"use client";

import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";

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

/** The automaton app itself (running build vs the version on the deploy branch). */
interface AppStatus {
  installed: string;
  available: string | null;
  updateAvailable: boolean;
}

interface ConstructorsStatus {
  mnemosyne: AppStatus;
  constructors: ConstructorStatus[];
  anyUpdateAvailable: boolean;
  deployMode: "bundle" | "dev";
}

/**
 * The newest non-terminal deploy, from `/api/admin/deploy/status`. `startedAt` is the
 * deploy's REAL start (the log file's birth time), so a browser that opens mid-deploy
 * shows true elapsed time rather than time-since-I-opened-the-page.
 */
interface ActiveDeploy {
  id: string;
  status: string;
  startedAt: string;
}

/** `/api/admin/deploy/status` (GET) — the on-box identity + the active deploy. */
interface BoxStatus {
  mode: "bundle" | "dev";
  color: string | null;
  port: string | null;
  container: string | null;
  version: string;
  active: ActiveDeploy | null;
}

type Phase = "idle" | "running" | "success" | "failed";

/**
 * BuildKit prints `Step 12/35` as it walks the Dockerfile. This is REAL progress
 * scraped out of the stream — never synthesized — and the LATEST match wins.
 */
const STEP_RE = /Step\s+(\d+)\/(\d+)/g;

/**
 * More than this long with no chunk = the display goes stalled. Both deployers (the
 * host script and the dev fallback) heartbeat every 6s, so 20s is ≥3× the heartbeat
 * interval — ordinary scheduling jitter can never produce a false alarm.
 */
const STALL_THRESHOLD_MS = 20_000;

/** Seconds of "…now live" countdown before the post-success auto-reload. */
const RELOAD_COUNTDOWN_SECONDS = 3;

/** `8m18s` / `47s` — the deploy-panel elapsed format. */
function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m${String(secs).padStart(2, "0")}s` : `${secs}s`;
}

/** Any box-identity field the deployer did not inject renders as "unknown", never a crash. */
function orUnknown(value: string | null | undefined): string {
  return value == null || value === "" ? "unknown" : value;
}

/** One labelled line of the on-box deploy readout. */
function ReadoutLine({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <p className="mnemo-deploy-line">
      <span className="mnemo-deploy-key">{label}</span>
      <span className="mnemo-deploy-val">{value}</span>
    </p>
  );
}

/**
 * One installed→available version row (used for both the Mnemosyne app and each
 * constructor). `wired: false` shows "not wired" instead of an installed version;
 * `installedTitle`/`availableTitle` tune the hover text per source (build vs npm/repo).
 */
function VersionRow({
  label,
  subtitle,
  installed,
  available,
  wired,
  updateAvailable,
  installedTitle,
  availableTitle,
}: {
  label: string;
  subtitle: ReactElement | string;
  installed: string;
  available: string | null;
  wired: boolean;
  updateAvailable: boolean;
  installedTitle: string;
  availableTitle: string;
}): ReactElement {
  const availLabel = available ? `v${available}` : "unreachable";
  // A row is "current" only when the probe actually answered. An unreachable probe
  // (available === null) keeps the arrow + "unreachable", so a dead registry can
  // never masquerade as a healthy, up-to-date package.
  const isCurrent = available !== null && !updateAvailable;
  return (
    <li>
      <span className="mnemo-admin-chain">
        {label} · {typeof subtitle === "string" ? <code>{subtitle}</code> : subtitle}
      </span>
      <span className="mnemo-admin-badges">
        <span
          className={`mnemo-admin-badge${wired ? " mnemo-admin-badge--live" : ""}`}
          title={installedTitle}
        >
          {wired ? `v${installed}` : "not wired"}
        </span>
        {isCurrent ? (
          <span className="mnemo-admin-badge mnemo-admin-badge--ok" title={availableTitle}>
            up to date
          </span>
        ) : (
          <>
            <span className="mnemo-admin-arrow">→</span>
            <span
              className={`mnemo-admin-badge${updateAvailable ? "" : " mnemo-admin-badge--live"}`}
              title={availableTitle}
            >
              {availLabel}
            </span>
          </>
        )}
      </span>
    </li>
  );
}

/**
 * Update & Deploy — the single update-status + Deploy surface. Two grouped version
 * tables — the automaton app itself, then every constructor (Codex, Khronoton) — the
 * on-box deploy readout (which color is live, on which loopback port, in which
 * container), and ONE Deploy button that rebuilds the automaton. The button "comes
 * alive" (primary, enabled-with-emphasis) when the app or any wired constructor has a
 * newer version, but a manual re-deploy is always allowed (e.g. to pick up code
 * changes). Progress streams live into the terminal below over SSE, under a progress
 * block that must keep MOVING for as long as the deploy is alive: chip, real step
 * counter, ticking timer and a looping heartbeat animation the stall watchdog can stop.
 *
 * - Live (`bundle`): the on-box host deployer does a zero-downtime blue-green rebuild.
 * - Localhost (`dev`): pulls the constructors at `@latest`; the reload picks them up.
 */
function DeployPanel(): ReactElement {
  const [status, setStatus] = useState<ConstructorsStatus | null>(null);
  const [box, setBox] = useState<BoxStatus | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [arming, setArming] = useState(false);
  const [log, setLog] = useState<string>("");
  const [step, setStep] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stallSeconds, setStallSeconds] = useState(0);
  const [reloadIn, setReloadIn] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const termRef = useRef<HTMLPreElement | null>(null);
  // One stream at a time (the auto-attach guard), the deploy's real start, and the
  // moment the last chunk landed — all refs, because the SSE callbacks close over
  // stale state otherwise.
  const attachedRef = useRef(false);
  const startedAtRef = useRef<number>(Date.now());
  const lastChunkAtRef = useRef<number>(Date.now());

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/deploy", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as ConstructorsStatus);
    } catch {
      /* leave null → "checking…" */
    }
  }, []);

  const loadBox = useCallback(async (): Promise<BoxStatus | null> => {
    try {
      const res = await fetch("/api/admin/deploy/status", { cache: "no-store" });
      if (!res.ok) return null;
      const data = (await res.json()) as BoxStatus;
      setBox(data);
      return data;
    } catch {
      return null; /* leave null → every field reads "unknown" */
    }
  }, []);

  // Auto-scroll the terminal as lines arrive.
  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [log]);

  // The 1s tick drives BOTH the elapsed clock and the stall watchdog. It is entirely
  // client-driven, so the timer keeps moving even when the network goes quiet — that
  // alone tells the operator the page is alive. Cleared when the deploy ends (the
  // phase leaves "running") and on unmount.
  useEffect(() => {
    if (phase !== "running") return;
    const tick = () => {
      const now = Date.now();
      setElapsedMs(now - startedAtRef.current);
      const silentFor = now - lastChunkAtRef.current;
      setStallSeconds(silentFor > STALL_THRESHOLD_MS ? Math.floor(silentFor / 1000) : 0);
    };
    tick();
    const handle = window.setInterval(tick, 1000);
    return () => window.clearInterval(handle);
  }, [phase]);

  // The post-success countdown: 3 → 2 → 1 → reload. Armed only by a successful deploy
  // (see the `done` handler), in BOTH modes — bundle lands on the new container, dev
  // picks up the freshly pulled constructor UIs.
  useEffect(() => {
    if (reloadIn == null) return;
    if (reloadIn <= 0) {
      window.location.reload();
      return;
    }
    const handle = window.setTimeout(() => setReloadIn(reloadIn - 1), 1000);
    return () => window.clearTimeout(handle);
  }, [reloadIn]);

  const openStream = useCallback(
    (id: string, startedAtMs: number) => {
      // Auto-attach and a click can race (a status poll resolving while a POST is in
      // flight); a second EventSource on the same log would replay the whole file into
      // the terminal again. One stream at a time.
      if (attachedRef.current) return;
      attachedRef.current = true;
      esRef.current?.close();
      startedAtRef.current = startedAtMs;
      lastChunkAtRef.current = Date.now();
      setElapsedMs(Date.now() - startedAtMs);
      setStallSeconds(0);
      const es = new EventSource(`/api/admin/deploy/stream/${id}`);
      esRef.current = es;
      // Each (re)connection resends the log from offset 0 (survives a container
      // swap), so reset the buffer on open to avoid duplicated lines.
      es.onopen = () => setLog("");
      es.onmessage = (ev) => {
        const chunk = ev.data as string;
        // Any chunk — build output or the deployer's 6s heartbeat — clears the stall.
        lastChunkAtRef.current = Date.now();
        setStallSeconds(0);
        setLog((prev) => prev + chunk + "\n");
        const matches = [...chunk.matchAll(STEP_RE)];
        if (matches.length > 0) {
          const latest = matches[matches.length - 1];
          setStep(`Step ${latest[1]}/${latest[2]}`);
        }
      };
      es.addEventListener("status", (ev) => {
        const s = (ev as MessageEvent).data as string;
        if (s === "running") setPhase("running");
      });
      es.addEventListener("done", (ev) => {
        const s = (ev as MessageEvent).data as string;
        es.close();
        attachedRef.current = false;
        void loadStatus();
        void loadBox();
        if (s === "success") {
          setPhase("success");
          // The new build already serves — count down, then reload, so the operator
          // never has to hit refresh to land on it.
          setReloadIn(RELOAD_COUNTDOWN_SECONDS);
        } else {
          // A failed deploy stays on screen with its log. Never reload.
          setPhase("failed");
        }
      });
      es.onerror = () => {
        // Not terminal → the browser will auto-reconnect (e.g. mid-swap). If it's
        // actually dead the phase stays "running" and the watchdog says so.
      };
    },
    [loadStatus, loadBox],
  );

  useEffect(() => {
    void loadStatus();
    void (async () => {
      const data = await loadBox();
      // Auto-attach: a deploy triggered by another operator, by an agent dropping a
      // spool request, or by a previous session is still ours to display — timed from
      // its real start, not from now.
      if (data?.active) {
        setPhase("running");
        openStream(data.active.id, Date.parse(data.active.startedAt));
      }
    })();
    return () => {
      esRef.current?.close();
      attachedRef.current = false;
    };
  }, [loadStatus, loadBox, openStream]);

  const startDeploy = useCallback(async () => {
    setError(null);
    setLog("");
    setStep(null);
    setArming(false);
    setPhase("running");
    startedAtRef.current = Date.now();
    lastChunkAtRef.current = Date.now();
    setElapsedMs(0);
    setStallSeconds(0);
    try {
      const res = await fetch("/api/admin/deploy", { method: "POST" });
      if (!res.ok) {
        setError(`Deploy request failed (HTTP ${res.status}).`);
        setPhase("failed");
        return;
      }
      const { id } = (await res.json()) as { id: string };
      openStream(id, startedAtRef.current);
    } catch {
      setError("Deploy request failed — network error.");
      setPhase("failed");
    }
  }, [openStream]);

  const mode = box?.mode ?? status?.deployMode ?? null;
  const isBundle = mode === "bundle";
  const anyUpdate = status?.anyUpdateAvailable ?? false;
  const busy = phase === "running";
  const stalled = phase === "running" && stallSeconds > 0;
  const showProgress = phase !== "idle";
  // The muncher runs while the deploy runs, freezes red on a stall, parks at the end
  // when the deploy is over.
  const pacState = stalled ? " is-stalled" : phase === "running" ? "" : " is-done";

  const buttonLabel =
    phase === "running" ? "Deploying…" : anyUpdate ? "Deploy update" : "Re-deploy";

  return (
    <section className="mnemo-admin-card">
      <div className="mnemo-admin-group">
        <h2 className="mnemo-admin-h2">Mnemosyne</h2>
        <ul className="mnemo-admin-chainlist">
          {status ? (
            <VersionRow
              label="Mnemosyne"
              subtitle={<em>the automaton</em>}
              installed={status.mnemosyne.installed}
              available={status.mnemosyne.available}
              wired
              updateAvailable={status.mnemosyne.updateAvailable}
              installedTitle="Running build (this container)"
              availableTitle="Latest on the deploy branch (main)"
            />
          ) : (
            <li>
              <span className="mnemo-admin-chain">Checking version…</span>
            </li>
          )}
        </ul>
      </div>

      <div className="mnemo-admin-group">
        <h2 className="mnemo-admin-h2">Constructors</h2>
        <ul className="mnemo-admin-chainlist">
          {status ? (
            status.constructors.map((c) => (
              <VersionRow
                key={c.key}
                label={c.label}
                subtitle={c.npmPackage}
                installed={c.installed}
                available={c.available}
                wired={c.wired}
                updateAvailable={c.updateAvailable}
                installedTitle="Installed in this build"
                availableTitle="Latest on npm"
              />
            ))
          ) : (
            <li>
              <span className="mnemo-admin-chain">Checking constructors…</span>
            </li>
          )}
        </ul>
      </div>

      <p className="mnemo-admin-muted">
        {status == null
          ? "Reading installed versions and checking for updates…"
          : anyUpdate
            ? "An update is available. Deploy rebuilds the automaton from the latest code + constructors."
            : "Mnemosyne and its wired constructors are up to date. You can still re-deploy to pick up code changes."}
      </p>

      {/* On-box deploy readout — blue-green incidents are debugged by knowing which
          color is live on which loopback port, without an SSH session. */}
      <div className="mnemo-admin-group">
        <h2 className="mnemo-admin-h2">On-box deploy</h2>
        <ReadoutLine label="Mode" value={orUnknown(mode)} />
        <ReadoutLine label="Live color" value={orUnknown(box?.color)} />
        <ReadoutLine
          label="Loopback port"
          value={box?.port ? `127.0.0.1:${box.port}` : "unknown"}
        />
        <ReadoutLine label="Container" value={orUnknown(box?.container)} />
        <ReadoutLine
          label="Version"
          value={box?.version ? `v${box.version}` : "unknown"}
        />
        <p className="mnemo-admin-muted">
          {isBundle
            ? "Blue binds 127.0.0.1:3005 and green binds 127.0.0.1:3006; a deploy builds the idle color, health-checks it, then flips nginx onto it — the public ports (80/443, terminated by nginx) never change."
            : "dev mode — no blue-green on this box. Deploy pulls the constructors at @latest and rebuilds; the page reloads to pick up the new UIs (restart the dev server for server-side organ changes). On the live box blue binds 127.0.0.1:3005 and green binds 127.0.0.1:3006, while the public ports (80/443, terminated by nginx) never change."}
        </p>
      </div>

      {status?.constructors.some((c) => c.key === "khronoton" && c.wired) ? (
        <p className="mnemo-admin-muted">
          Khronoton is <strong>installed</strong> and its autonomous engine is{" "}
          <strong>live</strong> — the tick loop signs scheduled transactions with the
          sealed operator codex, no human in the loop. Manage schedules under{" "}
          <code>Mnemosyne Khronoton</code>.
        </p>
      ) : null}

      <button
        type="button"
        className={`mnemo-admin-btn ${anyUpdate ? "mnemo-admin-btn--primary" : ""}`}
        disabled={busy || reloadIn !== null}
        onClick={() => setArming(true)}
      >
        {buttonLabel}
      </button>

      {/* The confirmation sits a short gap BELOW the button, which stays put. This is
          React conditional rendering (`{arming ? … : null}`), not the `hidden`
          attribute, so the standard's `[hidden] { display:none }` trap cannot bite:
          an unarmed confirm block is not in the tree at all. */}
      {arming ? (
        <div className="mnemo-admin-confirm">
          <p className="mnemo-admin-status">
            {isBundle
              ? "Confirm: rebuild and redeploy the automaton now?"
              : "Confirm: pull the constructors at @latest and rebuild?"}
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
              onClick={() => setArming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mnemo-admin-status" role="alert">
          {error}
        </p>
      ) : null}

      {showProgress ? (
        <div className="mnemo-admin-result">
          <div className={`mnemo-deploy-progress${stalled ? " is-stalled" : ""}`}>
            <div className="mnemo-deploy-head">
              <span className={`mnemo-deploy-chip mnemo-deploy-chip--${phase}`}>
                {phase === "success"
                  ? "SUCCESS"
                  : phase === "failed"
                    ? "FAILED"
                    : "RUNNING"}
              </span>
              <span className="mnemo-deploy-step">
                {step ?? (phase === "running" ? "waiting for the builder…" : "—")}
              </span>
              <span className="mnemo-deploy-timer">{formatElapsed(elapsedMs)}</span>
            </div>
            {/* The heartbeat animation: pure CSS keyframes on an infinite loop, with no
                JS timer and no data dependency, so it is always smooth. Its honesty
                comes from the watchdog below — a stall pauses it and turns it red. */}
            <div className={`mnemo-deploy-pac${pacState}`} aria-hidden="true">
              <span className="mnemo-deploy-pac-dots">
                · · · · · · · · · · · · · · · · · · · · · · · · · ·
              </span>
              <span className="mnemo-deploy-pac-muncher">ᗧ</span>
            </div>
            {stalled ? (
              <p className="mnemo-deploy-stall" role="alert">
                ⚠ no output for {stallSeconds}s — the host deployer may have stopped.
              </p>
            ) : null}
            {reloadIn != null ? (
              <p className="mnemo-deploy-reload">
                ✓ New version is now live — reloading this page in {reloadIn}…
              </p>
            ) : null}
          </div>
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
        </div>
      ) : null}
    </section>
  );
}

export function UpdateDeployPage(): ReactElement {
  return <DeployPanel />;
}

export default UpdateDeployPage;
