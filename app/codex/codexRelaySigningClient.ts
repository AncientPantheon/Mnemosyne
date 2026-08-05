"use client";

// ============================================================================
// codexRelaySigningClient — browser signing clients that route the loaded
// Codex's on-chain WRITES through Pythia's meter instead of direct-to-node.
//
// `<CodexProvider signingClient={…}>` (codex-ouronet) feeds one of these to the
// signing strategy as its `clientOverride`; the strategy calls exactly two
// methods on it — `dirtyRead(cmd)` (simulate / gas) and `submit(signed)`
// (broadcast, returns `{ requestKey }`).
//
// A transaction COUNTS in Pythia's ledger iff its signed broadcast reaches
// Pythia's `POST /stoachain/send` (keyed OR keyless — the key only changes
// ATTRIBUTION: `byConsumer["mnemosyne"]` vs `"direct"`). There are two mounts,
// with two different postures:
//
//   • OPERATOR codex (`/admin/codex`, ancient-gated) → KEYED relay. submit POSTs
//     to Mnemosyne's `POST /api/pythia/relay`, which attaches the connector's
//     SERVER-held `x-pythia-key` and forwards to Pythia. Attributed to
//     `mnemosyne` — this is genuinely Mnemosyne's own operator activity, and the
//     relay is ancient-gated so it is not an open keyed relay. (Pythia's gateway
//     CORS does NOT allow the `x-pythia-key` header from a browser, so a keyed
//     send MUST go server-side.)  → createCodexRelaySigningClient()
//
//   • CONSUMER codex (public `/codex`, any visitor's own uploaded codex) →
//     KEYLESS browser-direct. submit POSTs straight to Pythia's public
//     `POST {pythiaUrl}/stoachain/send` (CORS-open, keyless). Still COUNTS as a
//     transaction (attributed `"direct"`); Mnemosyne's operator key is never
//     exposed to anonymous visitors.  → createCodexDirectPythiaSigningClient()
//
// `dirtyRead` (both) stays a direct-node `/local`: a full-command simulation
// whose gas (incl. caps/signers) must be accurate, and `/stoachain/read` is
// code-only. A `/local` mutates nothing and is not what the meter counts.
//
// `organs/06` §6/§6a · `HANDOFF-mnemosyne-route-sends-through-pythia.md`.
// ============================================================================

import { loadNetworkSettings } from "./networkSettings";

/** Pythia's KEYED relay endpoint on Mnemosyne (ancient-gated). */
const RELAY_PATH = "/api/pythia/relay";
/** StoaChain network + chain the loaded codex operates on (`@stoachain` constants). */
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

type FetchLike = typeof fetch;

export interface RelaySigningClientOptions {
  /** Injected fetch (tests). Defaults to the browser global. */
  fetchImpl?: FetchLike;
  /** Resolve the current StoaChain node URL for `dirtyRead`. Defaults to the
   *  per-browser network setting (the SAME source CodexShell pins the codex to). */
  resolveNodeUrl?: () => string;
}

export interface DirectPythiaSigningClientOptions extends RelaySigningClientOptions {
  /** Resolve the Pythia gateway base URL. Defaults to a cached GET `/api/config`
   *  (the operator-global Pythia the whole app already uses for reads). */
  resolvePythiaUrl?: () => Promise<string>;
}

// ── shared helpers ──────────────────────────────────────────────────────────

/** `dirtyRead` — direct-node `/local` of the FULL built command (accurate gas). */
async function nodeDirtyRead(
  fetchImpl: FetchLike,
  resolveNodeUrl: () => string,
  cmd: unknown,
): Promise<unknown> {
  const base = resolveNodeUrl().replace(/\/+$/, "");
  const url = `${base}/chainweb/0.0/${STOA_NETWORK}/chain/${STOA_CHAIN_ID}/pact/api/v1/local`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cmd),
  });
  // A non-2xx `/local` is a node/transport error, NOT a Pact `{result:failure}`
  // (those come back 200). Surface it so the strategy doesn't silently fall back
  // to the default gas limit and submit an under-priced tx.
  if (!res.ok) {
    throw new Error(`Codex simulation failed: node /local returned HTTP ${res.status}`);
  }
  return res.json();
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

/** Default operator-Pythia resolver — a cached GET `/api/config` (URLs only). */
function makeDefaultPythiaUrlResolver(fetchImpl: FetchLike): () => Promise<string> {
  let cached: string | null = null;
  return async () => {
    if (cached !== null) return cached;
    try {
      const res = await fetchImpl("/api/config", { cache: "no-store" });
      if (!res.ok) return "";
      const body = (await res.json()) as { pythiaUrl?: unknown };
      cached = typeof body.pythiaUrl === "string" ? body.pythiaUrl : "";
    } catch {
      cached = "";
    }
    return cached;
  };
}

// ── operator (admin) codex: KEYED relay ──────────────────────────────────────

/**
 * Operator-codex signing client. Writes are relayed through Mnemosyne's
 * ancient-gated `POST /api/pythia/relay` (keyed with the connector's server-held
 * `x-pythia-key`) → attributed to `mnemosyne`.
 */
export function createCodexRelaySigningClient(
  opts: RelaySigningClientOptions & { relayPath?: string } = {},
): CodexPactSigningClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolveNodeUrl =
    opts.resolveNodeUrl ?? (() => loadNetworkSettings().stoaChainNodeUrl);
  const relayPath = opts.relayPath ?? RELAY_PATH;

  return {
    dirtyRead: (cmd) => nodeDirtyRead(fetchImpl, resolveNodeUrl, cmd),

    async submit(signed) {
      const res = await fetchImpl(relayPath, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmds: [signed] }),
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* non-JSON error page — fall through to the !ok branch */
      }
      const asObj = (body ?? {}) as { code?: unknown; error?: unknown };

      if (res.status === 503 && asObj.code === "pythia_no_tx_sender") {
        throw new Error(
          "Pythia has no tx relay node configured — the transaction was not sent. " +
            "Ask the operator to configure a Pythia tx-sender (Upload-Pool) node.",
        );
      }
      if (!res.ok) {
        throw new Error(
          typeof asObj.error === "string"
            ? asObj.error
            : `Pythia relay failed (HTTP ${res.status})`,
        );
      }
      return toSubmitResult(body);
    },
  };
}

// ── consumer (public) codex: KEYLESS browser-direct ──────────────────────────

/**
 * Consumer-codex signing client. Writes are broadcast straight to Pythia's
 * public keyless `POST {pythiaUrl}/stoachain/send` from the browser — so a
 * user's own-codex transaction still COUNTS in Pythia's meter (attributed
 * `"direct"`), without routing through (or exposing) Mnemosyne's operator key.
 */
export function createCodexDirectPythiaSigningClient(
  opts: DirectPythiaSigningClientOptions = {},
): CodexPactSigningClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolveNodeUrl =
    opts.resolveNodeUrl ?? (() => loadNetworkSettings().stoaChainNodeUrl);
  const resolvePythiaUrl =
    opts.resolvePythiaUrl ?? makeDefaultPythiaUrlResolver(fetchImpl);

  return {
    dirtyRead: (cmd) => nodeDirtyRead(fetchImpl, resolveNodeUrl, cmd),

    async submit(signed) {
      const pythiaUrl = (await resolvePythiaUrl()).replace(/\/+$/, "");
      if (!pythiaUrl) {
        throw new Error(
          "No Pythia gateway is configured, so the transaction cannot be metered. " +
            "The operator must set the Pythia connector URL.",
        );
      }
      const res = await fetchImpl(`${pythiaUrl}/stoachain/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmds: [signed] }),
      });

      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        /* non-JSON error page — fall through to the !ok branch */
      }
      const asObj = (body ?? {}) as { code?: unknown; error?: unknown };

      if (res.status === 503 && asObj.code === "pythia_no_tx_sender") {
        throw new Error(
          "Pythia has no tx relay node configured — the transaction was not sent. " +
            "Ask the operator to configure a Pythia tx-sender (Upload-Pool) node.",
        );
      }
      if (!res.ok) {
        throw new Error(
          typeof asObj.error === "string"
            ? asObj.error
            : `Pythia send failed (HTTP ${res.status})`,
        );
      }
      return toSubmitResult(body);
    },
  };
}
