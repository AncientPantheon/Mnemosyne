import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The currently-installed `@ancientpantheon/codex` version, read from the package's
 * own `package.json` so the admin panel's "Update Codex" surface reflects the real
 * installed version — never a hardcoded literal that would drift from the npm pin.
 * Read directly from the node_modules path (the package's `exports` map does NOT
 * expose `./package.json`, so `require.resolve` of the subpath fails). Returns
 * `"unknown"` if unreadable (defensive; the codex aggregate is a hard dependency).
 */
export function readCodexUiVersion(): string {
  try {
    const pkgPath = join(
      process.cwd(),
      "node_modules",
      "@ancientpantheon",
      "codex",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}

/** The npm package Mnemosyne pulls the whole Codex from (same as the puller). */
const CODEX_PACKAGE = "@ancientpantheon/codex";

/**
 * The latest `@ancientpantheon/codex` version PUBLISHED on the npm registry, read
 * from the package's `dist-tags.latest`. Returns `null` on any failure (offline,
 * registry down, package missing) so the caller can degrade to "installed only"
 * rather than crash. Uses the abbreviated-packument accept header for a small
 * response. Not cached — this is a live "is there an update?" check.
 */
export async function fetchLatestCodexVersion(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${CODEX_PACKAGE}`, {
      headers: { accept: "application/vnd.npm.install-v1+json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { "dist-tags"?: { latest?: string } };
    const latest = body["dist-tags"]?.latest;
    return typeof latest === "string" && latest.length > 0 ? latest : null;
  } catch {
    return null;
  }
}

/**
 * True when `available` is a strictly newer semver than `installed` (numeric
 * per-segment compare: 0.10.0 > 0.9.0). Non-numeric/pre-release segments coerce to
 * 0 — good enough to flag "an update exists"; the pull itself always installs
 * `@latest` regardless.
 */
export function isNewerVersion(available: string, installed: string): boolean {
  const parse = (v: string): number[] => v.split(/[.\-+]/).map((p) => Number(p) || 0);
  const a = parse(available);
  const b = parse(installed);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}
