import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The v0.7.0 migration moved the marketing landing to a React route at `/` (app/page.tsx),
// leaving the old static `public/index.html` orphaned. These pin the cleanup: the doc
// pages must link HOME to the new landing (`/`), not the retired `/index.html`, and the
// orphan itself must be gone — otherwise a "home" click from any doc drops the reader on a
// stale duplicate landing (still carrying the Tailwind CDN).

const root = process.cwd();
const docsDir = join(root, "public", "docs");
const docFiles = (): string[] =>
  readdirSync(docsDir).filter((f) => f.endsWith(".html"));

describe("docs home links point at the live landing", () => {
  it("no doc page links to the retired /index.html", () => {
    for (const f of docFiles()) {
      const html = readFileSync(join(docsDir, f), "utf8");
      expect(html, `${f} still links to /index.html`).not.toMatch(/href="\/index\.html/);
    }
  });

  it("the orphaned static landing public/index.html is removed", () => {
    expect(existsSync(join(root, "public", "index.html"))).toBe(false);
  });
});
