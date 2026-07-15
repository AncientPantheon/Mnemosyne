import { fetchLatestMnemosyneVersion, readMnemosyneVersion } from "../appVersion";
import {
  fetchLatestCodexVersion,
  fetchLatestKhronotonVersion,
  isNewerVersion,
  readCodexUiVersion,
  readKhronotonUiVersion,
} from "../codexVersion";

/**
 * The automaton itself (Mnemosyne, the Next.js app) — distinct from its constructors.
 * `installed` is the running build's version; `available` is the version on the deploy
 * branch (what a Deploy would `git pull` + rebuild). A Deploy rebuilds the app from
 * source, so an app update is a first-class reason to deploy — not just a constructor.
 */
export interface AppStatus {
  installed: string;
  available: string | null;
  updateAvailable: boolean;
}

/**
 * The status of one constructor (Codex, Khronoton, …) for the unified Deploy panel.
 * `installed` is what's compiled into / installed in the running build; `available`
 * is npm's latest (null if unreachable). `wired` is false for a constructor that
 * exists on npm but isn't a Mnemosyne dependency yet — it can never be "update
 * available" because there's nothing installed to update. Both Codex and Khronoton are
 * wired now; `wired` here is strictly "is a Mnemosyne dependency", distinct from
 * whether a constructor's runtime engine is switched on (Khronoton's autonomous
 * signing is a separate, Pythia-gated follow-up — the package ships regardless).
 */
export interface ConstructorStatus {
  key: "codex" | "khronoton";
  label: string;
  npmPackage: string;
  installed: string;
  available: string | null;
  wired: boolean;
  updateAvailable: boolean;
}

/** Aggregate deploy status — the single source for the Deploy button state. */
export interface ConstructorsStatus {
  /** The automaton app itself (installed build vs the version on the deploy branch). */
  mnemosyne: AppStatus;
  constructors: ConstructorStatus[];
  /** True when the app OR any wired constructor has a strictly-newer version. */
  anyUpdateAvailable: boolean;
  /** "bundle" = live standalone (deploy = on-box rebuild); "dev" = localhost pull. */
  deployMode: "bundle" | "dev";
}

/**
 * Read every constructor's installed-vs-available pair. Codex and Khronoton are both
 * wired (installed version read from node_modules; update flagged when npm is newer),
 * so either can drive a deploy. `wired` reflects dependency presence — Khronoton's
 * autonomous engine being switched on is a separate, Pythia-gated concern.
 */
export async function readConstructorsStatus(): Promise<ConstructorsStatus> {
  const [
    appInstalled,
    appLatest,
    codexInstalled,
    codexLatest,
    khronotonInstalled,
    khronotonLatest,
  ] = await Promise.all([
    Promise.resolve(readMnemosyneVersion()),
    fetchLatestMnemosyneVersion(),
    Promise.resolve(readCodexUiVersion()),
    fetchLatestCodexVersion(),
    Promise.resolve(readKhronotonUiVersion()),
    fetchLatestKhronotonVersion(),
  ]);

  const appUpdate =
    appLatest !== null && appInstalled !== "0.0.0"
      ? isNewerVersion(appLatest, appInstalled)
      : false;
  const mnemosyne: AppStatus = {
    installed: appInstalled,
    available: appLatest,
    updateAvailable: appUpdate,
  };

  const codexUpdate =
    codexLatest !== null && codexInstalled !== "unknown"
      ? isNewerVersion(codexLatest, codexInstalled)
      : false;

  const khronotonUpdate =
    khronotonLatest !== null && khronotonInstalled !== "unknown"
      ? isNewerVersion(khronotonLatest, khronotonInstalled)
      : false;

  const constructors: ConstructorStatus[] = [
    {
      key: "codex",
      label: "Codex",
      npmPackage: "@ancientpantheon/codex",
      installed: codexInstalled,
      available: codexLatest,
      wired: true,
      updateAvailable: codexUpdate,
    },
    {
      key: "khronoton",
      label: "Khronoton",
      npmPackage: "@ancientpantheon/khronoton-core",
      installed: khronotonInstalled,
      available: khronotonLatest,
      wired: true,
      updateAvailable: khronotonUpdate,
    },
  ];

  return {
    mnemosyne,
    constructors,
    anyUpdateAvailable:
      mnemosyne.updateAvailable ||
      constructors.some((c) => c.wired && c.updateAvailable),
    deployMode: process.env.NODE_ENV === "production" ? "bundle" : "dev",
  };
}
