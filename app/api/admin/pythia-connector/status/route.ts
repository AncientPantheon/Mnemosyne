import { maskSecret, type DualLinkHalfStatus } from "@ancientpantheon/pythia-client";
import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { getDualLinkConnector } from "@/lib/pythia/connectorClient";
import { tickPythiaConnectorOnce } from "@/lib/pythia/connectorLoop";
import { readConnectorState } from "@/lib/pythia/connectorStatus";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated live status for the Pythia connector panel. Combines the
 * persisted state (`readConnectorState` — the pasted key + its two public
 * Apollo halves) with the live, in-memory `DualLinkConnector.status()`
 * (`getDualLinkConnector`), so the panel can render per-half pending/active
 * plus an expiry countdown. The ephemeral `x-pythia-key` secret is NEVER
 * returned raw — only its `maskSecret`-ed form as the single top-level
 * `maskedSecret`. `DualLinkHalfStatus`'s ACTIVE variant carries the raw secret,
 * so each half is passed through {@link publicHalf}, which strips it — otherwise
 * the live bearer credential would leak in `standard.secret`/`smart.secret`
 * right beside the field we bothered to mask.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
type PublicHalf = { status: "pending" } | { status: "active"; expiresAt: number };

/** Strip the raw per-half `secret` from a `DualLinkHalfStatus` — only the
 *  status label + (when active) the expiry ever cross the wire. */
function publicHalf(half: DualLinkHalfStatus | undefined): PublicHalf | null {
  if (half == null) return null;
  return half.status === "active"
    ? { status: "active", expiresAt: half.expiresAt }
    : { status: "pending" };
}

export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  // Drive one tick before reading, so while the operator watches the panel
  // (which polls this) the pair converges to active promptly (prove → resolve →
  // prove) rather than waiting on the background loop's next interval. Once
  // active this is cheap — the connector returns its cached secret with no
  // round trip until near expiry. No-op when nothing is linked.
  await tickPythiaConnectorOnce();

  const state = readConnectorState();
  const status = getDualLinkConnector()?.status() ?? null;
  const maskedSecret = status?.secret != null ? maskSecret(status.secret) : null;

  return Response.json(
    {
      linked: state.dualLinkKey != null,
      standardApollo: state.standardApollo,
      smartApollo: state.smartApollo,
      standard: publicHalf(status?.standard),
      smart: publicHalf(status?.smart),
      maskedSecret,
      expiresAt: status?.expiresAt ?? null,
    },
    { headers: NO_STORE },
  );
}
