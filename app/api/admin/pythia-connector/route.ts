import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { readConnectorStatus } from "@/lib/pythia/connectorStatus";
import { startOnboarding } from "@/lib/pythia/onboardingJob";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated trigger for the Pythia connector-auth onboarding job
 * (organs/06 §1–2: ensure identity → deploy both Apollo halves on-chain →
 * link → prove). Fire-and-forget — the job runs in-process and reports
 * progress via `GET /api/admin/pythia-connector/status`
 * (`app/api/admin/pythia-connector/status/route.ts`).
 *
 * Requires `{ acknowledgedSpend: true }` in the body — mirrors
 * `rotate-master-key`'s `acknowledgedExport` confirm-gate: this is a
 * real-money, irreversible action (deploys two Apollo accounts on-chain and
 * spends real STOA), so it needs the same explicit caller-side
 * acknowledgment. `400` if not `true`.
 *
 * Pre-checks the SAME mid-run condition `startOnboarding()` itself guards
 * against (`lib/pythia/onboardingJob.ts`), so a second concurrent trigger
 * gets a clean `409` instead of the guard's throw surfacing as a `500`.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { acknowledgedSpend?: unknown };
  try {
    body = (await request.json()) as { acknowledgedSpend?: unknown };
  } catch {
    body = {};
  }

  if (body.acknowledgedSpend !== true) {
    return Response.json(
      {
        error:
          "acknowledgedSpend must be true — confirm you understand this deploys two Apollo accounts on-chain and spends real STOA (irreversible) before starting onboarding.",
      },
      { status: 400, headers: NO_STORE },
    );
  }

  const current = readConnectorStatus();
  if (current.stage !== "idle" && current.stage !== "failed") {
    return Response.json(
      { error: "onboarding already in progress", status: current },
      { status: 409, headers: NO_STORE },
    );
  }

  startOnboarding();
  return Response.json(
    { ok: true, status: readConnectorStatus() },
    { status: 202, headers: NO_STORE },
  );
}
