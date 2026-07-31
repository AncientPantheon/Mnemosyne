import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract tests for ConnectorIdentitySection, the dual-Apollo onboarding
// trigger added below the existing gateway-URL form in PythiaPage.client.tsx. Same
// style as the rest of tests/admin-panel.test.ts's admin-panel blocks: the admin
// surface is a client React tree (fetch + hooks) that can't be exercised in a node
// vitest env without a real browser mount, so each assertion pins a concrete
// regression against the source text instead.

const root = process.cwd();
const read = (...p: string[]) =>
  readFileSync(join(root, ...p), "utf8");

describe("admin — Pythia connector identity onboarding (T8)", () => {
  const panel = () => read("app", "admin", "pythia", "PythiaPage.client.tsx");

  it("still exports the existing gateway-URL section alongside the new one", () => {
    // PythiaPage's return becomes a fragment of two sibling sections — this must
    // not regress the pre-existing gateway-URL form's own wiring.
    expect(panel()).toMatch(/\/api\/admin\/pythia["']/);
    expect(panel()).toMatch(/\/api\/config/);
  });

  it("polls the onboarding status route", () => {
    expect(panel()).toMatch(/\/api\/admin\/pythia-connector\/status/);
  });

  it("posts the acknowledged-spend trigger to the onboarding route", () => {
    expect(panel()).toMatch(/\/api\/admin\/pythia-connector["']/);
    expect(panel()).toMatch(/acknowledgedSpend/);
  });

  it("requires the required checkbox to enable the trigger button (irreversible real-cost gate)", () => {
    expect(panel()).toMatch(/irreversible/i);
    // Assert the trigger's `disabled` expression as one contiguous unit, not
    // loosely-scattered tokens — a wrong operator (e.g. `busy && !acknowledged`), a
    // wrong variable, or a dropped clause must fail this match, even though the
    // individual tokens `!acknowledged` etc. would still appear elsewhere in the file
    // (e.g. inside a comment).
    expect(panel()).toMatch(
      /disabled=\{busy \|\| !acknowledged \|\| activeOrRunning\}/,
    );
  });

  it("keeps the trigger disabled for the full lifetime of the background onboarding job, not just the initial POST (REVIEW M1)", () => {
    // `busy` only covers the fire-and-forget POST, which resolves in ~202ms — the
    // background job it kicks off can run for minutes through stages like
    // "deploying-standard"/"linking"/"proving-smart". `activeOrRunning` must gate the
    // button for that whole window (any non-idle, non-failed stage), not just success,
    // or a second click during a legitimate in-progress run hits the backend's 409
    // guard and surfaces as a confusing error alert.
    expect(panel()).toMatch(
      /const activeOrRunning =\s*status !== null &&\s*status\.stage !== ["']idle["'] &&\s*status\.stage !== ["']failed["'];/,
    );
  });

  it("labels the trigger honestly while disabled — 'already onboarded' vs 'in progress', not a generic stale label", () => {
    // Once `activeOrRunning` also covers in-progress (not just success), the button's
    // own text must not misrepresent an in-progress run as "already active" or leave a
    // stale label that only ever reflected the `busy` (POST-in-flight) state.
    expect(panel()).toMatch(/Already onboarded/);
    expect(panel()).toMatch(/In progress/);
  });

  it("renders lastError and both Apollo public accounts", () => {
    expect(panel()).toMatch(/lastError/);
    expect(panel()).toMatch(/standardApollo/);
    expect(panel()).toMatch(/smartApollo/);
  });

  it("polls on an interval while a stage is in progress, clearing it on unmount/terminal stage", () => {
    expect(panel()).toMatch(/setInterval/);
    expect(panel()).toMatch(/clearInterval/);
  });
});
