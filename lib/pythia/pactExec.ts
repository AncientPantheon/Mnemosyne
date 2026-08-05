// Server-safe (no "use client") helper shared by the browser codex signing
// clients and the server-side Khronoton runtime wrapper: pull the Pact `exec`
// `{ code, data }` out of a built/signed command so it can be simulated through
// Pythia's keyless `/read` (a Pact `local`), instead of a direct-node `/local`.

/** Accepts a `{cmd:"<json>",…}` envelope, a raw JSON string, or an already-parsed
 *  command object. Returns `{ code, data? }` (empty `code` if unparseable). */
export function extractExec(cmd: unknown): { code: string; data?: object } {
  let parsed: unknown = cmd;
  const envelope = (cmd ?? {}) as { cmd?: unknown };
  if (typeof envelope.cmd === "string") {
    try {
      parsed = JSON.parse(envelope.cmd);
    } catch {
      /* leave `parsed` as-is */
    }
  } else if (typeof cmd === "string") {
    try {
      parsed = JSON.parse(cmd);
    } catch {
      /* leave `parsed` as-is */
    }
  }
  const holder = (parsed ?? {}) as { payload?: { exec?: unknown }; exec?: unknown };
  const exec = (holder.payload?.exec ?? holder.exec ?? {}) as { code?: unknown; data?: unknown };
  return {
    code: typeof exec.code === "string" ? exec.code : "",
    ...(exec.data && typeof exec.data === "object" ? { data: exec.data as object } : {}),
  };
}
