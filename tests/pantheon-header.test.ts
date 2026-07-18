import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract for the ONE shared Pantheonic header. The component mounts a browser
// tree (useMe → fetch), untestable in this node-env vitest, so each assertion pins a
// concrete regression in the header's contract: a lost full-width separator, an
// identity block that stops gating the Admin link on `ancient`, an admin variant that
// grows L2/L3, or markup that injects hub-supplied strings as HTML.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("PantheonHeader — the shared 3-level header", () => {
  const src = () => read("components", "PantheonHeader.tsx");
  const css = () => read("components", "pantheon-header.css");

  it("is a client component driven by the single useMe source", () => {
    expect(src()).toMatch(/^["']use client["'];?/m);
    expect(src()).toMatch(/from ["'][^"']*useMe["']/);
  });

  it("renders the identity block via text nodes, never injected HTML", () => {
    expect(src()).not.toMatch(/dangerouslySetInnerHTML/);
    expect(src()).toMatch(/\/admin\/login/); // signed-out CTA
    expect(src()).toMatch(/\/admin\/logout/); // signed-in log out
  });

  it("gates the Admin link on the ancient role", () => {
    expect(src()).toMatch(/roles[^\n]*includes\(["']ancient["']\)|isAncient/);
    expect(src()).toMatch(/aria-disabled/); // non-ancient gets the disabled chip
  });

  it("holds the identity block until /api/me resolves (no wrong-state flash)", () => {
    // While `me` is null the identity area must render nothing.
    expect(src()).toMatch(/me === null|me == null|!me\b|me\s*\?\s*/);
  });

  it("admin variant is L1-only — the L2 and L3 rows are each guarded by variant === 'full'", () => {
    // Couple the guard to each row: a regression that drops the `variant === "full"`
    // guard on either the L2 or L3 block (letting the admin variant emit tier nav)
    // breaks the corresponding match — the className must be reachable only under it.
    const s = src();
    expect(s).toMatch(/variant === ["']full["'][\s\S]{0,140}className=["']ph-l2["']/);
    expect(s).toMatch(/variant === ["']full["'][\s\S]{0,140}className=["']ph-l3["']/);
  });

  it("carries a full-chrome-width separator (border on .ph, not .ph-inner)", () => {
    const c = css();
    const phBlock = c.match(/\.ph\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(phBlock).toMatch(/border-bottom/);
    const innerBlock = c.match(/\.ph-inner\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(innerBlock).not.toMatch(/border-bottom/);
  });
});
