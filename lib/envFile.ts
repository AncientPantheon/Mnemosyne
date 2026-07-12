import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";

/**
 * Atomically write `contents` to `path` at mode 0o600: write to a sibling temp
 * file, fsync it, then `rename` it into place. A rename on one filesystem is
 * atomic, so a crash never leaves a truncated file. This is load-bearing for the
 * master-key rotation — a plain truncate-then-write that crashed mid-way could
 * lose the freshly-rotated key and brick the codex (handoff §4 step 5).
 */
export function atomicWriteFileSync(path: string, contents: string): void {
  const tmp = join(dirname(path), `.${process.pid}-${Date.now()}.tmp`);
  const fd = openSync(tmp, "w", 0o600);
  try {
    writeSync(fd, contents);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

/**
 * Upsert a single `KEY=value` line in an env file, PRESERVING every other line
 * (comments, other vars, blank lines). Rewrites the whole file atomically via
 * {@link atomicWriteFileSync}. If the key is absent it is appended (before a single
 * trailing blank line, if present). Used by master-key rotation to persist the new
 * key without disturbing OIDC creds / session secret / codex-dir.
 */
export function upsertEnvVar(envPath: string, key: string, value: string): void {
  const line = `${key}=${value}`;
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const lines = existing === "" ? [] : existing.split(/\r?\n/);

  const prefix = `${key}=`;
  let replaced = false;
  const next = lines.map((l) => {
    if (l.startsWith(prefix)) {
      replaced = true;
      return line;
    }
    return l;
  });

  if (!replaced) {
    if (next.length > 0 && next[next.length - 1] === "") {
      next.splice(next.length - 1, 0, line);
    } else {
      next.push(line);
    }
  }

  // Preserve a single trailing newline (typical for env files).
  const content = next.join("\n").replace(/\n*$/, "\n");
  atomicWriteFileSync(envPath, content);
}
