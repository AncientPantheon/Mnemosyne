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
// The admin surface is now a single sidebar + content-pane shell (AdminShell) behind
// ONE shared <AdminGate>, hash-routed (/admin#<section>). The gate owns the auth
// states; sections are gate-free panes driven by the static adminSections config.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("/admin route files — sidebar + content-pane shell", () => {
  it("the admin page mounts AdminShell behind the shared AdminGate", () => {
    const page = read("app", "admin", "page.tsx");
    expect(page).toMatch(/AdminShell/);
    expect(page).toMatch(/AdminGate/);
  });

  it("has a shared client gate + a client shell", () => {
    expect(read("app", "admin", "AdminGate.client.tsx")).toMatch(/^["']use client["'];?/m);
    expect(read("app", "admin", "AdminShell.client.tsx")).toMatch(/^["']use client["'];?/m);
  });

  it("has retired the tile-list landing (AdminLanding)", () => {
    expect(existsSync(join(root, "app", "admin", "AdminLanding.client.tsx"))).toBe(false);
  });

  it("drives the sidebar off the static section config — all six sections", () => {
    const cfg = read("app", "admin", "adminSections.ts");
    for (const id of [
      "codex",
      "update-deploy",
      "khronoton",
      "pythia",
      "security",
      "network",
    ]) {
      expect(cfg).toMatch(new RegExp(`hash:\\s*["']${id}["']`));
    }
  });

  it("keeps the two automaton-constructor sections (Update & Deploy, Khronoton)", () => {
    const cfg = read("app", "admin", "adminSections.ts");
    expect(cfg).toMatch(/Update & Deploy/);
    expect(cfg).toMatch(/Mnemosyne Khronoton/);
  });

  it("redirects the old per-function routes into the hash-routed shell", () => {
    for (const dir of [
      "pythia",
      "update-deploy",
      "khronoton",
      "security",
      "network",
      "codex",
    ]) {
      expect(read("app", "admin", dir, "page.tsx")).toMatch(
        new RegExp(`/admin#${dir}`),
      );
    }
  });

  it("has retired the standalone update-codex page (merged into update-deploy)", () => {
    expect(existsSync(join(root, "app", "admin", "update-codex"))).toBe(false);
  });
});

describe("admin gate — the three auth states (REQ-08)", () => {
  const gate = () => read("app", "admin", "AdminGate.client.tsx");

  it("is a client component (it fetches /api/me and holds interactive state)", () => {
    expect(gate()).toMatch(/^["']use client["'];?/m);
  });

  it("drives its gate off the shared useMe source (which reads /api/me no-store), never a cached one", () => {
    // Session now comes from the single useMe hook; its no-store fetch is pinned in
    // tests/useMe.test.ts. The gate must consume that source, not re-fetch bespoke.
    expect(gate()).toMatch(/useMe/);
  });

  it("offers a login link for an anonymous visitor instead of the panel", () => {
    expect(gate()).toMatch(/\/admin\/login/);
  });

  it("shows a not-authorized state for a signed-in non-ancient user (gates the mutations client-side too)", () => {
    expect(gate()).toMatch(/ancient/i);
    expect(gate()).toMatch(/not authorized/i);
  });

  it("wears the shared Pantheonic header (admin variant) and the single useMe source", () => {
    // The gate must use the ONE shared header + identity source, not a bespoke
    // .mnemo-admin-header / AuthStatus / its own /api/me fetch.
    expect(gate()).toMatch(/PantheonHeader/);
    expect(gate()).toMatch(/variant=["']admin["']/);
    expect(gate()).toMatch(/useMe/);
    expect(gate()).not.toMatch(/AuthStatus/);
    expect(gate()).not.toMatch(/mnemo-admin-header/);
  });
});

describe("admin — Pythia connector control (REQ-10)", () => {
  const panel = () => read("app", "admin", "pythia", "PythiaPage.client.tsx");

  it("is a gate-free pane body — gated by the shell, not itself", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).not.toMatch(/AdminGate/);
  });

  it("POSTs the operator gateway to the ancient-gated route", () => {
    expect(panel()).toMatch(/\/api\/admin\/pythia/);
  });

  it("reads the current operator value from the public config endpoint", () => {
    expect(panel()).toMatch(/\/api\/config/);
  });
});

describe("admin — Update & Deploy: single Deploy button (REQ-09, REVIEW M5/M6)", () => {
  const panel = () =>
    read("app", "admin", "update-deploy", "UpdateDeployPage.client.tsx");

  it("is a gate-free pane body — gated by the shell, not itself", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).not.toMatch(/AdminGate/);
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
    expect(read("app", "admin", "update-deploy", "page.tsx")).not.toMatch(
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

  it("notes Khronoton is installed AND its autonomous engine is live", () => {
    // The engine wire-in landed (handoff 05): the tick loop runs in the server and
    // signs with the sealed operator codex — the panel says so, plainly.
    expect(panel()).toMatch(/installed/i);
    expect(panel()).toMatch(/autonomous engine/i);
    expect(panel()).toMatch(/live/);
    expect(panel()).not.toMatch(/not\s+switched\s+on/i);
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

describe("admin — Mnemosyne Khronoton (LIVE engine console, handoff 05)", () => {
  const mount = () => read("app", "admin", "khronoton", "KhronotonPage.client.tsx");
  const app = () => read("app", "admin", "khronoton", "KhronotonApp.tsx");

  it("is a gate-free pane body, mounted ssr:false (pollers)", () => {
    expect(mount()).toMatch(/^["']use client["'];?/m);
    expect(mount()).not.toMatch(/AdminGate/);
    expect(mount()).toMatch(/ssr:\s*false/);
  });

  it("mounts the REAL package UI over the ancient-gated API (no iframe, no mockup)", () => {
    expect(app()).toMatch(/KhronotonProvider/);
    expect(app()).toMatch(/createFetchAdapter\(["']\/api\/admin\/khronoton["']\)/);
    expect(app()).toMatch(/KhronotonUiRoot/);
    expect(app()).toMatch(/khronoton-core\/ui\.css/);
    expect(mount()).not.toMatch(/<iframe/);
    expect(app()).not.toMatch(/<iframe/);
  });

  it("wires the three screens through the router-agnostic callbacks", () => {
    expect(app()).toMatch(/CronotonList/);
    expect(app()).toMatch(/Detail/);
    expect(app()).toMatch(/Builder/);
    expect(app()).toMatch(/onNeedConfirm/);
  });

  it("has retired the static mockup asset", () => {
    expect(existsSync(join(root, "public", "khronoton-mockup.html"))).toBe(false);
  });
});

describe("khronoton engine — loop + API adapter (source contract)", () => {
  it("instrumentation starts the tick loop with the kill switch + nodejs guard", () => {
    const inst = read("instrumentation.ts");
    expect(inst).toMatch(/startKhronotonLoop/);
    expect(inst).toMatch(/KHRONOTON_DISABLED/);
    expect(inst).toMatch(/NEXT_RUNTIME/);
  });

  it("the catch-all route is ancient-gated, Node-runtime, and confirm-header aware", () => {
    const route = read("app", "api", "admin", "khronoton", "[[...path]]", "route.ts");
    expect(route).toMatch(/requireAncient/);
    expect(route).toMatch(/runtime = "nodejs"/);
    expect(route).toMatch(/x-khronoton-confirmed/);
    expect(route).toMatch(/admin_confirm_required/);
  });

  it("the engine context assembles all six seams around the sealed codex", () => {
    const ctx = read("lib", "khronoton", "context.ts");
    expect(ctx).toMatch(/getKhronotonDb/);
    expect(ctx).toMatch(/createMnemosyneKeyResolver/);
    expect(ctx).toMatch(/getChainRuntime/);
    expect(ctx).toMatch(/onAudit/);
    expect(ctx).toMatch(/resolveFireMode/);
    expect(ctx).toMatch(/tickIntervalMs/);
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

  it("is a gate-free pane body — gated by the shell, not itself", () => {
    expect(panel()).toMatch(/^["']use client["'];?/m);
    expect(panel()).not.toMatch(/AdminGate/);
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
