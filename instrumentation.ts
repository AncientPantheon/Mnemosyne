/**
 * Next.js server instrumentation — the Khronoton heartbeat.
 *
 * `register()` runs ONCE when the Next server boots (dev and standalone alike).
 * It starts the Khronoton tick loop (`startKhronotonLoop`), which every
 * `tickIntervalMs` claims due cronotons (atomic claim-before-fire — exactly-once)
 * and fires them signed by the sealed operator codex, no human in the loop. This
 * is what makes Mnemosyne an Automaton rather than a human-triggered Daimon.
 *
 * Guards:
 *  - nodejs runtime only, and the import MUST sit inside the `if` block: Next
 *    compiles this file for the edge runtime too, where `NEXT_RUNTIME` is a
 *    compile-time constant — the wrapped branch is dead code there, so webpack
 *    drops the whole node-only engine graph (better-sqlite3, node:crypto,
 *    @stoachain/*) from the edge bundle. An early return would NOT do that.
 *  - `KHRONOTON_DISABLED=1` — operator kill switch, loop never starts.
 *  - a `globalThis` flag (in lib/khronoton/register.ts) so dev-mode re-imports
 *    never stack a second loop.
 *
 * An un-initialized codex is fine: context creation touches no key material; a
 * fire for a key the codex doesn't hold fails structurally (recorded in the fire
 * history + audit trail) and the loop keeps ticking.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.KHRONOTON_DISABLED === "1") {
      console.log("[khronoton] loop disabled (KHRONOTON_DISABLED=1)");
      return;
    }
    const { startKhronotonEngine } = await import("./lib/khronoton/register");
    await startKhronotonEngine();
  }
}
