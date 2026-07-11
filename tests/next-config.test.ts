import { describe, it, expect } from "vitest";
import nextConfig from "../next.config";

// The webpack hook receives Next's `webpack` instance; we stub the two plugin
// constructors so we can assert what the hook injects without a real build.
class FakePlugin {
  constructor(public opts: Record<string, unknown>) {}
}
class FakeReplacementPlugin {
  constructor(
    public test: RegExp,
    public replacer: (r: { request: string }) => void,
  ) {}
}
const fakeWebpack = {
  ProvidePlugin: FakePlugin,
  DefinePlugin: FakePlugin,
  NormalModuleReplacementPlugin: FakeReplacementPlugin,
};

type Alias = Record<string, string>;
type Fallback = Record<string, string | false>;
type Plugin = FakePlugin | FakeReplacementPlugin;
type Cfg = { resolve: { alias: Alias; fallback?: Fallback }; plugins: Plugin[] };
type WebpackHook = (config: Cfg, ctx: { isServer: boolean; webpack: typeof fakeWebpack }) => Cfg;

function invoke(isServer: boolean): Cfg {
  const config: Cfg = { resolve: { alias: {} }, plugins: [] };
  return (nextConfig.webpack as unknown as WebpackHook)(config, { isServer, webpack: fakeWebpack });
}

describe("next.config bundler seam", () => {
  it("transpiles all nine out-of-root Codex/stoachain/noble sources so their TS/JSX is compiled", () => {
    const expected = [
      "@ancientpantheon/codex-core",
      "@ancientpantheon/codex-ui",
      "@ancientpantheon/codex-ouronet",
      "@ancientpantheon/codex-arweave",
      "@ancientpantheon/arweave-core",
      "@stoachain/stoa-core",
      "@stoachain/kadena-stoic-legacy",
      "@stoachain/ouronet-core",
      "@stoachain/dalos-crypto",
      "@noble/curves",
    ];
    expect(nextConfig.transpilePackages).toEqual(expect.arrayContaining(expected));
    expect(nextConfig.transpilePackages).toHaveLength(expected.length);
  });

  it("pins turbopack.root to an absolute repo path (silences out-of-root inference)", () => {
    const root = (nextConfig.turbopack as { root?: string } | undefined)?.root;
    expect(root).toBeTypeOf("string");
    expect((root as string).length).toBeGreaterThan(0);
  });

  it("forces a single react/react-dom/zustand/@noble/curves instance on the client build", () => {
    const alias = invoke(false).resolve.alias;
    for (const key of ["react", "react-dom", "zustand", "@noble/curves", "react/jsx-runtime$"]) {
      expect(alias[key], `${key} must be pinned to one top-level copy`).toBeTypeOf("string");
    }
    // The pin resolves into the app's OWN node_modules, not a nested codex copy.
    expect(alias["react"]).toContain("node_modules");
    expect(alias["react"]).toContain("react");
  });

  it("maps the browser shims (buffer/process/crypto/stream + turbo /web) on the client build", () => {
    const alias = invoke(false).resolve.alias;
    expect(alias["buffer$"]).toContain("buffer");
    expect(alias["process$"]).toContain("process.shim");
    expect(alias["crypto$"]).toContain("crypto.shim");
    expect(alias["stream$"]).toContain("stream.shim");
    expect(alias["@ardrive/turbo-sdk$"]).toContain("lib/esm/web/index.js");
  });

  it("strips the node: scheme so the bare shim aliases fire (webpack bypasses alias for node: URIs)", () => {
    const replacement = invoke(false).plugins.find(
      (p): p is FakeReplacementPlugin => p instanceof FakeReplacementPlugin,
    );
    expect(replacement, "a NormalModuleReplacementPlugin must handle node: URIs").toBeDefined();
    // The replacer rewrites `node:stream` -> `stream` so the stream$ alias applies.
    const resource = { request: "node:stream" };
    replacement!.replacer(resource);
    expect(resource.request).toBe("stream");
  });

  it("resolves Node-only builtins (sqlite/fs) to an empty module on the client build", () => {
    const fallback = invoke(false).resolve.fallback ?? {};
    expect(fallback["sqlite"]).toBe(false);
    expect(fallback["fs"]).toBe(false);
  });

  it("provides Buffer + process and defines global->globalThis on the client build", () => {
    const out = invoke(false);
    const provide = out.plugins.find((p): p is FakePlugin => p instanceof FakePlugin && "Buffer" in p.opts);
    expect(provide, "ProvidePlugin must inject Buffer").toBeDefined();
    expect(provide!.opts.Buffer).toEqual(["buffer", "Buffer"]);
    expect((provide!.opts.process as unknown[])[1]).toBe("default");
    const define = out.plugins.find((p): p is FakePlugin => p instanceof FakePlugin && "global" in p.opts);
    expect(define!.opts.global).toBe("globalThis");
  });

  it("keeps the server build clean of the browser shims and plugins", () => {
    const out = invoke(true);
    expect(out.resolve.alias["buffer$"]).toBeUndefined();
    expect(out.resolve.alias["react"]).toBeUndefined();
    expect(out.resolve.fallback).toBeUndefined();
    expect(out.plugins).toHaveLength(0);
  });
});
