import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract test: the canonical token sheet must be LOADED in both
// rendering worlds — the static marketing landing (public/index.html) and the
// React App Router root layout (app/layout.tsx). If either document stops
// referencing /assets/pantheon-tokens.css, that surface loses every canonical
// custom property (`--maxw`, colours, `--radius`) and silently reverts to
// unstyled/wrong-width UI. Computed-style can't be asserted in the node env, so
// this pins the load contract at the source level instead.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

const SHEET_HREF = "/assets/pantheon-tokens.css";

describe("canonical token sheet is wired into both rendering worlds", () => {
  it("the static landing (public/index.html) links the token sheet", () => {
    const html = read("public", "index.html");
    expect(html).toContain(SHEET_HREF);
  });

  it("the React root layout (app/layout.tsx) links the token sheet", () => {
    const tsx = read("app", "layout.tsx");
    expect(tsx).toContain(SHEET_HREF);
  });

  it("loads the token sheet BEFORE the landing's other stylesheets, so tokens cascade first", () => {
    const html = read("public", "index.html");
    const tokenIdx = html.indexOf(SHEET_HREF);
    const stylesIdx = html.indexOf("/assets/styles.css");
    expect(tokenIdx).toBeGreaterThanOrEqual(0);
    expect(stylesIdx).toBeGreaterThanOrEqual(0);
    expect(tokenIdx).toBeLessThan(stylesIdx);
  });
});
