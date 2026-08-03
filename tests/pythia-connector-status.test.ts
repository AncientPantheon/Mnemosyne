import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  readConnectorState,
  writeConnectorState,
  clearConnectorState,
  type ConnectorState,
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

const DEFAULT_STATE: ConnectorState = {
  dualLinkKey: null,
  standardApollo: null,
  smartApollo: null,
  linkedAt: null,
};

describe("connectorStatus store — pasted dual-link-key persistence", () => {
  it("defaults to an all-null state when the store file does not exist yet", () => {
    // A fresh deploy (or one where no dual-link-key has been pasted) has no store
    // file; the read must default rather than crash the admin status poll.
    expect(readConnectorState(join(tempFile(), "nope", "missing.json"))).toEqual(
      DEFAULT_STATE,
    );
  });

  it("round-trips a fully-populated state through disk (survives restarts / poll requests)", () => {
    // The pasted key + its split halves + the link timestamp must persist so the
    // connector can be rebuilt after a process restart.
    const path = tempFile();
    const state: ConnectorState = {
      dualLinkKey: "p:standard-account|P:smart-account",
      standardApollo: "p:standard-account",
      smartApollo: "P:smart-account",
      linkedAt: "2026-08-03T00:00:00.000Z",
    };
    writeConnectorState(state, path);
    expect(readConnectorState(path)).toEqual(state);
  });

  it("falls back to defaults on a corrupt store file rather than throwing (must not brick the status poll)", () => {
    // A hand-edited / truncated file must not crash the admin panel — it collapses
    // to the not-linked default state.
    const path = tempFile();
    writeFileSync(path, "{ not json", "utf8");
    expect(readConnectorState(path)).toEqual(DEFAULT_STATE);
  });

  it("clears a stored key back to the all-null default state (operator un-link)", () => {
    // Un-linking must return the store to not-linked so the connector goes back to
    // an unattributed client on the next read.
    const path = tempFile();
    writeConnectorState(
      {
        dualLinkKey: "p:standard-account|P:smart-account",
        standardApollo: "p:standard-account",
        smartApollo: "P:smart-account",
        linkedAt: "2026-08-03T00:00:00.000Z",
      },
      path,
    );
    clearConnectorState(path);
    expect(existsSync(path)).toBe(false);
    expect(readConnectorState(path)).toEqual(DEFAULT_STATE);
  });
});
