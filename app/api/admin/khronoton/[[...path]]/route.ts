import {
  cancelExecuteBatch,
  commitCodexCronoton,
  deleteCodexCronoton,
  editCodexCronoton,
  executeNow,
  fetchFires,
  fetchSigners,
  getCodexCronoton,
  getExecuteBatch,
  listCodexCronotons,
  pauseCodexCronoton,
  recoverFire,
  resumeCodexCronoton,
  simulateCodexTx,
  startExecuteBatch,
  triggerCronoton,
} from "@ancientpantheon/khronoton-core/handlers";
import type {
  AuthSeam,
  Handler,
  HandlerContext,
  HandlerRequest,
} from "@ancientpantheon/khronoton-core/handlers";

import { requireAncient } from "@/lib/auth/guard";
import { getKhronotonContext } from "@/lib/khronoton/context";
import { createMnemosyneSignerSource } from "@/lib/khronoton/keyResolver";

// The engine imports node:crypto and better-sqlite3 — Node runtime only, never Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Khronoton admin API — ONE catch-all that adapts Next.js requests onto the
 * package's sixteen framework-agnostic handlers (`/handlers`), sharing the same
 * engine context (db + sealed-codex resolver + chain runtime) as the tick loop.
 *
 * Auth model: EVERY route — read and mutate — sits behind `requireAncient`
 * (session cookie), enforced here BEFORE dispatch. The package's AuthSeam then
 * only arbitrates the mutation confirm bit: `requireConfirm` demands the
 * `x-khronoton-confirmed: 1` header the fetch adapter sends after the UI's
 * confirm gate resolves (a missing confirm 401s with `admin_confirm_required`,
 * which `runGated` on the client turns into exactly one re-prompt + retry).
 * `getExecuteBatch`/`cancelExecuteBatch` ride the read gate BY DESIGN (the
 * package's one-click batch stop) — still ancient-gated like everything else.
 */

/** The fetch adapter's confirm signal (CONFIRMED_HEADER in `/provider`). */
const CONFIRMED_HEADER = "x-khronoton-confirmed";

const NO_STORE = { "Cache-Control": "no-store" } as const;

type RouteMatch = { handler: Handler; params: Record<string, string> };

/**
 * Map (method, path segments under /api/admin/khronoton) → handler + params,
 * mirroring the package's route contract exactly:
 *
 *   GET    /                          list          PATCH  /:id          edit
 *   POST   /                          commit        PATCH  /:id/pause    pause
 *   GET    /signers                   signers       PATCH  /:id/resume   resume
 *   POST   /simulate                  simulate      DELETE /:id          delete
 *   GET    /:id                       get           POST   /:id/execute  execute-now
 *   GET    /:id/fires                 fires         POST   /:id/trigger  trigger
 *   POST   /:id/fires/:fireId/recover recover
 *   POST   /:id/execute-batch         start batch   GET/DELETE /:id/execute-batch  poll/stop
 */
function match(method: string, seg: string[]): RouteMatch | null {
  if (seg.length === 0) {
    if (method === "GET") return { handler: listCodexCronotons, params: {} };
    if (method === "POST") return { handler: commitCodexCronoton, params: {} };
    return null;
  }
  if (seg.length === 1) {
    if (seg[0] === "signers" && method === "GET")
      return { handler: fetchSigners, params: {} };
    if (seg[0] === "simulate" && method === "POST")
      return { handler: simulateCodexTx, params: {} };
    const params = { id: seg[0] };
    if (method === "GET") return { handler: getCodexCronoton, params };
    if (method === "PATCH") return { handler: editCodexCronoton, params };
    if (method === "DELETE") return { handler: deleteCodexCronoton, params };
    return null;
  }
  if (seg.length === 2) {
    const params = { id: seg[0] };
    const tail = seg[1];
    if (tail === "fires" && method === "GET") return { handler: fetchFires, params };
    if (tail === "pause" && method === "PATCH")
      return { handler: pauseCodexCronoton, params };
    if (tail === "resume" && method === "PATCH")
      return { handler: resumeCodexCronoton, params };
    if (tail === "execute" && method === "POST") return { handler: executeNow, params };
    if (tail === "trigger" && method === "POST")
      return { handler: triggerCronoton, params };
    if (tail === "execute-batch") {
      if (method === "POST") return { handler: startExecuteBatch, params };
      if (method === "GET") return { handler: getExecuteBatch, params };
      if (method === "DELETE") return { handler: cancelExecuteBatch, params };
    }
    return null;
  }
  if (
    seg.length === 4 &&
    seg[1] === "fires" &&
    seg[3] === "recover" &&
    method === "POST"
  ) {
    return { handler: recoverFire, params: { id: seg[0], fireId: seg[2] } };
  }
  return null;
}

/** Confirm-bit-only seam — the ancient session gate already ran at the route top. */
function ancientAuthSeam(identity: { id?: string; email?: string }): AuthSeam {
  return {
    requireRead: () => ({ ok: true, identity }),
    requireConfirm: (req: HandlerRequest) =>
      req.confirmed === true
        ? { ok: true, identity }
        : {
            ok: false,
            response: { status: 401, body: { error: "admin_confirm_required" } },
          },
  };
}

async function dispatch(
  request: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  const { path } = await ctx.params;
  const matched = match(request.method, path ?? []);
  if (!matched) {
    return Response.json({ error: "not found" }, { status: 404, headers: NO_STORE });
  }

  // Parse the JSON body for mutating methods; an empty/absent body stays undefined.
  let body: unknown;
  if (request.method !== "GET") {
    body = await request.json().catch(() => undefined);
  }

  // Framework-neutral URL parse (Request, not NextRequest) — testable with a
  // plain Request and identical at runtime.
  const { searchParams } = new URL(request.url);
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }

  const handlerRequest: HandlerRequest = {
    params: matched.params,
    query,
    body,
    confirmed: request.headers.get(CONFIRMED_HEADER) === "1",
  };

  const engine = await getKhronotonContext();
  const handlerContext: HandlerContext = {
    db: engine.db,
    runtime: engine.runtime,
    resolver: engine.resolver,
    resolveFireMode: engine.resolveFireMode,
    onAudit: engine.onAudit,
    config: engine.config,
    auth: ancientAuthSeam({ id: gate.session.sub, email: gate.session.name }),
    signers: createMnemosyneSignerSource(),
  };

  const res = await matched.handler(handlerContext, handlerRequest);
  return Response.json(res.body, { status: res.status, headers: NO_STORE });
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  return dispatch(request, ctx);
}
export async function POST(
  request: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  return dispatch(request, ctx);
}
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  return dispatch(request, ctx);
}
export async function DELETE(
  request: Request,
  ctx: { params: Promise<{ path?: string[] }> },
): Promise<Response> {
  return dispatch(request, ctx);
}
