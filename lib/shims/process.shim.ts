// Minimal browser `process` polyfill for the Arweave/Turbo path.
//
// The Node-oriented Arweave libraries (`arweave`, `@ardrive/turbo-sdk`) reach for
// a bare `process` global (e.g. `process.env`, `process.browser`, `process.nextTick`)
// that the browser bundle does NOT supply. Rather than pull the full `process` npm
// package, this hand-rolled shim supplies the handful of members those libs touch.
// The `process` specifier is aliased onto this file in next.config.ts, and its
// default export is fed to webpack's ProvidePlugin so bare `process` references in
// the real-toggle Arweave path resolve here instead of crashing the client bundle.
const processShim = {
  env: {} as Record<string, string | undefined>,
  browser: true,
  version: "",
  versions: {} as Record<string, string>,
  platform: "browser",
  nextTick: (cb: (...args: unknown[]) => void, ...args: unknown[]): void => {
    queueMicrotask(() => cb(...args));
  },
};

export default processShim;
