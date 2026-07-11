import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { readAdminSettings, writeAdminSettings } from "../lib/adminSettings";

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "mnemo-admin-"));
  dirs.push(dir);
  return join(dir, "admin-settings.json");
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("adminSettings store — server-side persistence of operator config", () => {
  it("defaults to an empty Pythia URL when the settings file does not exist yet", () => {
    // A fresh deploy has no settings file; the store must default, not crash.
    expect(readAdminSettings(join(tempFile(), "nope", "missing.json"))).toEqual({
      pythiaUrl: "",
    });
  });

  it("round-trips a written Pythia URL through disk (persists across restarts)", () => {
    const path = tempFile();
    writeAdminSettings({ pythiaUrl: "https://pythia.ancientholdings.eu" }, path);
    expect(readAdminSettings(path)).toEqual({
      pythiaUrl: "https://pythia.ancientholdings.eu",
    });
  });

  it("creates the parent directory on write so a first-ever save does not fail on a missing data/ dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "mnemo-admin-"));
    dirs.push(dir);
    const nested = join(dir, "data", "admin-settings.json");
    writeAdminSettings({ pythiaUrl: "https://p" }, nested);
    expect(readAdminSettings(nested).pythiaUrl).toBe("https://p");
  });

  it("returns defaults on a malformed settings file rather than throwing (a corrupt file must not brick the app)", () => {
    const path = tempFile();
    writeFileSync(path, "{ not json", "utf8");
    expect(readAdminSettings(path)).toEqual({ pythiaUrl: "" });
  });

  it("coerces a non-string pythiaUrl field back to the empty default (defends against a hand-edited file)", () => {
    const path = tempFile();
    writeFileSync(path, JSON.stringify({ pythiaUrl: 42 }), "utf8");
    expect(readAdminSettings(path)).toEqual({ pythiaUrl: "" });
  });
});
