import { describe, it, expect, afterEach, vi } from "vitest";

import { readConstructorsStatus } from "../lib/deploy/constructors";
import { readPythiaClientVersion } from "../lib/codexVersion";

afterEach(() => vi.unstubAllGlobals());

describe("readConstructorsStatus — Pythia as the third constructor", () => {
  it("includes a wired Pythia entry alongside Codex and Khronoton, and flags an update when npm is newer", async () => {
    // Stub every outbound fetch (npm dist-tags lookups for Codex/Khronoton/Pythia,
    // plus the GitHub raw package.json lookup for the app itself) so the read is
    // deterministic and doesn't hit the network. "9.9.9" is chosen to be strictly
    // newer than the real installed pythia-client version (2.3.0 at the time of
    // writing) — this exercises the actual update-detection wiring
    // (pythiaUpdate/anyUpdateAvailable), not just the entry's static shape.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "9.9.9" } }), {
          status: 200,
        }),
      ),
    );

    const status = await readConstructorsStatus();

    expect(status.constructors).toHaveLength(3);

    const pythia = status.constructors.find((c) => c.key === "pythia");
    expect(pythia).toBeDefined();
    expect(pythia?.wired).toBe(true);
    expect(pythia?.npmPackage).toBe("@ancientpantheon/pythia-client");
    expect(pythia?.installed).toMatch(/^\d+\.\d+\.\d+/);
    expect(pythia?.available).toBe("9.9.9");
    expect(pythia?.updateAvailable).toBe(true);
    expect(status.anyUpdateAvailable).toBe(true);
  });

  it("does not flag a Pythia update when npm reports the same version already installed", async () => {
    // Stub every registry lookup to report exactly the installed version, so
    // pythiaUpdate/anyUpdateAvailable must come back false for Pythia's own
    // contribution (the Mnemosyne-app GitHub-raw probe is stubbed the same way and
    // is not asserted on here — this test is scoped to Pythia's own entry).
    const installed = readPythiaClientVersion();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: installed } }), {
          status: 200,
        }),
      ),
    );

    const status = await readConstructorsStatus();
    const pythia = status.constructors.find((c) => c.key === "pythia");

    expect(pythia?.available).toBe(installed);
    expect(pythia?.updateAvailable).toBe(false);
  });

  it("orders the CONSTRUCTORS row as Pythia, Codex, Khronoton — the fixed canonical order", async () => {
    // Pantheonic automaton/05-deploy-panel-and-progress.md §1e: the CONSTRUCTORS
    // group's row order is fixed and identical across every automaton, independent
    // of wiring/install order — Pythia, Codex, Khronoton — not left to each
    // automaton's own discretion.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "9.9.9" } }), {
          status: 200,
        }),
      ),
    );

    const status = await readConstructorsStatus();

    expect(status.constructors.map((c) => c.key)).toEqual([
      "pythia",
      "codex",
      "khronoton",
    ]);
  });
});
