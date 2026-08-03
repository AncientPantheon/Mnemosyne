import { splitDualLinkKey } from "@ancientpantheon/pythia-client";
import { type NextRequest } from "next/server";

import { requireAncient } from "@/lib/auth/guard";
import { loadCodexSnapshot, ouroAccountsOf } from "@/lib/pythia/codexSnapshot";
import { tickPythiaConnectorOnce } from "@/lib/pythia/connectorLoop";
import { clearConnectorState, writeConnectorState } from "@/lib/pythia/connectorStatus";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * Ancient-gated link/un-link surface for the Pythia connector, driven ENTIRELY
 * by an operator-pasted dual-link-key (the two public Apollo account addresses
 * joined by `|`). All on-chain onboarding (identity generation, Apollo deploy,
 * link, prove) is gone — that flow now lives in Codex's own
 * `ActivateApolloPythiaKey` tab, which Mnemosyne already mounts. Mnemosyne
 * builds and signs NO Pact transactions here.
 *
 * POST `{ dualLinkKey }`: validate the pasted key via `splitDualLinkKey`
 * (`400` with the SDK's specific message on a malformed key), then confirm the
 * operator codex actually holds BOTH resulting Apollo halves — mirroring
 * Pythia's own `SelfApolloVault.setDualLinkKey` `codexHoldsAccount` guard
 * (match on `ouroAccounts[].address`). Only when both are held is the key
 * persisted (`writeConnectorState`), so Mnemosyne can never link a pair it
 * cannot actually sign for.
 *
 * DELETE: `clearConnectorState()` — un-link, returning the store to not-linked.
 *
 * `401` unauthenticated, `403` non-ancient.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  let body: { dualLinkKey?: unknown };
  try {
    body = (await request.json()) as { dualLinkKey?: unknown };
  } catch {
    body = {};
  }

  let standardApollo: string;
  let smartApollo: string;
  try {
    ({ standardApollo, smartApollo } = splitDualLinkKey(body.dualLinkKey as string));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400, headers: NO_STORE },
    );
  }

  // Confirm the codex holds both halves (match on the Apollo account address,
  // never `.publicKey`). An uninitialized/unreadable codex simply holds
  // nothing, so it collapses into the same "not held" rejection below.
  let heldAddresses: string[] = [];
  try {
    const snapshot = await loadCodexSnapshot(
      "the operator codex is not initialized — generate and activate the Apollo pair in the Codex tab first",
    );
    heldAddresses = ouroAccountsOf(snapshot).map((account) => account.address);
  } catch {
    heldAddresses = [];
  }

  for (const half of [standardApollo, smartApollo]) {
    if (!heldAddresses.includes(half)) {
      return Response.json(
        {
          error: `${half} is not held by this codex — generate + activate it in the Codex tab first`,
        },
        { status: 400, headers: NO_STORE },
      );
    }
  }

  writeConnectorState({
    dualLinkKey: body.dualLinkKey as string,
    standardApollo,
    smartApollo,
    linkedAt: new Date().toISOString(),
  });

  // Kick off proving immediately (fire-and-forget) so activation starts on the
  // paste rather than waiting for the background loop's next tick — mirrors
  // Pythia's `link()` closure driving an immediate tick on a fresh paste.
  void tickPythiaConnectorOnce();

  return Response.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAncient(request);
  if (!gate.ok) return gate.response;

  clearConnectorState();
  return Response.json({ ok: true }, { headers: NO_STORE });
}
