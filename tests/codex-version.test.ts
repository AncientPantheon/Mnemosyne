import { describe, it, expect } from "vitest";

import { readCodexUiVersion } from "../lib/codexVersion";

describe("readCodexUiVersion — the version the admin panel shows for 'Update Codex'", () => {
  it("reads the installed @ancientpantheon/codex-ui version as a semver string", () => {
    // The admin panel surfaces the currently-linked codex-ui version; it must come
    // from the package's own package.json, not a hardcoded literal that drifts.
    const version = readCodexUiVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
