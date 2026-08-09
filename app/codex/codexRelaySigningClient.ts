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

import { rawCalibratedDirtyRead, type PactReader } from "@stoachain/stoa-core/reads";

import { extractExec } from "@/lib/pythia/pactExec";

export { extractExec };

/** True when a built command DECLARES signers — i.e. it is a signed-tx SIMULATE
 *  whose keys-all/guard needs those signers on a signer-aware `/local`. A plain
 *  DISPLAY read carries NO signers and must route through Pythia (`organs/06` §6a).
 *  The one legitimate node-direct read is the simulate; everything else is Pythia's. */
function commandHasSigners(cmd: unknown): boolean {
  const envelope = (cmd ?? {}) as { cmd?: unknown };
  const raw = typeof envelope.cmd === "string" ? envelope.cmd : typeof cmd === "string" ? cmd : "";
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { signers?: unknown };
    return Array.isArray(parsed.signers) && parsed.signers.length > 0;
  } catch {
    return false;
  }
}

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

// ── the pre-fire simulate: a node /local dirty-read ──────────────────────────

/** Mirror `@kadena/chainweb-node-client`'s `convertIUnsignedTransactionToNoSig`:
 *  a pre-fire sim is UNSIGNED, so give each declared signer an empty-string sig so
 *  the envelope is well-formed for a `signatureVerification=false` /local. */
function toNoSigCommand(cmd: unknown): unknown {
  const c = cmd as { sigs?: unknown };
  if (!c || !Array.isArray(c.sigs)) return cmd;
  return {
    ...(c as object),
    sigs: c.sigs.map((s) =>
      s && typeof (s as { sig?: unknown }).sig === "string" ? s : { ...(s as object), sig: "" },
    ),
  };
}

async function nodeDirtyRead(fetchImpl: FetchLike, nodeUrl: string, cmd: unknown): Promise<unknown> {
  if (!nodeUrl) throw new Error("No node URL is configured for the pre-fire simulation.");
  // CRITICAL: a pre-fire simulate is UNSIGNED (it only DECLARES its signers). The
  // node must be told `signatureVerification=false` so it grants caps to the
  // declared signers — otherwise it signature-verifies an unsigned command and a
  // `keys-all` guard fails ("Keyset failure (keys-all)"). `preflight=false` returns
  // the plain `{ result, gas }` the signing strategy consumes. This mirrors the
  // kadena client's `dirtyRead` exactly (which is why OuronetUI, using that client,
  // signs the same codex fine while a raw POST here did not).
  const url = `${nodePactBase(nodeUrl)}/api/v1/local?preflight=false&signatureVerification=false`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toNoSigCommand(cmd)),
  });
  if (!res.ok) throw new Error(`Node /local simulation failed (HTTP ${res.status})`);
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

/** Default simulate node when /api/config is briefly unreachable (matches the
 *  AdminSettings default so the pre-fire /local always has a target). */
const DEFAULT_SIM_NODE = "https://node2.stoachain.com";

// ── the mode-branching client (shared shell; only the send lane differs) ──────

interface PythiaLane {
  /** How this mount SENDS in `pythia` mode (relay for operator, direct for consumer). */
  submit(cfg: BrowserTransportConfig, signed: SignedCommand): Promise<{ requestKey: string; raw: unknown }>;
  /** How this mount runs a KEYED display READ in `pythia` mode (relay for operator,
   *  direct for consumer). Code-only, no signers — Pythia serves + meters it. */
  read(cfg: BrowserTransportConfig, code: string, data?: object): Promise<unknown>;
}

function makeSigningClient(
  fetchImpl: FetchLike,
  resolveConfig: () => Promise<BrowserTransportConfig>,
  pythia: PythiaLane,
): CodexPactSigningClient {
  return {
    async dirtyRead(cmd) {
      const cfg = await resolveConfig();
      // TWO lanes (organs/06 §6a):
      //  - a signed-tx SIMULATE (declares signers) — or the break-glass fallback —
      //    goes node-direct via a signer-aware `/local` (the ONE legitimate
      //    node-direct read: a keys-all guard needs the tx's signers, which Pythia's
      //    signer-stripping `/read` can't carry);
      //  - a DISPLAY read (no signers) routes through Pythia's KEYED `/read`, so it's
      //    metered + attributed to this consumer.
      if (cfg.mode === "direct-node" || commandHasSigners(cmd)) {
        return nodeDirtyRead(fetchImpl, cfg.nodeUrl || DEFAULT_SIM_NODE, cmd);
      }
      const { code, data } = extractExec(cmd);
      return pythia.read(cfg, code, data);
    },
    async submit(signed) {
      const cfg = await resolveConfig();
      // The SEND is what the meter counts: through Pythia by default, straight to
      // the node only under the admin Network Fallback.
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
    async submit(cfg, signed) {
      // KEYED relay send (attributed to mnemosyne, self-healed server-side). Falls
      // back to a node-direct send if the relay/key fails, so a transaction is
      // never blocked by a Pythia hiccup.
      try {
        const res = await post({ cmds: [signed] });
        const body = await jsonOrNull(res);
        noTxSenderThrow(res.status, body);
        if (!res.ok) {
          const error = (body as { error?: unknown } | null)?.error;
          throw new Error(typeof error === "string" ? error : `relay send HTTP ${res.status}`);
        }
        return toSubmitResult(body);
      } catch {
        return nodeSubmit(fetchImpl, cfg.nodeUrl || DEFAULT_SIM_NODE, signed);
      }
    },
    async read(cfg, code, data) {
      // KEYED relay read (attributed to mnemosyne). Falls back to a node-direct
      // read if the relay/key fails, so the display never blanks (Pythia down or a
      // dead key must not turn every account "observational").
      try {
        const res = await post({ code, ...(data ? { data } : {}) });
        if (!res.ok) throw new Error(`relay read HTTP ${res.status}`);
        return await res.json();
      } catch {
        return nodeCodeRead(cfg.nodeUrl, code);
      }
    },
  });
}

// ── consumer (public) codex: KEYLESS browser-direct to Pythia ────────────────

export function createCodexDirectPythiaSigningClient(
  opts: SigningClientOptions = {},
): CodexPactSigningClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolveConfig = opts.resolveConfig ?? makeDefaultConfigResolver(fetchImpl);

  return makeSigningClient(fetchImpl, resolveConfig, {
    async submit(cfg, signed) {
      // Pythia HARD-GATES sends (401 without a key), and a public visitor has no
      // key + can't send the header from a browser. So a consumer transaction
      // broadcasts NODE-DIRECT (unmetered — the only keyless option). Only the
      // operator surface, which holds the server-side key, sends through Pythia.
      return nodeSubmit(fetchImpl, cfg.nodeUrl || DEFAULT_SIM_NODE, signed);
    },
    async read(cfg, code) {
      // Pythia HARD-GATES reads (401 without a key), and a public consumer has no
      // key + cannot send the `x-pythia-key` header from a browser (Pythia CORS
      // allows only Content-Type/Accept). So a consumer display read goes
      // NODE-DIRECT — §6a's keyed rule is physically unreachable for a public
      // surface. (Only the operator `/admin/codex`, which has the server-held key,
      // reads through Pythia keyed.)
      return nodeCodeRead(cfg.nodeUrl, code);
    },
  });
}

// ── DISPLAY-READ ROUTING (setPactReader) — every codex `pactRead` flows here ──
// codex-ouronet interaction reads (account/balance/table/"read to show") call
// `pactRead(code, options)`, which routes through the reader installed via
// `setPactReader`. UNINSTALLED, it falls to the default NODE-DIRECT reader,
// bypassing Pythia — so the consumer is invisible in `/pyth` byConsumer despite an
// active connector (`organs/06` §6a). These factories route those code reads
// (no signers) through Pythia's KEYED `/read`; only the break-glass Network
// Fallback goes node-direct.

/** Break-glass: a signer-less code read straight to the configured node. */
function nodeCodeRead(nodeUrl: string, pactCode: string): Promise<unknown> {
  return rawCalibratedDirtyRead(pactCode, { pactUrl: `${nodePactBase(nodeUrl || DEFAULT_SIM_NODE)}` });
}

/** Operator (admin) codex reader → KEYED via the Mnemosyne relay. */
export function createCodexRelayPactReader(
  opts: SigningClientOptions & { relayPath?: string } = {},
): PactReader {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolveConfig = opts.resolveConfig ?? makeDefaultConfigResolver(fetchImpl);
  const relayPath = opts.relayPath ?? RELAY_PATH;

  return async (pactCode) => {
    const cfg = await resolveConfig();
    if (cfg.mode === "direct-node") return nodeCodeRead(cfg.nodeUrl, pactCode);
    // KEYED relay read (attributed to mnemosyne), with a node-direct fallback so a
    // relay/key failure never blanks the display.
    try {
      const res = await fetchImpl(relayPath, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: pactCode }),
      });
      if (!res.ok) throw new Error(`relay read HTTP ${res.status}`);
      return await res.json();
    } catch {
      return nodeCodeRead(cfg.nodeUrl, pactCode);
    }
  };
}

/** Consumer (public) codex reader → NODE-DIRECT. Pythia hard-gates reads (401
 *  without a key) and a public visitor has no key + can't send the header from a
 *  browser, so its display reads cannot go through Pythia — they read the node
 *  directly (as they did before v0.14.0, and as localhost/OuronetUI do). */
export function createCodexDirectPythiaPactReader(opts: SigningClientOptions = {}): PactReader {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolveConfig = opts.resolveConfig ?? makeDefaultConfigResolver(fetchImpl);

  return async (pactCode) => {
    const cfg = await resolveConfig();
    return nodeCodeRead(cfg.nodeUrl, pactCode);
  };
}
