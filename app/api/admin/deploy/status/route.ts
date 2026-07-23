import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { readBoxStatus } from "@/lib/deploy/boxStatus";
import { latestDeploy } from "@/lib/deploy/spool";

// Dynamic + no-store: reads the live session and the live spool on every request.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * GET → the on-box deploy status: `{ mode, color, port, container, version, active }`.
 *
 * The identity half is what the operator needs to debug a blue-green incident without
 * an SSH session (which color is live, on which loopback port, in which container).
 * `active` is the newest non-terminal deploy in the spool — it is what lets a panel
 * opened mid-deploy attach to the stream and time it from its REAL start, even when
 * this browser is not the one that triggered it.
 *
 * `401` unauthenticated, `403` non-ancient. Sibling of `GET /api/admin/deploy`, which
 * keeps serving the version readout; the two concerns stay separate.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const { mode, color, port, container, version } = await readBoxStatus();
  return Response.json(
    { mode, color, port, container, version, active: latestDeploy() },
    { headers: NO_STORE },
  );
}
