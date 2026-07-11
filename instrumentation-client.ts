// Client instrumentation — Next runs this in the browser BEFORE any app/route
// code. It is the Next seam replacing the playground's "first import in main.tsx"
// polyfill trick: it installs the Node globals the @stoachain triplet and the
// Arweave/Turbo libraries reach for at module-eval time.
//
// - `Buffer`: ~21 files across the @stoachain triplet (kadena-stoic-legacy signing,
//   stoa-core) reference `Buffer` as a global; without it they throw
//   "Buffer is not defined" on the signing/decrypt paths.
// - `process`: the Arweave/Turbo real-toggle path reads a bare `process` global.
// - `global`: the Node-oriented Arweave/Turbo libs reference a bare `global`.
import { Buffer } from "buffer";
import processShim from "./lib/shims/process.shim";

// `as unknown as` detaches from the ambient globalThis types (Node's `Process`,
// the DOM `Buffer`) so these partial browser shims assign cleanly.
const g = globalThis as unknown as {
  Buffer?: typeof Buffer;
  process?: unknown;
  global?: unknown;
};

g.Buffer ??= Buffer;
g.process ??= processShim;
g.global ??= globalThis;
