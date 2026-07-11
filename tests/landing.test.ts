import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GET } from "../app/route";

const publicDir = join(process.cwd(), "public");

describe("landing route", () => {
  it("responds 200 with an HTML content-type so the marketing page is the app root", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("exposes a Launch Codex CTA wired to /codex so operators can reach the Codex mount", async () => {
    const html = await (await GET()).text();
    // href precedes the visible label in the injected anchor
    expect(html).toMatch(/href="\/codex"[\s\S]{0,120}Launch Codex/i);
  });

  it("preserves the Mnemosyne brand markup so the folded page is the real landing", async () => {
    const html = await (await GET()).text();
    expect(html).toContain('class="brand-lambda"');
    expect(html).toContain("nemosyne");
  });

  it("exposes a Login with AncientHub entry wired to /admin/login so operators can sign in", async () => {
    const html = await (await GET()).text();
    // href precedes the visible label in the nav anchor.
    expect(html).toMatch(/href="\/admin\/login"[\s\S]{0,160}Login with AncientHub/i);
  });

  it("preserves the original CDN-Tailwind styling pipeline (fonts + config + stylesheet)", async () => {
    const html = await (await GET()).text();
    expect(html).toContain("https://cdn.tailwindcss.com");
    expect(html).toContain('href="/assets/styles.css"');
    expect(html).toContain("Cinzel");
  });
});

describe("folded marketing assets", () => {
  it("serves the doc index and shared stylesheet from public so intra-site links resolve", () => {
    expect(existsSync(join(publicDir, "docs", "index.html"))).toBe(true);
    expect(existsSync(join(publicDir, "assets", "styles.css"))).toBe(true);
  });

  it("keeps the doc pages pointing at the shared stylesheet (styling preserved verbatim)", () => {
    const docIndex = readFileSync(join(publicDir, "docs", "index.html"), "utf8");
    expect(docIndex).toContain('href="/assets/styles.css"');
  });
});
