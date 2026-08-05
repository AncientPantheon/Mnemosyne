import { readAdminSettings } from "@/lib/adminSettings";

// Force-dynamic + no-store: this is the operator-injected connector config served
// to EVERY user's browser at codex mount. A cached value would keep stale operators
// pinned after an ancient changes the gateway, so it must read live on every request.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/**
 * The PUBLIC connector config (URLs only, no secrets). Returns the ancient-set
 * Pythia gateway so each Mnemosyne user's Codex resolves its `global` connection
 * through the operator's Pythia, PLUS the transport-fallback mode + node target so
 * the browser lanes (codex reads/sims/sends) branch on the SAME mode the server
 * uses. `transportFallback` defaults to `pythia`. All fields are URLs/flags, never
 * secrets. `HANDOFF-mnemosyne-network-fallback.md`.
 */
export function GET() {
  const { pythiaUrl, transportFallback, nodeUrl } = readAdminSettings();
  return Response.json({ pythiaUrl, transportFallback, nodeUrl }, { headers: NO_STORE });
}
