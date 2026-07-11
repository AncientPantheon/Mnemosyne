import { describe, it, expect } from "vitest";
import { existsSync, lstatSync, realpathSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const repoRoot = resolve(__dirname, "..");
const nodeModules = join(repoRoot, "node_modules");

// The five Codex packages consumed via file: links. A clean install must resolve
// each of these from the local Codex checkout with ZERO registry hits — proven
// here by asserting each is an on-disk symlink whose realpath lives inside the
// AncientPantheon/Codex packages directory (a registry install would be a real
// directory under node_modules, not a symlink out to the sibling repo).
const CODEX_PACKAGES = [
  "codex-core",
  "codex-ui",
  "codex-ouronet",
  "codex-arweave",
  "arweave-core",
] as const;

// Codex-critical runtime packages that must hoist to a SINGLE top-level copy at
// the Mnemosyne root, so the bundler can alias every importer onto that one copy.
// A second top-level copy (or a drifted @noble/curves pin) would fracture React
// hooks / the zustand store / the Apollo crypto curve across the Codex tree.
//
// Scope note (install layer vs bundler layer): nested copies DO exist deeper in
// the tree — the @ardrive/turbo-sdk web3 payment substack (x402 -> wagmi -> viem
// -> walletconnect/reown) nests its own @noble/curves/zustand, and the file:-
// symlinked Codex packages resolve react/zustand against the Codex workspace's
// own node_modules. Neither is fixable at the npm install layer with symlinked
// file: deps; both are collapsed at the bundler seam (turbo-sdk -> its /web ESM
// build + resolve.dedupe/alias for react/react-dom/zustand) in the bundler-config
// task. This test therefore pins only what the install layer CAN guarantee: one
// hoisted top-level copy at the load-bearing versions.
const SINGLE_INSTANCE = [
  { pkg: "react", expectMajor: 19 },
  { pkg: "react-dom", expectMajor: 19 },
  { pkg: "zustand", expectMajor: 5 },
  // @noble/curves is pinned EXACT to 1.9.7 to match @stoachain/stoa-core's exact
  // peer pin — a single shared Apollo-curve instance depends on this exact match.
  { pkg: "@noble/curves", expectExact: "1.9.7" },
] as const;

function topLevelVersion(pkg: string): string | null {
  const dir = join(nodeModules, ...pkg.split("/"));
  const manifest = join(dir, "package.json");
  if (!existsSync(manifest)) return null;
  // A registry install is a real directory; a stray symlink here would mean the
  // package was not actually hoisted as the single shared top-level copy.
  if (lstatSync(dir).isSymbolicLink()) return null;
  return JSON.parse(readFileSync(manifest, "utf8")).version;
}

describe("Codex file: package resolution (zero registry hits)", () => {
  it.each(CODEX_PACKAGES)("@ancientpantheon/%s resolves to a local symlink into the Codex repo", (pkg) => {
    const linkPath = join(nodeModules, "@ancientpantheon", pkg);
    expect(existsSync(linkPath), `${linkPath} must exist after install`).toBe(true);
    expect(lstatSync(linkPath).isSymbolicLink(), `${pkg} must be a file: symlink, not a registry install`).toBe(true);

    const target = realpathSync(linkPath);
    const codexPackages = ["AncientPantheon", "Codex", "packages"].join(sep);
    expect(
      target.includes(codexPackages),
      `${pkg} realpath ${target} must live under AncientPantheon/Codex/packages`,
    ).toBe(true);
  });
});

describe("single top-level hoist (install-layer dedupe precondition)", () => {
  it.each(SINGLE_INSTANCE)("$pkg hoists to one top-level copy at the pinned version", (entry) => {
    const version = topLevelVersion(entry.pkg);
    expect(version, `${entry.pkg} must be hoisted to a single real top-level copy`).not.toBeNull();

    const [major] = version!.split(".");
    if ("expectExact" in entry) {
      expect(version, `${entry.pkg} must be the exact shared pin`).toBe(entry.expectExact);
    } else {
      expect(Number(major), `${entry.pkg} top-level copy must be v${entry.expectMajor}.x`).toBe(entry.expectMajor);
    }
  });
});
