import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readConnectorStatus,
  writeConnectorStatus,
  type ConnectorStatus,
} from "../lib/pythia/connectorStatus";

const dirs: string[] = [];
function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "mnemo-pythia-status-"));
  dirs.push(dir);
  return join(dir, "pythia-connector-status.json");
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const DEFAULT_STATUS: ConnectorStatus = {
  stage: "idle",
  standardApollo: null,
  smartApollo: null,
  startedAt: null,
  updatedAt: null,
  lastError: null,
};

describe("connectorStatus store — non-secret onboarding status persistence", () => {
  it("defaults to idle with all fields null when the status file does not exist yet", () => {
    // A fresh deploy (or a deploy that has never run onboarding) has no status
    // file; the store must default rather than crash the admin panel poll.
    expect(readConnectorStatus(join(tempFile(), "nope", "missing.json"))).toEqual(
      DEFAULT_STATUS,
    );
  });

  it("round-trips a written status through disk (persists across restarts / poll requests)", () => {
    const path = tempFile();
    const status: ConnectorStatus = {
      stage: "linking",
      standardApollo: "p:abc123",
      smartApollo: "P:def456",
      startedAt: "2026-07-31T00:00:00.000Z",
      updatedAt: "2026-07-31T00:05:00.000Z",
      lastError: null,
    };
    writeConnectorStatus(status, path);
    expect(readConnectorStatus(path)).toEqual(status);
  });

  it("falls back to defaults on a corrupt status file rather than throwing (must not brick the status poll)", () => {
    const path = tempFile();
    writeFileSync(path, "{ not json", "utf8");
    expect(readConnectorStatus(path)).toEqual(DEFAULT_STATUS);
  });
});
