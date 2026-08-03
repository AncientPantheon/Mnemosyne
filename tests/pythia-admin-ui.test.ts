import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source-contract tests for ConnectorIdentitySection, the dual-link-key paste +
// live-status panel that sits below the existing gateway-URL form in
// PythiaPage.client.tsx. Same style as tests/admin-panel.test.ts's admin-panel
// blocks: the admin surface is a client React tree (fetch + hooks) that can't be
// exercised in a node vitest env without a real browser mount, so each assertion
// pins a concrete regression against the source text instead.
//
// The connector is now driven by an operator pasting a dual-link-key (two Apollo
// account addresses generated + activated as a Pythia Key in the Codex tab). The
// old on-chain onboarding button + stage machine are gone.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("admin — Pythia connector identity (dual-link-key paste + live status)", () => {
  const panel = () => read("app", "admin", "pythia", "PythiaPage.client.tsx");

  it("still exports the existing gateway-URL section alongside the new one", () => {
    // PythiaPage's return is a fragment of two sibling sections — the rework must
    // not regress the pre-existing gateway-URL form's own wiring.
    expect(panel()).toMatch(/\/api\/admin\/pythia["']/);
    expect(panel()).toMatch(/\/api\/config/);
  });

  it("polls the connector status route", () => {
    // The panel GETs live status (linked/per-half/masked secret/expiry) on mount
    // and while pending — a dropped status URL blanks the whole live view.
    expect(panel()).toMatch(/\/api\/admin\/pythia-connector\/status/);
  });

  it("posts the pasted dual-link-key to the connector route", () => {
    // The Link button POSTs { dualLinkKey } to the base connector route; losing
    // either the URL or the body field breaks the operator's only way to link.
    expect(panel()).toMatch(/\/api\/admin\/pythia-connector["']/);
    expect(panel()).toMatch(/dualLinkKey/);
  });

  it("points the operator at the Codex tab to generate + activate the pair", () => {
    // Generation + on-chain "Activate as Pythia Key" happens in the Codex tab, not
    // here — the instruction must anchor there or the operator has no path to a key.
    expect(panel()).toMatch(/\/admin#codex/);
  });

  it("shows the server-masked secret verbatim (never unmasks)", () => {
    // The route masks the ephemeral x-pythia-key server-side; the panel displays the
    // maskedSecret field as-is. Referencing the raw field name would be a leak.
    expect(panel()).toMatch(/maskedSecret/);
  });

  it("renders both Apollo public accounts and an expiry countdown", () => {
    expect(panel()).toMatch(/standardApollo/);
    expect(panel()).toMatch(/smartApollo/);
    expect(panel()).toMatch(/expiresAt/);
  });

  it("lays each half out as a framed account card with a state chip (Pantheonic panel spec)", () => {
    // The half addresses live in bordered account cards (label + chip on top, the
    // address on its own truncated line), not a flat label/value row where the
    // 162-char address bled out of its box.
    expect(panel()).toMatch(/mnemo-acct-card/);
    expect(panel()).toMatch(/mnemo-chip--active/);
    expect(panel()).toMatch(/mnemo-chip--pending/);
  });

  it("shows the single consolidated key with a depleting timer bar + 'expires in' countdown", () => {
    // ONE masked key for the whole pair, a bar whose fill width shrinks over the
    // secret's lifetime, and the text countdown — matching Pythia's Self Connector.
    expect(panel()).toMatch(/mnemo-ttl-bar-fill/);
    expect(panel()).toMatch(/width:\s*`?\$\{barPct\}%/);
    expect(panel()).toMatch(/expires in/);
    // The countdown is Xh Ym Zs (hours shown), not a raw minutes total.
    expect(panel()).toMatch(/\$\{h\}h /);
  });

  it("the account-address CSS truncates with an ellipsis so a 162-char address can't overflow its box", () => {
    const css = read("app", "admin", "admin.css");
    expect(css).toMatch(/\.mnemo-acct-card-addr[^}]*text-overflow:\s*ellipsis/s);
    expect(css).toMatch(/\.mnemo-ttl-bar-fill/);
  });

  it("offers an Unlink affordance that clears the stored key via DELETE", () => {
    // Un-linking DELETEs the stored dual-link-key; without it a wrong paste is stuck.
    expect(panel()).toMatch(/Unlink/);
    expect(panel()).toMatch(/method:\s*["']DELETE["']/);
  });

  it("polls on an interval while linked-but-not-active, clearing it on unmount/active", () => {
    expect(panel()).toMatch(/setInterval/);
    expect(panel()).toMatch(/clearInterval/);
  });

  it("has fully retired the old on-chain onboarding stage machine", () => {
    // The acknowledgement checkbox, the "Start onboarding" trigger, and the
    // ensuring-identity/deploying-* stage strings are gone — the connector no longer
    // builds or triggers any on-chain Pact transaction from this panel.
    expect(panel()).not.toMatch(/acknowledgedSpend/);
    expect(panel()).not.toMatch(/Start onboarding/);
    expect(panel()).not.toMatch(/ensuring-identity/);
    expect(panel()).not.toMatch(/deploying-/);
  });
});
