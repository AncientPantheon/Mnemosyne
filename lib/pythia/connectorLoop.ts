import { getDualLinkConnector } from "./connectorClient";

/**
 * The Pythia-connector heartbeat — Mnemosyne's mirror of Pythia's own
 * `SelfConnectorLoop` (`constructors/Pythia/apps/pythia/src/automaton/
 * selfConnectorLoop.ts`), adapted for a real external consumer.
 *
 * WHY A LOOP AT ALL. A `DualLinkConnector` does NOTHING until something ticks
 * it: `tick()` runs each half's challenge → sign → verify round trip, which is
 * what actually MINTS the ephemeral `x-pythia-key`. And activation is
 * multi-step: the first ticks make each half PROVE ownership (Pythia's verify
 * returns `202 pending` and records the proof), Pythia's own activation
 * resolver then fires `A_LinkDualApiKey` once both proofs are in, and only a
 * SUBSEQUENT tick's verify returns `200` with the live secret. A single tick
 * can't get there — the loop is what drives the pair from "pasted" to "active".
 * Without it the connector sits forever at `{pending, pending}` and the panel
 * never shows a key (the bug this fixes).
 *
 * Each tick delegates to `getDualLinkConnector()` (which lazily builds/rebuilds
 * the one memoized connector from the stored dual-link-key) — so the loop is a
 * no-op before a key is pasted, and automatically picks up a freshly-linked or
 * re-linked key. `tick()` never throws (the `DualLinkConnector` isolates each
 * half's failure internally, and a `202 pending` is a legitimate steady state,
 * not an error), but every call is wrapped defensively so a transient chain/
 * signer failure can never crash the loop or the process.
 */

const g = globalThis as unknown as {
  __mnemosynePythiaConnectorLoop?: ReturnType<typeof setInterval>;
};

/** Default cadence. Short enough to converge activation (prove → resolve →
 *  prove) within a couple of ticks and to refresh well inside the ~3h secret
 *  TTL; ticking an already-active connector is cheap (its cached secret is
 *  returned with no round trip until near expiry). Override via
 *  `MNEMOSYNE_PYTHIA_CONNECTOR_TICK_MS`. */
const DEFAULT_TICK_MS = 60_000;

/** Drive exactly one connector tick, swallowing any error. Safe to call from a
 *  fire-and-forget context (the link route, the loop). A no-op when nothing is
 *  linked. */
export async function tickPythiaConnectorOnce(): Promise<void> {
  try {
    await getDualLinkConnector()?.tick();
  } catch (err) {
    console.error("[pythia-connector] tick failed:", err);
  }
}

/**
 * Start the connector heartbeat ONCE per server process (mirrors
 * `lib/khronoton/register.ts`'s `globalThis`-guarded start). Fires an immediate
 * tick, then repeats on an interval. `MNEMOSYNE_PYTHIA_CONNECTOR_DISABLED=1` is
 * the operator kill switch. Idempotent — a second call is a no-op.
 */
export function startPythiaConnectorLoop(): void {
  if (g.__mnemosynePythiaConnectorLoop) return;
  if (process.env.MNEMOSYNE_PYTHIA_CONNECTOR_DISABLED === "1") {
    console.log("[pythia-connector] loop disabled (MNEMOSYNE_PYTHIA_CONNECTOR_DISABLED=1)");
    return;
  }
  const intervalMs = Number(process.env.MNEMOSYNE_PYTHIA_CONNECTOR_TICK_MS) || DEFAULT_TICK_MS;
  void tickPythiaConnectorOnce();
  const timer = setInterval(() => {
    void tickPythiaConnectorOnce();
  }, intervalMs);
  timer.unref?.();
  g.__mnemosynePythiaConnectorLoop = timer;
  console.log(`[pythia-connector] tick loop started (interval ${intervalMs}ms)`);
}
