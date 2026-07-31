import { describe, it, expect, afterEach, vi } from "vitest";

import { readPythiaClientVersion, fetchLatestPythiaClientVersion } from "../lib/codexVersion";

describe("readPythiaClientVersion — the installed @ancientpantheon/pythia-client version", () => {
  it("reads the installed @ancientpantheon/pythia-client version as a semver string", () => {
    // Pythia-client is now a real Mnemosyne dependency; the admin panel's third
    // constructor row must reflect the actually-installed version, not a literal.
    const version = readPythiaClientVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("fetchLatestPythiaClientVersion — the live npm registry check", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns dist-tags.latest from the registry response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "2.3.0" } }), { status: 200 }),
      ),
    );
    expect(await fetchLatestPythiaClientVersion()).toBe("2.3.0");
  });

  it("returns null on a non-200 (so the UI degrades to installed-only, no crash)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await fetchLatestPythiaClientVersion()).toBeNull();
  });

  it("returns null when fetch throws (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ENOTFOUND registry.npmjs.org");
      }),
    );
    expect(await fetchLatestPythiaClientVersion()).toBeNull();
  });

  it("returns null when the payload has no dist-tags.latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ name: "x" }), { status: 200 })),
    );
    expect(await fetchLatestPythiaClientVersion()).toBeNull();
  });
});
