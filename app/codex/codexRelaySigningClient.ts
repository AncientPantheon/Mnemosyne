"use client";

// ============================================================================
// codexRelaySigningClient — browser signing clients that route the loaded
// Codex's on-chain traffic through PYTHIA, never a node.
//
// Mnemosyne has ONE on-chain connection: Pythia. EVERYTHING flows through her —
// reads, gas simulations, and sends — for both the operator codex and any user's
// own uploaded codex. There is no direct-node path here (a direct node exists
// ONLY when an admin sets one in admin-gated settings).
//
// `<CodexProvider signingClient={…}>` (codex-ouronet) feeds one of these to the
// signing strategy as its `clientOverride`; the strategy calls exactly two
// methods on it — `dirtyRead(cmd)` (simulate / gas) and `submit(signed)`
// (broadcast, returns `{ requestKey }`). BOTH are routed through Pythia:
//   - dirtyRead → Pythia `/stoachain/read` (a keyless Pact `local`).
//   - submit    → Pythia `/stoachain/send` (the SIGNED broadcast the meter counts).
//
// Two mounts, two postures (both go through Pythia; the key only changes
// ATTRIBUTION — Pythia's gateway CORS forbids the `x-pythia-key` header from a
// browser, so keyed traffic must go server-side):
//   • OPERATOR codex (`/admin/codex`, ancient-gated) → KEYED, via Mnemosyne's
//     `POST /api/pythia/relay` (server attaches the connector key). Attributed
//     to `mnemosyne`.  → createCodexRelaySigningClient()
//   • CONSUMER codex (public `/codex`, any visitor's own codex) → KEYLESS,
//     browser-direct to Pythia's public gateway. Still fully metered
//     (attributed `"direct"`); Mnemosyne's operator key is never exposed to
//     anonymous visitors.  → createCodexDirectPythiaSigningClient()
//
// Gas note: Pythia's `/read` is an UNSIGNED keyless `local`, so its gas estimate
// omits signer-cap overhead; `CodexSigningStrategy.calculateAutoGasLimit` adds
// margin over it. Routing through Pythia takes precedence over a marginally
// tighter direct-node estimate.
//
// `organs/06` §6/§6a · `HANDOFF-mnemosyne-route-sends-through-pythia.md`.
// ============================================================================

import { extractExec } from "@/lib/pythia/pactExec";

/** Re-exported for the codex signing-client tests (source of truth: pactExec). */
export { extractExec };

/** Pythia's KEYED relay endpoint on Mnemosyne (ancient-gated). */
const RELAY_PATH = "/api/pythia/relay";

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
}

export interface DirectPythiaSigningClientOptions extends RelaySigningClientOptions {
  /** Resolve the Pythia gateway base URL. Defaults to a cached GET `/api/config`
   *  (the operator-global Pythia the whole app already uses for reads). */
  resolvePythiaUrl?: () => Promise<string>;
}

// ── shared helpers ──────────────────────────────────────────────────────────

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

/** Parse a fetch Response body as JSON (tolerating a non-JSON error page). */
async function jsonOrNull(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function noTxSenderThrow(status: number, body: unknown): void {
  const code = (body as { code?: unknown } | null)?.code;
  if (status === 503 && code === "pythia_no_tx_sender") {
    throw new Error(
      "Pythia has no tx relay node configured — the transaction was not sent. " +
        "Ask the operator to configure a Pythia tx-sender (Upload-Pool) node.",
    );
  }
}

// ── operator (admin) codex: KEYED via the Mnemosyne relay ────────────────────

/**
 * Operator-codex signing client. Reads AND writes are relayed through
 * Mnemosyne's ancient-gated `POST /api/pythia/relay` (keyed with the connector's
 * server-held `x-pythia-key`) → Pythia. Attributed to `mnemosyne`.
 */
export function createCodexRelaySigningClient(
  opts: RelaySigningClientOptions & { relayPath?: string } = {},
): CodexPactSigningClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const relayPath = opts.relayPath ?? RELAY_PATH;

  const post = (payload: unknown) =>
    fetchImpl(relayPath, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

  return {
    async dirtyRead(cmd) {
      const res = await post(extractExec(cmd));
      if (!res.ok) throw new Error(`Codex simulation failed via Pythia (HTTP ${res.status})`);
      return res.json();
    },

    async submit(signed) {
      const res = await post({ cmds: [signed] });
      const body = await jsonOrNull(res);
      noTxSenderThrow(res.status, body);
      if (!res.ok) {
        const error = (body as { error?: unknown } | null)?.error;
        throw new Error(typeof error === "string" ? error : `Pythia relay failed (HTTP ${res.status})`);
      }
      return toSubmitResult(body);
    },
  };
}

// ── consumer (public) codex: KEYLESS browser-direct to Pythia ────────────────

/** Default operator-Pythia resolver — a cached GET `/api/config` (URLs only). */
function makeDefaultPythiaUrlResolver(fetchImpl: FetchLike): () => Promise<string> {
  let cached: string | null = null;
  return async () => {
    if (cached !== null) return cached;
    try {
      const res = await fetchImpl("/api/config", { cache: "no-store" });
      cached = res.ok ? (((await res.json()) as { pythiaUrl?: unknown }).pythiaUrl as string) || "" : "";
    } catch {
      cached = "";
    }
    return cached ?? "";
  };
}

/**
 * Consumer-codex signing client. Reads AND writes go straight to Pythia's public
 * keyless gateway from the browser — so a user's own-codex transaction is fully
 * routed through Pythia (reads + simulation + send), counting in the meter
 * (attributed `"direct"`), without routing through (or exposing) Mnemosyne's
 * operator key.
 */
export function createCodexDirectPythiaSigningClient(
  opts: DirectPythiaSigningClientOptions = {},
): CodexPactSigningClient {
  const fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  const resolvePythiaUrl = opts.resolvePythiaUrl ?? makeDefaultPythiaUrlResolver(fetchImpl);

  async function base(): Promise<string> {
    const url = (await resolvePythiaUrl()).replace(/\/+$/, "");
    if (!url) {
      throw new Error(
        "No Pythia gateway is configured, so the operation cannot be routed through Pythia. " +
          "The operator must set the Pythia connector URL.",
      );
    }
    return url;
  }

  return {
    async dirtyRead(cmd) {
      const url = await base();
      const res = await fetchImpl(`${url}/stoachain/read`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(extractExec(cmd)),
      });
      if (!res.ok) throw new Error(`Codex simulation failed via Pythia (HTTP ${res.status})`);
      return res.json();
    },

    async submit(signed) {
      const url = await base();
      const res = await fetchImpl(`${url}/stoachain/send`, {
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
  };
}
