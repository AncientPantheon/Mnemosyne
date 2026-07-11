import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract tests: the admin panel is a client React tree (fetch + hooks)
// and the network wiring imports the browser-only @ancientpantheon/codex packages,
// neither of which can be exercised in a node vitest env without a real browser
// mount. Each assertion pins a concrete regression that would break the panel or
// the operator-Pythia injection path if the wiring were removed. The interactive
// ancient view is owner-verify-in-browser (needs a real hub session).

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("/admin route files", () => {
  it("has the server page + client panel split so the gated UI is behind a client boundary", () => {
    expect(existsSync(join(root, "app", "admin", "page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "admin", "AdminPanel.client.tsx"))).toBe(true);
  });
});

describe("admin panel — the three auth states (REQ-08)", () => {
  const panel = () => read("app", "admin", "AdminPanel.client.tsx");

  it("is a client component (it fetches /api/me and holds interactive state)", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
  });

  it("drives its gate off /api/me so the panel reflects the live session, never a cached one", () => {
    expect(panel()).toMatch(/\/api\/me/);
  });

  it("offers a login link for an anonymous visitor instead of the panel", () => {
    expect(panel()).toMatch(/\/admin\/login/);
  });

  it("shows a not-authorized state for a signed-in non-ancient user (gates the mutations client-side too)", () => {
    expect(panel()).toMatch(/ancient/i);
    expect(panel()).toMatch(/not authorized/i);
  });
});

describe("admin panel — Pythia connector control (REQ-10)", () => {
  const panel = () => read("app", "admin", "AdminPanel.client.tsx");

  it("POSTs the operator gateway to the ancient-gated route", () => {
    expect(panel()).toMatch(/\/api\/admin\/pythia/);
  });

  it("reads the current operator value from the public config endpoint", () => {
    expect(panel()).toMatch(/\/api\/config/);
  });
});

describe("admin panel — Update Codex control (REQ-09, REVIEW M5/M6)", () => {
  const panel = () => read("app", "admin", "AdminPanel.client.tsx");

  it("POSTs to the ancient-gated update-codex route", () => {
    expect(panel()).toMatch(/\/api\/admin\/update-codex/);
  });

  it("surfaces the current codex-ui version passed from the server page", () => {
    expect(read("app", "admin", "page.tsx")).toMatch(/readCodexUiVersion/);
    expect(panel()).toMatch(/codexVersion/);
  });
});

describe("admin panel — network surfacing (REQ-11)", () => {
  it("shows StoaChain as live and Arweave as not-yet-verified", () => {
    const panel = read("app", "admin", "AdminPanel.client.tsx");
    expect(panel).toMatch(/StoaChain/);
    expect(panel).toMatch(/Arweave/);
    expect(panel).toMatch(/not[- ]yet[- ]verified/i);
  });
});

describe("operator Pythia injection into the codex mount (REQ-10 wiring)", () => {
  it("resolveNetworkModel takes an operator Pythia URL that wins over the per-user field", () => {
    const ns = read("app", "codex", "networkSettings.ts");
    expect(ns).toMatch(/effectivePythiaUrl/);
    expect(ns).toMatch(/operatorPythiaUrl/);
  });

  it("the codex Dashboard fetches the operator /api/config value at mount and feeds it to the model", () => {
    const app = read("app", "codex", "CodexApp.tsx");
    expect(app).toMatch(/fetchOperatorPythiaUrl/);
    expect(app).toMatch(/operatorPythiaUrl/);
  });

  it("fetchOperatorPythiaUrl reads the public /api/config endpoint", () => {
    expect(read("lib", "pythiaUrl.ts")).toMatch(/\/api\/config/);
  });
});
