import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The running Mnemosyne app version, read from the deployed `package.json` — the same
 * single source of truth the landing header (`app/route.ts`) uses. Returns `"0.0.0"`
 * if unreadable (defensive). This is the "installed" side of the Deploy panel's
 * Mnemosyne row.
 */
export function readMnemosyneVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { version?: string };
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Repo + branch a Deploy pulls from (the on-box deployer `git pull`s this branch). */
const REPO_SLUG = process.env.MNEMOSYNE_REPO_SLUG ?? "AncientPantheon/Mnemosyne";
const REPO_BRANCH = process.env.MNEMOSYNE_REPO_BRANCH ?? "main";

/**
 * The Mnemosyne version on the repo's deploy branch — i.e. what a Deploy would build,
 * since the on-box deployer `git pull`s `main` before rebuilding. Read from the raw
 * `package.json` on GitHub (public repo, no token), mirroring how constructors read
 * their latest from npm. Returns `null` on any failure (offline, repo/branch missing).
 * Not cached by us; GitHub's raw CDN may lag a fresh push by up to ~5 min.
 */
export async function fetchLatestMnemosyneVersion(): Promise<string | null> {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_BRANCH}/package.json`,
      { cache: "no-store", headers: { accept: "application/json" } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: string };
    return typeof body.version === "string" && body.version.length > 0
      ? body.version
      : null;
  } catch {
    return null;
  }
}
