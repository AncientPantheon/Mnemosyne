import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { getGatedPythiaClient } from "@/lib/pythia/connectorClient";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated SEND relay — the write half of Pythia's on-chain meter for the
 * loaded Codex (`organs/06` §6; `HANDOFF-mnemosyne-route-sends-through-pythia.md`).
 *
 * The loaded Codex signs locally in the browser, but the connector's
 * `x-pythia-key` is a SERVER secret (minted by the server-side connector loop).
 * So a keyed send cannot originate in the browser: the browser codex signing
 * client (`lib/pythia/codexRelaySigningClient.ts`) POSTs its SIGNED `cmds` here,
 * and this route relays them through the SERVER `getGatedPythiaClient()` — which
 * carries the connector's key — to Pythia's `POST /stoachain/send`. Two effects,
 * per the handoff:
 *   - routing through `/stoachain/send` makes the transaction COUNT in the meter;
 *   - the key ATTRIBUTES it to `mnemosyne` (unkeyed sends fall to `"direct"`).
 * Mnemosyne keeps signing locally; Pythia signs nothing — she relays + meters.
 *
 * Admin-gated so this is never an OPEN Pythia-keyed relay: only the operator
 * (ancient) surface — `/admin/codex`, where Apollo halves are registered — can
 * spend Mnemosyne's attribution. `401` unauthenticated, `403` non-ancient.
 *
 * Pythia's `503 { code:"pythia_no_tx_sender" }` (no Upload-Pool node configured
 * to relay writes — an operator action on the PYTHIA admin side) is surfaced
 * clearly rather than silently failing or falling back to a direct node.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { cmds?: unknown };
  try {
    body = (await request.json()) as { cmds?: unknown };
  } catch {
    return Response.json(
      { error: "a JSON body with a non-empty `cmds` array is required" },
      { status: 400, headers: NO_STORE },
    );
  }

  const cmds = body.cmds;
  if (!Array.isArray(cmds) || cmds.length === 0) {
    return Response.json(
      { error: "`cmds` must be a non-empty array of caller-signed commands" },
      { status: 400, headers: NO_STORE },
    );
  }

  let result: unknown;
  try {
    // The gated client relays the SIGNED cmds VERBATIM and, when a key is linked,
    // attaches the connector's `x-pythia-key`. chainId defaults to 0 (StoaChain).
    result = await getGatedPythiaClient().send({ cmds });
  } catch (err) {
    // A thrown PythiaClientError (pool exhausted / upstream / validation) or a
    // transport failure — surface it as a bad-gateway rather than crashing, and
    // NEVER fall back to a direct node.
    const message = err instanceof Error ? err.message : "Pythia relay failed";
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }

  // `pythia_no_tx_sender` is not one of the client's thrown-envelope codes, so it
  // comes back as a verbatim body — detect it and surface a clear 503.
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

  // Success: return the node's `/send` response (e.g. `{ requestKeys }`) verbatim.
  return Response.json(result, { headers: NO_STORE });
}
