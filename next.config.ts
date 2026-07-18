import path from "node:path";
import type { NextConfig } from "next";

// The Codex tree is consumed from the single npm `@ancientpantheon/codex`
// aggregate (which bundles codex-core/ui/ouronet/arweave and externalizes the
// four `@stoachain/*` chain primitives + `@noble/curves` as peer deps). This config is the
// webpack translation of the Codex playground's proven Vite recipe
// (apps/codex-playground/vite.config.ts + resolve.shared.ts): force a single
// react/react-dom/zustand/@noble/curves instance, and supply the browser shims the
// @stoachain + Arweave/Turbo libraries need. Next 16 defaults to Turbopack for both
// dev and build (which ignores this webpack() hook), so every dev/build script pins
// `--webpack`; `turbopack.root` is still set for hygiene.

// Resolve from the working directory (the repo root — `next build` runs there),
// which sidesteps the __dirname/import.meta ambiguity of a `"type": "module"` TS
// config loaded by Next's own loader.
const repoRoot = process.cwd();
const nodeModules = path.join(repoRoot, "node_modules");

// Forward-slash (POSIX) form so alias replacement is stable on Windows — backslash
// paths can survive to the resolver and fail to match (same gotcha the playground's
// resolve.shared.ts guards against).
const toPosix = (p: string): string => p.replace(/\\/g, "/");
const toAbs = (...p: string[]): string => toPosix(path.join(nodeModules, ...p));

// The app's OWN single copies. The `file:`-symlinked Codex packages otherwise
// resolve `react`/`react-dom`/`zustand` against the Codex workspace's own nested
// copies (react@18.3.1) → two React instances → "Invalid hook call", and two
// zustand stores. Aliasing (not just dedupe) is the reliable lever here.
const reactDir = toAbs("react");
const reactDomDir = toAbs("react-dom");
const zustandDir = toAbs("zustand");
const nobleCurvesDir = toAbs("@noble", "curves");

// Browser shims (ported from the playground). `buffer` supplies the named `Buffer`
// export; the process/crypto/stream shims supply the members the Arweave/Turbo web
// build statically imports; `@ardrive/turbo-sdk` has NO `browser` field and its root
// export is the NODE build, so it must be rewritten onto its `/web` ESM build.
const bufferShim = toAbs("buffer", "index.js");
const processShim = toPosix(path.join(repoRoot, "lib", "shims", "process.shim.ts"));
const cryptoShim = toPosix(path.join(repoRoot, "lib", "shims", "crypto.shim.ts"));
const streamShim = toPosix(path.join(repoRoot, "lib", "shims", "stream.shim.ts"));
const turboWeb = toAbs("@ardrive", "turbo-sdk", "lib", "esm", "web", "index.js");

const nextConfig: NextConfig = {
  output: "standalone",
  // The Documentation Tier-1 link points at the clean `/docs` URL, but the docs are
  // static files under `public/docs/` — Next serves them at their exact path
  // (`/docs/index.html`), so a bare `/docs` 404s (and `/docs/` just 308-strips back
  // to `/docs`). Rewrite the clean URL onto the static index. Safe for in-page links:
  // every doc cross-link is absolute (`/docs/apollo-curve.html`, home `/`), so URL
  // resolution never depends on a trailing slash.
  async rewrites() {
    return [{ source: "/docs", destination: "/docs/index.html" }];
  },
  // better-sqlite3 (the Khronoton engine's store) is a NATIVE module — it must be
  // require()'d from node_modules at runtime, never webpack-bundled into the server
  // chunks. Next traces it (prebuilt .node binary included) into the standalone output.
  serverExternalPackages: ["better-sqlite3"],
  // The codex aggregate's CODE is bundled into the app chunks, so Next does not
  // otherwise trace its package.json into the standalone output — which made the
  // "installed codex version" reader (readCodexUiVersion) return "unknown" on the
  // live bundle. Force-include the manifest for every route that reads the version.
  // Same treatment for the khronoton manifest (readKhronotonUiVersion): the deploy
  // status route reads BOTH constructors' installed versions.
  outputFileTracingIncludes: {
    "/codex": ["./node_modules/@ancientpantheon/codex/package.json"],
    "/admin": ["./node_modules/@ancientpantheon/codex/package.json"],
    "/api/admin/codex-version": ["./node_modules/@ancientpantheon/codex/package.json"],
    "/api/admin/update-codex": ["./node_modules/@ancientpantheon/codex/package.json"],
    "/api/admin/khronoton-version": [
      "./node_modules/@ancientpantheon/khronoton-core/package.json",
    ],
    "/api/admin/deploy": [
      "./node_modules/@ancientpantheon/codex/package.json",
      "./node_modules/@ancientpantheon/khronoton-core/package.json",
    ],
  },
  // Out-of-root sources that must be transpiled: the single bundled
  // `@ancientpantheon/codex` aggregate (npm) + its external `arweave-core`, plus
  // the aggregate's peer chain primitives — the four `@stoachain/*` + `@noble/curves`
  // (the aggregate externalizes these, so the consumer supplies + transpiles them).
  transpilePackages: [
    "@ancientpantheon/codex",
    "@ancientpantheon/arweave-core",
    "@stoachain/stoa-core",
    "@stoachain/kadena-stoic-legacy",
    "@stoachain/ouronet-core",
    "@stoachain/dalos-crypto",
    "@noble/curves",
  ],
  // Pin the workspace root so Next does not infer a wider root from the
  // out-of-root file: symlinks (silences the inference warning). The build runs on
  // webpack via the `--webpack` script flag.
  turbopack: {
    root: repoRoot,
  },
  webpack(config, { isServer, webpack }) {
    // Browser-only. The Codex tree mounts CSR-only (dynamic ssr:false), so the
    // server build must stay clean — hard-aliasing `react` on the server would also
    // break Next's RSC `react-server` resolution. All shims + single-instance pins
    // live on the client build.
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),

        // Single react/react-dom/zustand/@noble/curves instance. Directory aliases
        // (no `$`) also capture subpaths (react/*, react-dom/*); the explicit
        // jsx-runtime pin guarantees the react-jsx transform's runtime import.
        "react/jsx-runtime$": `${reactDir}/jsx-runtime.js`,
        react: reactDir,
        "react-dom": reactDomDir,
        zustand: zustandDir,
        "@noble/curves": nobleCurvesDir,

        // Browser shims. The `node:`-scheme variants are handled by the
        // NormalModuleReplacementPlugin below (webpack routes scheme URIs past
        // resolve.alias); these bare `$` aliases catch the stripped specifier.
        buffer$: bufferShim,
        process$: processShim,
        crypto$: cryptoShim,
        stream$: streamShim,
        "@ardrive/turbo-sdk$": turboWeb,
      };

      // Node-only builtins the Arweave/Turbo tree pulls that have NO browser story
      // and are never reached on the browser code path (the sqlite address-book
      // store + Node fs/socket paths). Resolve them to an empty module so the client
      // build does not fail; a browser code path never constructs them.
      config.resolve.fallback = {
        ...(config.resolve.fallback ?? {}),
        sqlite: false,
        fs: false,
        "fs/promises": false,
        net: false,
        tls: false,
        child_process: false,
        worker_threads: false,
        path: false,
        os: false,
      };

      config.plugins.push(
        // Strip the `node:` scheme so the bare shim aliases + fallbacks above apply
        // (webpack resolves `node:`-prefixed requests through its scheme handler,
        // BEFORE resolve.alias — a plain `node:stream` alias silently never fires,
        // and the build dies with "UnhandledSchemeError" instead).
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
        // Inject `Buffer` (from the buffer package) and `process` (from the shim's
        // default export) wherever they appear as free variables.
        new webpack.ProvidePlugin({
          Buffer: ["buffer", "Buffer"],
          process: [processShim, "default"],
        }),
        // Map the bare `global` identifier the Arweave/Turbo libs reference onto
        // `globalThis` for the browser bundle.
        new webpack.DefinePlugin({
          global: "globalThis",
        }),
      );
    }

    return config;
  },
};

export default nextConfig;
