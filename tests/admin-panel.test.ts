import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract tests: the admin panel is a Hub-style set of ancient-gated client
// React trees (fetch + hooks) and the network wiring imports the browser-only
// @ancientpantheon/codex packages, neither of which can be exercised in a node vitest
// env without a real browser mount. Each assertion pins a concrete regression that
// would break a panel page or the operator-Pythia injection path if the wiring were
// removed. The interactive ancient view is owner-verify-in-browser (needs a real hub
// session).
//
// The admin surface is now a landing (a list of entry tiles) + one dedicated page per
// function, each wrapping its section in the shared <AdminGate>. The gate — not each
// section — owns the three auth states.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("/admin route files", () => {
  it("has the server landing page + client landing so the gated UI is behind a client boundary", () => {
    expect(existsSync(join(root, "app", "admin", "page.tsx"))).toBe(true);
    expect(existsSync(join(root, "app", "admin", "AdminLanding.client.tsx"))).toBe(true);
  });

  it("has a shared client gate the pages reuse", () => {
    expect(existsSync(join(root, "app", "admin", "AdminGate.client.tsx"))).toBe(true);
    expect(read("app", "admin", "AdminGate.client.tsx")).toMatch(/^["']use client["'];?/m);
  });

  it("gives each function its own dedicated sub-page (Hub-style)", () => {
    for (const dir of [
      "pythia",
      "update-constructors",
      "khronoton",
      "security",
      "network",
    ]) {
      expect(existsSync(join(root, "app", "admin", dir, "page.tsx"))).toBe(true);
    }
  });

  it("has retired the standalone update-codex page (merged into update-constructors)", () => {
    expect(existsSync(join(root, "app", "admin", "update-codex"))).toBe(false);
  });

  it("lists every sub-page as an entry tile on the landing", () => {
    const landing = read("app", "admin", "AdminLanding.client.tsx");
    for (const href of [
      "/admin/codex",
      "/admin/update-constructors",
      "/admin/khronoton",
      "/admin/pythia",
      "/admin/security",
      "/admin/network",
    ]) {
      expect(landing).toMatch(new RegExp(href.replace(/\//g, "\\/")));
    }
  });

  it("surfaces the two new automaton-constructor tiles on the landing", () => {
    const landing = read("app", "admin", "AdminLanding.client.tsx");
    expect(landing).toMatch(/Update Constructors/);
    expect(landing).toMatch(/Mnemosyne Khronoton/);
  });
});

describe("admin gate — the three auth states (REQ-08)", () => {
  const gate = () => read("app", "admin", "AdminGate.client.tsx");

  it("is a client component (it fetches /api/me and holds interactive state)", () => {
    expect(gate()).toMatch(/^["']use client["'];?/m);
  });

  it("drives its gate off /api/me so the panel reflects the live session, never a cached one", () => {
    expect(gate()).toMatch(/\/api\/me/);
  });

  it("offers a login link for an anonymous visitor instead of the panel", () => {
    expect(gate()).toMatch(/\/admin\/login/);
  });

  it("shows a not-authorized state for a signed-in non-ancient user (gates the mutations client-side too)", () => {
    expect(gate()).toMatch(/ancient/i);
    expect(gate()).toMatch(/not authorized/i);
  });
});

describe("admin — Pythia connector control (REQ-10)", () => {
  const panel = () => read("app", "admin", "pythia", "PythiaPage.client.tsx");

  it("is a client component behind the shared gate", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).toMatch(/AdminGate/);
  });

  it("POSTs the operator gateway to the ancient-gated route", () => {
    expect(panel()).toMatch(/\/api\/admin\/pythia/);
  });

  it("reads the current operator value from the public config endpoint", () => {
    expect(panel()).toMatch(/\/api\/config/);
  });
});

describe("admin — Update Constructors control (REQ-09, REVIEW M5/M6)", () => {
  const panel = () =>
    read("app", "admin", "update-constructors", "UpdateConstructorsPage.client.tsx");

  it("is a client component behind the shared gate", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).toMatch(/AdminGate/);
  });

  it("bundles both the codex and khronoton updater sections", () => {
    expect(panel()).toMatch(/UpdateCodexSection/);
    expect(panel()).toMatch(/UpdateKhronotonSection/);
  });

  it("POSTs to the ancient-gated update-codex route (moved verbatim)", () => {
    expect(panel()).toMatch(/\/api\/admin\/update-codex/);
  });

  it("surfaces the current codex-ui version passed from the server page", () => {
    expect(read("app", "admin", "update-constructors", "page.tsx")).toMatch(
      /readCodexUiVersion/,
    );
    expect(panel()).toMatch(/codexVersion/);
  });

  it("scaffolds the Khronoton updater against the new version endpoint, disabled until wired", () => {
    expect(panel()).toMatch(/\/api\/admin\/khronoton-version/);
    expect(panel()).toMatch(/@ancientpantheon\/khronoton-core/);
    expect(panel()).toMatch(/Khronoton not yet wired/);
    expect(panel()).toMatch(/03-khronoton-automaton-package\.md/);
  });
});

describe("admin — Mnemosyne Khronoton scaffold (autonomous transactions)", () => {
  const panel = () => read("app", "admin", "khronoton", "KhronotonPage.client.tsx");

  it("is a client component behind the shared gate", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).toMatch(/AdminGate/);
  });

  it("presents an on-brand coming-soon placeholder that references the handoff", () => {
    expect(panel()).toMatch(/Autonomous transactions/);
    expect(panel()).toMatch(/Coming soon/);
    expect(panel()).toMatch(/Pantheonic Automaton/);
    expect(panel()).toMatch(/03-khronoton-automaton-package\.md/);
  });

  it("disables the new-scheduled-transaction action until the package is wired", () => {
    expect(panel()).toMatch(/New scheduled transaction/);
    expect(panel()).toMatch(/Available once the Khronoton package is wired/);
  });
});

describe("/api/admin/khronoton-version — ancient-gated scaffold (source contract)", () => {
  const route = () => read("app", "api", "admin", "khronoton-version", "route.ts");

  it("is ancient-gated like the codex-version route", () => {
    expect(route()).toMatch(/requireAncient/);
  });

  it("reports wired:false (Khronoton is not yet a dependency)", () => {
    expect(route()).toMatch(/wired:\s*false/);
    expect(route()).toMatch(/not wired/);
  });
});

describe("admin — Codex Security control (master-key rotation)", () => {
  const panel = () => read("app", "admin", "security", "SecurityPage.client.tsx");

  it("is a client component behind the shared gate", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).toMatch(/AdminGate/);
  });

  it("reads master-key + codex status and rotates through the ancient-gated route", () => {
    expect(panel()).toMatch(/\/api\/admin\/security\/rotate-master-key/);
  });

  it("requires the export-backup acknowledgement before enabling rotation (irreversible)", () => {
    // The POST must carry acknowledgedExport:true and the button must gate on the ack.
    expect(panel()).toMatch(/acknowledgedExport/);
    expect(panel()).toMatch(/!acknowledged/);
    expect(panel()).toMatch(/irreversible/i);
  });
});

describe("admin — network surfacing (REQ-11)", () => {
  const panel = () => read("app", "admin", "network", "NetworkPage.client.tsx");

  it("shows StoaChain as live and Arweave as not-yet-verified", () => {
    expect(panel()).toMatch(/StoaChain/);
    expect(panel()).toMatch(/Arweave/);
    expect(panel()).toMatch(/not[- ]yet[- ]verified/i);
  });
});

describe("operator Pythia injection into the codex mount (REQ-10 wiring)", () => {
  it("resolveNetworkModel takes an operator Pythia URL that wins over the per-user field", () => {
    const ns = read("app", "codex", "networkSettings.ts");
    expect(ns).toMatch(/effectivePythiaUrl/);
    expect(ns).toMatch(/operatorPythiaUrl/);
  });

  it("the codex shell fetches the operator /api/config value at mount and feeds it to the model", () => {
    // The network wiring lives in the shared CodexShell (both /codex + /admin/codex).
    const shell = read("app", "codex", "CodexShell.tsx");
    expect(shell).toMatch(/fetchOperatorPythiaUrl/);
    expect(shell).toMatch(/operatorPythiaUrl/);
  });

  it("fetchOperatorPythiaUrl reads the public /api/config endpoint", () => {
    expect(read("lib", "pythiaUrl.ts")).toMatch(/\/api\/config/);
  });
});
