import { describe, it, expect } from "vitest";

import { normalizePythiaUrl, effectivePythiaUrl } from "../lib/pythiaUrl";

describe("normalizePythiaUrl — the operator-set Pythia gateway validator", () => {
  it("accepts an https gateway and returns it trimmed (the URL an operator would paste)", () => {
    expect(normalizePythiaUrl("  https://pythia.ancientholdings.eu  ")).toBe(
      "https://pythia.ancientholdings.eu",
    );
  });

  it("accepts an http localhost gateway with a path (local dev Pythia)", () => {
    expect(normalizePythiaUrl("http://localhost:8080/gw")).toBe(
      "http://localhost:8080/gw",
    );
  });

  it("rejects a non-http(s) scheme so a javascript:/ftp: value can never reach every user's browser", () => {
    // This value is injected into every Mnemosyne user's Codex global connection;
    // a non-fetch scheme must be refused, not stored.
    expect(normalizePythiaUrl("javascript:alert(1)")).toBeNull();
    expect(normalizePythiaUrl("ftp://pythia.example.com")).toBeNull();
  });

  it("rejects a non-URL string so a fat-fingered save is a 400, not a broken global connection", () => {
    expect(normalizePythiaUrl("not a url")).toBeNull();
  });

  it("rejects empty/whitespace (empty is a CLEAR, handled by the route — not a valid URL)", () => {
    expect(normalizePythiaUrl("")).toBeNull();
    expect(normalizePythiaUrl("   ")).toBeNull();
  });
});

describe("effectivePythiaUrl — operator global precedence over the empty per-user default", () => {
  it("uses the operator value when the per-user field is empty (the whole point: it applies to ALL users)", () => {
    expect(effectivePythiaUrl("https://op.pythia", "")).toBe("https://op.pythia");
  });

  it("lets the operator global win even over a per-user value (the operator-injected connection is global)", () => {
    expect(effectivePythiaUrl("https://op.pythia", "https://user.local")).toBe(
      "https://op.pythia",
    );
  });

  it("falls back to the per-user value when no operator global is set", () => {
    expect(effectivePythiaUrl("", "https://user.local")).toBe("https://user.local");
  });

  it("resolves to empty (both chains local) when neither operator nor user set a gateway", () => {
    expect(effectivePythiaUrl("", "")).toBe("");
  });

  it("ignores surrounding whitespace on both inputs", () => {
    expect(effectivePythiaUrl("  ", "  https://user.local  ")).toBe(
      "https://user.local",
    );
  });
});
