import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { getGatedPythiaClient, withConnectorSelfHeal } from "@/lib/pythia/connectorClient";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated Pythia relay — the OPERATOR codex's window onto Pythia's gateway
 * for the traffic the browser can't key itself (`organs/06` §6/§6a;
 * `HANDOFF-mnemosyne-route-sends-through-pythia.md`).
 *
 * Mnemosyne routes ALL on-chain traffic through Pythia — never a node. The
 * loaded Codex signs locally in the browser, but the connector's `x-pythia-key`
 * is a SERVER secret (minted by the server-side connector loop) and Pythia's
 * gateway CORS forbids that header from a browser, so keyed reads/sends MUST go
 * server-side. This relay forwards through `getGatedPythiaClient()` (which
 * carries the key) to Pythia:
 *   - `read`  → `POST /stoachain/read`  (a keyless Pact `local`; gas simulation)
 *   - `send`  → `POST /stoachain/send`  (the SIGNED broadcast — what the meter counts)
 *   - `poll`  → `POST /stoachain/poll`  (tx status)
 * and returns Pythia's (node-verbatim) response.
 *
 * The op is inferred from the body: `cmds` → send, `code` → read, `requestKeys`
 * → poll. Admin-gated so this is never an OPEN Pythia-keyed relay under
 * Mnemosyne's attribution. `401` unauthenticated, `403` non-ancient.
 *
 * Pythia's `503 { code:"pythia_no_tx_sender" }` (no Upload-Pool node configured
 * to relay writes) is surfaced clearly — never a silent direct-to-node fallback.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { cmds?: unknown; code?: unknown; data?: unknown; requestKeys?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return badRequest("a JSON body is required");
  }

  const cmds = body.cmds;
  const code = body.code;
  const requestKeys = body.requestKeys;

  try {
    // Each gated call is wrapped in withConnectorSelfHeal (§7e): a dead ephemeral
    // key that comes back as a body OR a re-thrown error triggers a re-mint +
    // one retry. `getGatedPythiaClient()` is re-resolved INSIDE the thunk so the
    // retry binds to the rebuilt connector.

    // ── send: a SIGNED broadcast ──────────────────────────────────────────
    if (Array.isArray(cmds)) {
      if (cmds.length === 0) return badRequest("`cmds` must be non-empty");
      const result = await withConnectorSelfHeal(() => getGatedPythiaClient().send({ cmds }));
      const noTx = noTxSender(result);
      if (noTx) return noTx;
      return Response.json(result, { headers: NO_STORE });
    }

    // ── read: a keyless dirty read (Pact `local`) for gas / simulation ─────
    if (typeof code === "string") {
      const result = await withConnectorSelfHeal(() =>
        getGatedPythiaClient().read({
          code,
          ...(body.data !== undefined ? { data: body.data as object } : {}),
        }),
      );
      return Response.json(result, { headers: NO_STORE });
    }

    // ── poll: tx status by request key ────────────────────────────────────
    if (Array.isArray(requestKeys)) {
      if (requestKeys.length === 0) return badRequest("`requestKeys` must be non-empty");
      const result = await withConnectorSelfHeal(() =>
        getGatedPythiaClient().poll({ requestKeys: requestKeys as string[] }),
      );
      return Response.json(result, { headers: NO_STORE });
    }

    return badRequest("body must carry `cmds` (send), `code` (read), or `requestKeys` (poll)");
  } catch (err) {
    // A thrown PythiaClientError (pool exhausted / upstream / validation) or a
    // transport failure — surface it, and NEVER fall back to a direct node.
    const message = err instanceof Error ? err.message : "Pythia relay failed";
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }
}

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400, headers: NO_STORE });
}

/**
 * `pythia_no_tx_sender` is not one of the client's thrown-envelope codes, so it
 * comes back as a verbatim body — detect it and surface a clear 503.
 */
function noTxSender(result: unknown): Response | null {
  if (
    result !== null &&
    typeof result === "object" &&
    (result as { code?: unknown }).code === "pythia_no_tx_sender"
  ) {
    return Response.json(
      {
        error:
          "Pythia has no tx relay node configured (pythia_no_tx_sender) — an operator " +
          "action on the Pythia admin side; the send was not routed.",
        code: "pythia_no_tx_sender",
      },
      { status: 503, headers: NO_STORE },
    );
  }
  return null;
}
