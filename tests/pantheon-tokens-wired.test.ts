import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract test: the canonical token sheet must be LOADED by the React App
// Router root layout (app/layout.tsx), which every React surface — the landing (`/`),
// /admin, /codex — renders through. If the layout stops referencing
// /assets/pantheon-tokens.css, those surfaces lose every canonical custom property
// (`--maxw`, colours, `--radius`) and silently revert to unstyled/wrong-width UI.
// Computed-style can't be asserted in the node env, so this pins the load contract at
// the source level. (The old static public/index.html landing was retired in v0.7.0 —
// there is now one rendering world, the React app.)

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

const SHEET_HREF = "/assets/pantheon-tokens.css";

describe("canonical token sheet is wired into the React root layout", () => {
  it("app/layout.tsx links the token sheet so every React surface gets the tokens", () => {
    expect(read("app", "layout.tsx")).toContain(SHEET_HREF);
  });
});
