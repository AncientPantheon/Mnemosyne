import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The versioning gate (see docs/RELEASING.md): every version bump MUST ship a
// matching CHANGELOG entry, so the deployed version can never drift from its docs.
// This test fails if package.json's version isn't the newest CHANGELOG entry.

const root = join(__dirname, "..");

function packageVersion(): string {
  return (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string })
    .version;
}

/** The version of the newest `## [x.y.z]` heading in CHANGELOG.md. */
function latestChangelogVersion(): string | null {
  const md = readFileSync(join(root, "CHANGELOG.md"), "utf8");
  const m = md.match(/^##\s*\[(\d+\.\d+\.\d+)\]/m);
  return m ? m[1] : null;
}

describe("versioning gate — every version is documented", () => {
  it("package.json version is a clean SemVer x.y.z", () => {
    expect(packageVersion()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("the newest CHANGELOG entry matches package.json (bump ⇒ changelog entry)", () => {
    const pkg = packageVersion();
    const changelog = latestChangelogVersion();
    expect(
      changelog,
      "CHANGELOG.md must have a `## [x.y.z]` entry",
    ).not.toBeNull();
    expect(
      changelog,
      `package.json is v${pkg} but the newest CHANGELOG entry is v${changelog} — add a CHANGELOG section for v${pkg} (see docs/RELEASING.md)`,
    ).toBe(pkg);
  });
});
