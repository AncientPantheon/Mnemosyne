import { startKhronotonLoop } from "@ancientpantheon/khronoton-core/server";

import { getKhronotonContext } from "./context";

/**
 * Node-side engine start, dynamically imported by instrumentation.ts from inside
 * its `NEXT_RUNTIME === "nodejs"` branch — the if-WRAP (not an early return) is
 * what lets webpack drop this whole node-only graph (better-sqlite3, node:crypto,
 * @stoachain/*) from the edge instrumentation compile as dead code.
 */

const g = globalThis as unknown as { __mnemosyneKhronotonLoop?: { stop(): void } };

export async function startKhronotonEngine(): Promise<void> {
  if (g.__mnemosyneKhronotonLoop) return;
  try {
    const ctx = await getKhronotonContext();
    g.__mnemosyneKhronotonLoop = startKhronotonLoop(ctx);
    console.log(
      `[khronoton] tick loop started (interval ${ctx.config.tickIntervalMs}ms, db in ` +
        `${process.env.MNEMOSYNE_KHRONOTON_DIR || "data/khronoton"})`,
    );
  } catch (err) {
    // A failed engine start must never take the whole app down — the admin site
    // (and the rest of Mnemosyne) still serves; the operator sees this in the logs.
    console.error("[khronoton] tick loop FAILED to start:", err);
  }
}
