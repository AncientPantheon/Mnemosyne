import { readMnemosyneVersion } from "../appVersion";
import { deployMode } from "./constructors";

/**
 * The on-box deploy readout (§2 of the deploy-panel standard), minus `active`:
 * which side of the blue-green pair is serving, on which loopback port, from which
 * container, at which version.
 */
export interface BoxStatus {
  /** "bundle" = a real on-box blue-green deploy; "dev" = localhost constructor pull. */
  mode: "bundle" | "dev";
  /** The live color, "blue" or "green"; null when nothing injected it. */
  color: string | null;
  /** The loopback port that color binds (e.g. "8081"); null when unknown. */
  port: string | null;
  /** The exact container name the host deployer manages; null when unknown. */
  container: string | null;
  /** The version this running container reports. */
  version: string;
}

/** An injected identity value, or null when the deployer didn't provide one. */
const envOrNull = (name: string): string | null => process.env[name] ?? null;

/**
 * Assemble the box identity the panel renders.
 *
 * The container deliberately holds no Docker/nginx power, so it cannot discover its
 * own color, port or container name — the host deployer INJECTS them as
 * `MNEMOSYNE_COLOR` / `MNEMOSYNE_LOOPBACK_PORT` / `MNEMOSYNE_CONTAINER` when it
 * starts the new container. On localhost, or on a container started before that
 * change, they are simply absent: each degrades to `null` (the panel shows
 * "unknown"), never a crash.
 *
 * `mode` comes from the shared `deployMode()` helper rather than a second `NODE_ENV`
 * check, so the Deploy button and this readout can never disagree about bundle-vs-dev
 * — and this endpoint stays probe-free (the panel calls it on every mount to
 * auto-attach; routing it through the full constructors read would cost three network
 * probes for one boolean).
 */
export async function readBoxStatus(): Promise<BoxStatus> {
  return {
    mode: deployMode(),
    color: envOrNull("MNEMOSYNE_COLOR"),
    port: envOrNull("MNEMOSYNE_LOOPBACK_PORT"),
    container: envOrNull("MNEMOSYNE_CONTAINER"),
    version: readMnemosyneVersion(),
  };
}
