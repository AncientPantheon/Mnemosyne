import { readAdminSettings } from "@/lib/adminSettings";

// Force-dynamic + no-store: this is the operator-injected connector config served
// to EVERY user's browser at codex mount. A cached value would keep stale operators
// pinned after an ancient changes the gateway, so it must read live on every request.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * The PUBLIC connector config (URLs only, no secrets). Returns the ancient-set
 * Pythia gateway so each Mnemosyne user's Codex resolves its `global` connection
 * through the operator's Pythia. Empty `pythiaUrl` ⇒ no global (both chains local).
 */
export function GET() {
  const { pythiaUrl } = readAdminSettings();
  return Response.json({ pythiaUrl }, { headers: NO_STORE });
}
