import { describe, it, expect, afterEach, vi } from "vitest";

import {
  readCodexUiVersion,
  fetchLatestCodexVersion,
  isNewerVersion,
} from "../lib/codexVersion";

describe("readCodexUiVersion — the version the admin panel shows for 'Update Codex'", () => {
  it("reads the installed @ancientpantheon/codex version as a semver string", () => {
    // The admin panel surfaces the currently-installed codex aggregate version; it
    // must come from the package's own package.json, not a hardcoded literal.
    const version = readCodexUiVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("isNewerVersion — 'is an update available?' semver compare", () => {
  it("flags a newer minor/patch/major as an update", () => {
    expect(isNewerVersion("0.6.0", "0.5.0")).toBe(true);
    expect(isNewerVersion("0.5.1", "0.5.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    // Numeric per-segment, NOT lexical: 0.10.0 is newer than 0.9.0.
    expect(isNewerVersion("0.10.0", "0.9.0")).toBe(true);
  });

  it("does not flag an equal or older version", () => {
    expect(isNewerVersion("0.5.0", "0.5.0")).toBe(false);
    expect(isNewerVersion("0.5.0", "0.6.0")).toBe(false);
    expect(isNewerVersion("0.9.0", "0.10.0")).toBe(false);
  });
});

describe("fetchLatestCodexVersion — the live npm registry check", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns dist-tags.latest from the registry response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ "dist-tags": { latest: "0.6.0" } }), { status: 200 }),
      ),
    );
    expect(await fetchLatestCodexVersion()).toBe("0.6.0");
  });

  it("returns null on a non-200 (so the UI degrades to installed-only, no crash)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    expect(await fetchLatestCodexVersion()).toBeNull();
  });

  it("returns null when fetch throws (offline)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ENOTFOUND registry.npmjs.org");
      }),
    );
    expect(await fetchLatestCodexVersion()).toBeNull();
  });

  it("returns null when the payload has no dist-tags.latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ name: "x" }), { status: 200 })),
    );
    expect(await fetchLatestCodexVersion()).toBeNull();
  });
});
