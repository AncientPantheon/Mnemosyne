import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readBoxStatus } from "../lib/deploy/boxStatus";
import { latestDeploy } from "../lib/deploy/spool";

// Deploy panel §05 conformance (websites/Pantheon/docs/pantheonic-architecture/
// automaton/05-deploy-panel-and-progress.md). This file covers the SERVER half:
// `active` (the newest non-terminal deploy in the spool) and the §2 status payload.
// The panel/DOM half lives in its own describe block appended by the panel task.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

const BOX_ENV = [
  "MNEMOSYNE_DEPLOY_DIR",
  "MNEMOSYNE_COLOR",
  "MNEMOSYNE_LOOPBACK_PORT",
  "MNEMOSYNE_CONTAINER",
] as const;

const savedEnv = new Map<string, string | undefined>();
const dirs: string[] = [];

function setEnv(key: (typeof BOX_ENV)[number], value: string | undefined): void {
  if (!savedEnv.has(key)) savedEnv.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

/** A real spool dir on disk — `latestDeploy` reads actual file birth times. */
function tempSpool(): string {
  const dir = mkdtempSync(join(tmpdir(), "mnemo-spool-"));
  dirs.push(dir);
  setEnv("MNEMOSYNE_DEPLOY_DIR", dir);
  return dir;
}

/** Write one deploy's spool pair, exactly as the trigger route + deployer do. */
function writeDeploy(
  dir: string,
  id: string,
  status: string,
  opts: { log?: boolean } = {},
): void {
  if (opts.log !== false) writeFileSync(join(dir, `${id}.log`), `deploy ${id}\n`);
  writeFileSync(join(dir, `${id}.status`), status);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe("deploy §05 — latestDeploy(): the `active` source", () => {
  it("returns null when the spool directory does not exist (a fresh box must not 500)", () => {
    setEnv("MNEMOSYNE_DEPLOY_DIR", join(tmpdir(), `mnemo-spool-absent-${Date.now()}`));
    expect(() => latestDeploy()).not.toThrow();
    expect(latestDeploy()).toBeNull();
  });

  it("returns null for an empty spool", () => {
    tempSpool();
    expect(latestDeploy()).toBeNull();
  });

  it("ignores terminal deploys — success/failed are history, not an active deploy", () => {
    const dir = tempSpool();
    writeDeploy(dir, "11111111-aaaa-4aaa-8aaa-111111111111", "success");
    writeDeploy(dir, "22222222-bbbb-4bbb-8bbb-222222222222", "failed");
    expect(latestDeploy()).toBeNull();
  });

  it("reports a running deploy with its id, status and real start time", () => {
    const dir = tempSpool();
    const id = "33333333-cccc-4ccc-8ccc-333333333333";
    writeDeploy(dir, id, "running");

    const active = latestDeploy();
    expect(active).not.toBeNull();
    expect(active?.id).toBe(id);
    expect(active?.status).toBe("running");
    // startedAt must be the log's real birth time — an ISO instant near now, never
    // the epoch (the birthtime-unsupported filesystem fallback) or an invalid date.
    expect(active?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(Math.abs(Date.parse(active?.startedAt ?? "") - Date.now())).toBeLessThan(
      60_000,
    );
  });

  it("counts a still-queued deploy as active (auto-attach works before the host picks it up)", () => {
    const dir = tempSpool();
    const id = "44444444-dddd-4ddd-8ddd-444444444444";
    writeDeploy(dir, id, "queued");
    expect(latestDeploy()?.status).toBe("queued");
  });

  it("returns the NEWEST non-terminal deploy, not the first or last one on disk", async () => {
    const dir = tempSpool();
    // The OLDER deploy sorts LAST alphabetically, so neither "first read" nor
    // "last read" accidentally passes — only a real time comparison does.
    const older = "ffffffff-9999-4999-8999-ffffffffffff";
    const newer = "00000000-1111-4111-8111-000000000000";
    writeDeploy(dir, older, "running");
    await sleep(60);
    writeDeploy(dir, newer, "running");

    expect(latestDeploy()?.id).toBe(newer);
  });

  it("ignores a terminal deploy even when it is the newest one on disk", async () => {
    const dir = tempSpool();
    const running = "55555555-eeee-4eee-8eee-555555555555";
    writeDeploy(dir, running, "running");
    await sleep(60);
    writeDeploy(dir, "66666666-ffff-4fff-8fff-666666666666", "success");

    expect(latestDeploy()?.id).toBe(running);
  });

  it("still reports an active deploy whose log file is gone (never throws on a stat)", () => {
    const dir = tempSpool();
    const id = "77777777-aaaa-4aaa-8aaa-777777777777";
    writeDeploy(dir, id, "running", { log: false });

    expect(() => latestDeploy()).not.toThrow();
    expect(latestDeploy()?.id).toBe(id);
    expect(Date.parse(latestDeploy()?.startedAt ?? "")).not.toBeNaN();
  });
});

describe("deploy §05 — box status: the on-box identity the deployer injects", () => {
  /** The version probes are network calls; the box readout must not depend on them. */
  const stubOfflineRegistry = () =>
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

  it("reports null (not a crash) for every identity field the deployer did not inject", async () => {
    stubOfflineRegistry();
    for (const key of ["MNEMOSYNE_COLOR", "MNEMOSYNE_LOOPBACK_PORT", "MNEMOSYNE_CONTAINER"] as const)
      setEnv(key, undefined);

    const box = await readBoxStatus();
    expect(box.color).toBeNull();
    expect(box.port).toBeNull();
    expect(box.container).toBeNull();
    expect(["bundle", "dev"]).toContain(box.mode);
  });

  it("passes the injected color / loopback port / container through verbatim", async () => {
    stubOfflineRegistry();
    setEnv("MNEMOSYNE_COLOR", "green");
    setEnv("MNEMOSYNE_LOOPBACK_PORT", "8081");
    setEnv("MNEMOSYNE_CONTAINER", "mnemosyne-green");

    const box = await readBoxStatus();
    expect(box.color).toBe("green");
    expect(box.port).toBe("8081");
    expect(box.container).toBe("mnemosyne-green");
  });

  it("reports the running app version from the same package.json the rest of admin uses", async () => {
    stubOfflineRegistry();
    const pkg = JSON.parse(read("package.json")) as { version: string };
    expect((await readBoxStatus()).version).toBe(pkg.version);
  });

  it("takes the deploy mode from the shared helper — never a second NODE_ENV rule", () => {
    // Two independent copies of the bundle/dev rule would silently disagree; the box
    // readout must consume the one definition in lib/deploy/constructors.ts.
    const box = read("lib", "deploy", "boxStatus.ts");
    expect(box).toMatch(/deployMode/);
    expect(box).not.toMatch(/process\.env\.NODE_ENV/);
    // …and it must take the CHEAP path. Routing this through readConstructorsStatus()
    // would drag three network probes (npm ×2 + GitHub raw) into a call the panel makes
    // on every mount to auto-attach — one boolean is not worth three round-trips.
    expect(box).not.toMatch(/readConstructorsStatus/);
  });

  it("keeps ONE definition of the bundle/dev rule, exported for both callers", () => {
    const constructors = read("lib", "deploy", "constructors.ts");
    expect(constructors).toMatch(/export function deployMode\(\)/);
    // The aggregate consumes the helper too, so the two can never drift apart.
    expect(constructors).toMatch(/deployMode:\s*deployMode\(\)/);
    expect((constructors.match(/process\.env\.NODE_ENV/g) ?? []).length).toBe(1);
  });
});

describe("deploy §05 — GET /api/admin/deploy/status (source contract)", () => {
  const route = () => read("app", "api", "admin", "deploy", "status", "route.ts");

  it("is ancient-gated and returns the gate's 401/403 response verbatim", () => {
    expect(route()).toMatch(/requireAncient/);
    expect(route()).toMatch(/return gate\.response/);
  });

  it("is force-dynamic and no-store (the panel must never read a cached deploy state)", () => {
    expect(route()).toMatch(/dynamic\s*=\s*["']force-dynamic["']/);
    expect(route()).toMatch(/["']Cache-Control["']:\s*["']no-store["']/);
  });

  it("returns all six documented §2 keys, with `active` coming from the spool", () => {
    for (const key of ["mode", "color", "port", "container", "version", "active"])
      expect(route()).toMatch(new RegExp(`\\b${key}\\b`));
    expect(route()).toMatch(/latestDeploy/);
    expect(route()).toMatch(/readBoxStatus/);
  });
});

describe("deploy §05 — the deployer heartbeat + no-cache admin (server half)", () => {
  it("heartbeats ~6s and kills the ticker on EVERY exit path (§3)", () => {
    // The load-bearing guarantee: the panel's motion must be caused by the deployer
    // being alive. A ticker that outlives the deploy would make a dead deploy look
    // healthy — hence the EXIT trap, plus TERM/INT so a killed deployer lands on a
    // terminal status instead of a phantom `running` the panel auto-attaches to.
    const sh = read("deploy", "host", "mnemosyne-deploy.sh");
    expect(sh).toMatch(/start_heartbeat/);
    expect(sh).toMatch(/sleep 6/);
    expect(sh).toMatch(/still working · elapsed/);
    expect(sh).toMatch(/trap 'stop_heartbeat' EXIT/);
    expect(sh).toMatch(/trap .*TERM INT/);
    // Success states the TOTAL elapsed.
    expect(sh).toMatch(/deploy complete in \$\(elapsed\)/);
    // …and it injects the box identity the container cannot discover for itself.
    for (const v of ["MNEMOSYNE_COLOR", "MNEMOSYNE_LOOPBACK_PORT", "MNEMOSYNE_CONTAINER"])
      expect(sh).toContain(v);
  });

  it("dev mode writes the same heartbeat contract, cleared on every exit path (§6)", () => {
    const dev = read("lib", "deploy", "devDeploy.ts");
    expect(dev).toMatch(/still working · elapsed/);
    expect(dev).toMatch(/6_000|6000/);
    // The ticker must be stopped from all THREE exit paths — spawn-failure, child
    // "error" and child "close" — the JS equivalent of the host script's EXIT trap.
    // A leaked interval would keep appending "still working" after the deploy ended.
    expect(dev).toMatch(/clearInterval/);
    expect((dev.match(/stopHeartbeat\(\);/g) ?? []).length).toBe(3);
  });

  it("serves admin with Cache-Control: no-cache so the post-deploy reload revalidates (§5e)", () => {
    // Without this the auto-reload silently re-renders the OLD UI and the deploy looks
    // like it did nothing.
    const cfg = read("next.config.ts");
    expect(cfg).toMatch(/async headers\s*\(/);
    expect(cfg).toMatch(/["']\/admin/);
    expect(cfg).toMatch(/["']Cache-Control["']/);
    expect(cfg).toMatch(/no-cache/);
  });
});
