import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The currently-linked `@ancientpantheon/codex-ui` version, read from the package's
 * own `package.json` so the admin panel's "Update Codex" surface reflects the real
 * installed version — never a hardcoded literal that would drift from the `file:`
 * link. Read directly from the node_modules path (the package's `exports` map does
 * NOT expose `./package.json`, so `require.resolve` of the subpath fails); the
 * `file:` symlink resolves transparently. Returns `"unknown"` if unreadable
 * (defensive; the codex packages are a hard dependency).
 */
export function readCodexUiVersion(): string {
  try {
    const pkgPath = join(
      process.cwd(),
      "node_modules",
      "@ancientpantheon",
      "codex-ui",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "unknown";
  } catch {
    return "unknown";
  }
}
