/**
 * Pythia gateway URL helpers — shared by the ancient admin route (validation),
 * the public `/api/config` reader, and the codex mount's global-connection seam.
 *
 * The operator-set Pythia URL is injected into EVERY Mnemosyne user's Codex as the
 * `global` connection, so it is validated (only http/https, a real URL) before it
 * is ever persisted or served. This module carries only endpoint URLs — never keys.
 */

/**
 * Validate + normalize a non-empty Pythia gateway URL. Returns the trimmed URL for
 * an http/https URL, or `null` for anything else (empty, non-URL, or a non-fetch
 * scheme like `javascript:`/`ftp:`). Empty input is `null` here — the CALLER treats
 * an empty submission as an explicit "clear", not as an invalid URL.
 */
export function normalizePythiaUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return trimmed;
}

/**
 * The effective Pythia gateway for the Codex `global` connection. The operator-set
 * value is GLOBAL (injected for all users) and takes precedence; the per-user field
 * only applies when no operator global is set. Both empty ⇒ no global (both chains
 * resolve local).
 */
export function effectivePythiaUrl(
  operatorUrl: string,
  userUrl: string,
): string {
  const operator = operatorUrl.trim();
  if (operator) return operator;
  return userUrl.trim();
}

/**
 * Fetch the operator-injected Pythia gateway from the public `/api/config` endpoint
 * (URLs only, no-store). Runs in the browser at codex mount; guarded to `""` on any
 * failure so a missing/unreachable config never blocks the codex from loading.
 */
export async function fetchOperatorPythiaUrl(): Promise<string> {
  try {
    const res = await fetch("/api/config", { cache: "no-store" });
    if (!res.ok) return "";
    const body = (await res.json()) as { pythiaUrl?: unknown };
    return typeof body.pythiaUrl === "string" ? body.pythiaUrl : "";
  } catch {
    return "";
  }
}
