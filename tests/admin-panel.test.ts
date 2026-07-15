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

describe("admin — Update Constructors: single Deploy button (REQ-09, REVIEW M5/M6)", () => {
  const panel = () =>
    read("app", "admin", "update-constructors", "UpdateConstructorsPage.client.tsx");

  it("is a client component behind the shared gate", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).toMatch(/AdminGate/);
  });

  it("is ONE unified Deploy panel — the two separate updater sections are gone", () => {
    expect(panel()).toMatch(/DeployPanel/);
    // The old per-constructor buttons/sections must not come back.
    expect(panel()).not.toMatch(/UpdateCodexSection/);
    expect(panel()).not.toMatch(/UpdateKhronotonSection/);
  });

  it("triggers the deploy + streams progress via the ancient-gated deploy routes", () => {
    expect(panel()).toMatch(/\/api\/admin\/deploy/);
    expect(panel()).toMatch(/\/api\/admin\/deploy\/stream\//);
    expect(panel()).toMatch(/EventSource/);
  });

  it("reads all constructor versions from /api/admin/deploy (no server-passed version prop)", () => {
    // The page no longer reads a version server-side; the client fetches the whole
    // constructors status (installed vs npm-latest) from the deploy status endpoint.
    expect(read("app", "admin", "update-constructors", "page.tsx")).not.toMatch(
      /readCodexUiVersion/,
    );
    expect(panel()).toMatch(/anyUpdateAvailable/);
  });

  it("renders each constructor as a data-driven version row (no redundant coming-soon card)", () => {
    // The row itself is data-driven (VersionRow reads `wired`/`installed` from the
    // deploy status), so the panel source no longer hardcodes a Khronoton state.
    expect(panel()).toMatch(/VersionRow/);
    expect(panel()).toMatch(/status\.constructors\.map/);
    expect(panel()).not.toMatch(/coming soon/i);
    expect(panel()).not.toMatch(/KhronotonPreview/);
  });

  it("notes Khronoton is installed but its autonomous engine is Pythia-gated", () => {
    // Khronoton is now a wired dependency (it deploys with Mnemosyne), but the
    // autonomous codex-signing engine is a separate, still-gated wire-in.
    expect(panel()).toMatch(/installed/i);
    expect(panel()).toMatch(/not\s+switched\s+on|autonomous engine/i);
    expect(panel()).toMatch(/Pythia/);
  });

  it("shows Mnemosyne itself as its own version row (app build vs deploy branch)", () => {
    expect(panel()).toMatch(/Mnemosyne/);
    expect(panel()).toMatch(/the automaton/);
    expect(panel()).toMatch(/VersionRow/);
    expect(panel()).toMatch(/status\.mnemosyne/);
  });
});

describe("deploy status — the app is a first-class deploy target (source contract)", () => {
  it("reads the running app version + the version on the deploy branch (GitHub raw)", () => {
    const av = read("lib", "appVersion.ts");
    expect(av).toMatch(/readMnemosyneVersion/);
    expect(av).toMatch(/fetchLatestMnemosyneVersion/);
    expect(av).toMatch(/raw\.githubusercontent\.com/);
  });

  it("folds an app update into anyUpdateAvailable so a code-only change lights the button", () => {
    const lib = read("lib", "deploy", "constructors.ts");
    expect(lib).toMatch(/mnemosyne/);
    expect(lib).toMatch(/fetchLatestMnemosyneVersion/);
    expect(lib).toMatch(/mnemosyne\.updateAvailable\s*\|\|/);
  });
});

describe("deploy pipeline — spool + status routes (source contract)", () => {
  it("the trigger route is ancient-gated and branches dev-pull vs host-signal by deployMode", () => {
    const route = read("app", "api", "admin", "deploy", "route.ts");
    expect(route).toMatch(/requireAncient/);
    expect(route).toMatch(/deployRequestPath/); // live: signal the host deployer
    expect(route).toMatch(/startDevDeploy/); // dev: pull @latest in-process
  });

  it("the SSE stream route is ancient-gated and validates the deploy id (traversal guard)", () => {
    const route = read("app", "api", "admin", "deploy", "stream", "[id]", "route.ts");
    expect(route).toMatch(/requireAncient/);
    expect(route).toMatch(/isValidDeployId/);
    expect(route).toMatch(/text\/event-stream/);
  });

  it("ships the host-side blue-green deployer + systemd watcher units", () => {
    for (const f of [
      "mnemosyne-deploy.sh",
      "mnemosyne-deploy-scan.sh",
      "mnemosyne-deploy.path",
      "mnemosyne-deploy.service",
      "install-host-deployer.sh",
    ]) {
      expect(existsSync(join(root, "deploy", "host", f))).toBe(true);
    }
  });
});

describe("admin — Mnemosyne Khronoton (mockup embed, handoff 04)", () => {
  const panel = () => read("app", "admin", "khronoton", "KhronotonPage.client.tsx");

  it("is a client component behind the shared gate", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).toMatch(/AdminGate/);
  });

  it("frames the static UI mockup inline via iframe (visual review, not live wiring)", () => {
    expect(panel()).toMatch(/Autonomous transactions/);
    expect(panel()).toMatch(/<iframe/);
    expect(panel()).toMatch(/\/khronoton-mockup\.html/);
  });

  it("is explicit that it is NOT wired to the live engine (gated on handoff 05)", () => {
    expect(panel()).toMatch(/[Nn]ot yet wired|not wired/);
    expect(panel()).toMatch(/05-khronoton-engine-wire-in\.md/);
  });

  it("ships the self-contained mockup as a public asset", () => {
    expect(existsSync(join(root, "public", "khronoton-mockup.html"))).toBe(true);
  });
});

describe("/api/admin/khronoton-version — ancient-gated scaffold (source contract)", () => {
  const route = () => read("app", "api", "admin", "khronoton-version", "route.ts");

  it("is ancient-gated like the codex-version route", () => {
    expect(route()).toMatch(/requireAncient/);
  });

  it("reports wired:true (Khronoton is now a dependency) and reads the installed version", () => {
    expect(route()).toMatch(/wired:\s*true/);
    expect(route()).toMatch(/readKhronotonUiVersion/);
    expect(route()).toMatch(/updateAvailable/);
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
