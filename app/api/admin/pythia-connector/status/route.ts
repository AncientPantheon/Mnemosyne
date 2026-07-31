import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { readConnectorStatus } from "@/lib/pythia/connectorStatus";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated poll target for the Pythia connector-auth onboarding job's
 * status (`POST /api/admin/pythia-connector`,
 * `app/api/admin/pythia-connector/route.ts`, is what starts it). Simple
 * passthrough of `readConnectorStatus()` — no side effects, safe to poll
 * freely while a stage is in progress.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  return Response.json(readConnectorStatus(), { headers: NO_STORE });
}
