"use client";

// ============================================================================
// codexRelaySigningClient — browser signing clients for the loaded Codex.
//
// Mnemosyne routes ALL on-chain traffic through PYTHIA by default. An ancient can
// flip the admin **Network Fallback** to `direct-node` (break-glass, UNMETERED),
// and BOTH lanes here — `dirtyRead` (simulate) and `submit` (broadcast) — honor
// that mode, resolved live from `/api/config`
// (`HANDOFF-mnemosyne-network-fallback.md`; a fallback that switches only one lane
// is the classic bug).
//
//   mode "pythia" (default):
//     • consumer `/codex`  → KEYLESS browser-direct to Pythia's public gateway.
//     • operator `/admin`  → KEYED via Mnemosyne's ancient-gated /api/pythia/relay.
//   mode "direct-node" (break-glass):
//     • BOTH → straight to the configured Stoa node's /pact/api/v1/{local,send}
//       (UNMETERED). Simulation uses the FULL signed command (accurate gas).
//
// `<CodexProvider signingClient={…}>` feeds one of these to the signing strategy
// as its `clientOverride`; the strategy calls only `dirtyRead(cmd)` + `submit(signed)`.
// ============================================================================

import { extractExec } from "@/lib/pythia/pactExec";

export { extractExec };

/** Pythia's KEYED relay endpoint on Mnemosyne (ancient-gated). */
const RELAY_PATH = "/api/pythia/relay";
/** StoaChain network + chain (the break-glass node pact path). */
const STOA_NETWORK = "stoa";
const STOA_CHAIN_ID = "0";

/** A caller-signed chainweb command (`{ cmd, hash, sigs }`). */
export interface SignedCommand {
  cmd: string;
  hash: string;
  sigs: unknown[];
}

/** The subset of the `@stoachain` PactClient the CodexSigningStrategy calls. */
export interface CodexPactSigningClient {
  dirtyRead(cmd: unknown): Promise<unknown>;
  submit(signed: SignedCommand): Promise<{ requestKey: string; raw: unknown }>;
}

/** The live transport config the browser lanes branch on (from `/api/config`). */
export interface BrowserTransportConfig {
  pythiaUrl: string;
  mode: "pythia" | "direct-node";
  nodeUrl: string;
}

type FetchLike = typeof fetch;

export interface SigningClientOptions {
  /** Injected fetch (tests). Defaults to the browser global. */
  fetchImpl?: FetchLike;
  /** Resolve the live transport config (tests). Defaults to GET `/api/config`,
   *  fetched fresh per operation so an admin fallback flip takes effect promptly. */
  resolveConfig?: () => Promise<BrowserTransportConfig>;
}

// ── shared helpers ──────────────────────────────────────────────────────────

function makeDefaultConfigResolver(fetchImpl: FetchLike): () => Promise<BrowserTransportConfig> {
  return async () => {
    try {
      const res = await fetchImpl("/api/config", { cache: "no-store" });
      if (!res.ok) return { pythiaUrl: "", mode: "pythia", nodeUrl: "" };
      const b = (await res.json()) as {
        pythiaUrl?: unknown;
        transportFallback?: unknown;
        nodeUrl?: unknown;
      };
      return {
        pythiaUrl: typeof b.pythiaUrl === "string" ? b.pythiaUrl : "",
        mode: b.transportFallback === "direct-node" ? "direct-node" : "pythia",
        nodeUrl: typeof b.nodeUrl === "string" ? b.nodeUrl : "",
      };
    } catch {
      return { pythiaUrl: "", mode: "pythia", nodeUrl: "" };
    }
  };
}

function nodePactBase(nodeUrl: string): string {
  return `${nodeUrl.replace(/\/+$/, "")}/chainweb/0.0/${STOA_NETWORK}/chain/${STOA_CHAIN_ID}/pact`;
}

/** The node `/send` response is `{ requestKeys:[…] }`; the strategy wants a
 *  top-level `requestKey`. */
function toSubmitResult(body: unknown): { requestKey: string; raw: unknown } {
  const asObj = (body ?? {}) as { requestKeys?: unknown; requestKey?: unknown };
  const requestKeys = Array.isArray(asObj.requestKeys) ? asObj.requestKeys : undefined;
  const requestKey =
    (requestKeys?.[0] as string | undefined) ??
    (typeof asObj.requestKey === "string" ? asObj.requestKey : "") ??
    "";
  return { requestKey, raw: body };
}

async function jsonOrNull(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function noTxSenderThrow(status: number, body: unknown): void {
  if (status === 503 && (body as { code?: unknown } | null)?.code === "pythia_no_tx_sender") {
    throw new Error(
      "Pythia has no tx relay node configured — the transaction was not sent. " +
        "Ask the operator to configure a Pythia tx-sender (Upload-Pool) node.",
    );
  }
}

// ── break-glass: straight to the Stoa node (UNMETERED) ───────────────────────

async function nodeDirtyRead(fetchImpl: FetchLike, nodeUrl: string, cmd: unknown): Promise<unknown> {
  if (!nodeUrl) throw new Error("Network Fallback is on direct-node but no node URL is configured.");
  // The FULL signed command goes to /local (accurate gas — no code/data extraction).
  const res = await fetchImpl(`${nodePactBase(nodeUrl)}/api/v1/local`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error(`Direct-node simulation failed (HTTP ${res.status})`);
  return res.json();
}

async function nodeSubmit(
  fetchImpl: FetchLike,
  nodeUrl: string,
  signed: SignedCommand,
): Promise<{ requestKey: string; raw: unknown }> {
  if (!nodeUrl) throw new Error("Network Fallback is on direct-node but no node URL is configured.");
  const res = await fetchImpl(`${nodePactBase(nodeUrl)}/api/v1/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmds: [signed] }),
  });
  const body = await jsonOrNull(res);
  if (!res.ok) throw new Error(`Direct-node send failed (HTTP ${res.status})`);
  return toSubmitResult(body);
}

// ── the mode-branching client (shared shell; Pythia lane differs per mount) ───

interface PythiaLane {
  dirtyRead(cfg: BrowserTransportConfig, cmd: unknown): Promise<unknown>;
  submit(cfg: BrowserTransportConfig, signed: SignedCommand): Promise<{ requestKey: string; raw: unknown }>;
}

function makeSigningClient(
  fetchImpl: FetchLike,
  resolveConfig: () => Promise<BrowserTransportConfig>,
  pythia: PythiaLane,
): CodexPactSigningClient {
  return {
    async dirtyRead(cmd) {
      const cfg = await resolveConfig();
      return cfg.mode === "direct-node"
        ? nodeDirtyRead(fetchImpl, cfg.nodeUrl, cmd)
        : pythia.dirtyRead(cfg, cmd);
    },
    async submit(signed) {
      const cfg = await resolveConfig();
      return cfg.mode === "direct-node"
        ? nodeSubmit(fetchImpl, cfg.nodeUrl, signed)
        : pythia.submit(cfg, signed);
    },
  };
}

// ── operator (admin) codex: KEYED via the Mnemosyne relay ────────────────────

export function createCodexRelaySigningClient(
  opts: SigningClientOptions & { relayPath?: string } = {},
): CodexPactSigningClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolveConfig = opts.resolveConfig ?? makeDefaultConfigResolver(fetchImpl);
  const relayPath = opts.relayPath ?? RELAY_PATH;

  const post = (payload: unknown) =>
    fetchImpl(relayPath, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  return makeSigningClient(fetchImpl, resolveConfig, {
    async dirtyRead(_cfg, cmd) {
      const res = await post(extractExec(cmd));
      if (!res.ok) throw new Error(`Codex simulation failed via Pythia (HTTP ${res.status})`);
      return res.json();
    },
    async submit(_cfg, signed) {
      const res = await post({ cmds: [signed] });
      const body = await jsonOrNull(res);
      noTxSenderThrow(res.status, body);
      if (!res.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        throw new Error(typeof error === "string" ? error : `Pythia relay failed (HTTP ${res.status})`);
      }
      return toSubmitResult(body);
    },
  });
}

// ── consumer (public) codex: KEYLESS browser-direct to Pythia ────────────────

export function createCodexDirectPythiaSigningClient(
  opts: SigningClientOptions = {},
): CodexPactSigningClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolveConfig = opts.resolveConfig ?? makeDefaultConfigResolver(fetchImpl);

  function pythiaBase(cfg: BrowserTransportConfig): string {
    const url = cfg.pythiaUrl.replace(/\/+$/, "");
    if (!url) {
      throw new Error(
        "No Pythia gateway is configured, so the operation cannot be routed through Pythia. " +
          "The operator must set the Pythia connector URL (or enable the Network Fallback).",
      );
    }
    return url;
  }

  return makeSigningClient(fetchImpl, resolveConfig, {
    async dirtyRead(cfg, cmd) {
      const res = await fetchImpl(`${pythiaBase(cfg)}/stoachain/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(extractExec(cmd)),
      });
      if (!res.ok) throw new Error(`Codex simulation failed via Pythia (HTTP ${res.status})`);
      return res.json();
    },
    async submit(cfg, signed) {
      const res = await fetchImpl(`${pythiaBase(cfg)}/stoachain/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmds: [signed] }),
      });
      const body = await jsonOrNull(res);
      noTxSenderThrow(res.status, body);
      if (!res.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        throw new Error(typeof error === "string" ? error : `Pythia send failed (HTTP ${res.status})`);
      }
      return toSubmitResult(body);
    },
  });
}
