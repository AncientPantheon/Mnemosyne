import { fetchLatestMnemosyneVersion, readMnemosyneVersion } from "../appVersion";
import {
  fetchLatestCodexVersion,
  fetchLatestKhronotonVersion,
  fetchLatestPythiaClientVersion,
  isNewerVersion,
  PYTHIA_CLIENT_PACKAGE,
  readCodexUiVersion,
  readKhronotonUiVersion,
  readPythiaClientVersion,
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
 * available" because there's nothing installed to update. Codex, Khronoton, and
 * Pythia are all wired now; `wired` here is strictly "is a Mnemosyne dependency",
 * distinct from whether a constructor's own live capability is switched on
 * (Khronoton's autonomous signing and Pythia's connector-auth are each a separate,
 * later follow-up — the packages ship regardless).
 */
export interface ConstructorStatus {
  key: "codex" | "khronoton" | "pythia";
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
 * THE bundle-vs-dev rule — one definition, so every surface agrees.
 *
 * Deliberately a standalone helper rather than an inline check inside
 * `readConstructorsStatus()`: the deploy-status endpoint needs only this boolean, and
 * routing it through the full constructors read would drag three network probes
 * (npm ×2 + GitHub raw) into a call the admin panel makes on every mount to
 * auto-attach. Callers that want ONLY the mode import this; callers that want the
 * whole version readout still get `deployMode` on the aggregate.
 */
export function deployMode(): "bundle" | "dev" {
  return process.env.NODE_ENV === "production" ? "bundle" : "dev";
}

/**
 * Read every constructor's installed-vs-available pair. Codex, Khronoton, and Pythia
 * are all wired (installed version read from node_modules; update flagged when npm is
 * newer), so any of the three can drive a deploy. `wired` reflects dependency
 * presence — Khronoton's autonomous engine and Pythia's connector-auth being switched
 * on are each a separate, later concern.
 */
export async function readConstructorsStatus(): Promise<ConstructorsStatus> {
  const [
    appInstalled,
    appLatest,
    codexInstalled,
    codexLatest,
    khronotonInstalled,
    khronotonLatest,
    pythiaInstalled,
    pythiaLatest,
  ] = await Promise.all([
    Promise.resolve(readMnemosyneVersion()),
    fetchLatestMnemosyneVersion(),
    Promise.resolve(readCodexUiVersion()),
    fetchLatestCodexVersion(),
    Promise.resolve(readKhronotonUiVersion()),
    fetchLatestKhronotonVersion(),
    Promise.resolve(readPythiaClientVersion()),
    fetchLatestPythiaClientVersion(),
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

  const pythiaUpdate =
    pythiaLatest !== null && pythiaInstalled !== "unknown"
      ? isNewerVersion(pythiaLatest, pythiaInstalled)
      : false;

  // Row order is FIXED and canonical across every Pantheon automaton — Pythia, Codex,
  // Khronoton — per automaton/05-deploy-panel-and-progress.md §1e. Not left to this
  // (or any) automaton's own install/wiring order.
  const constructors: ConstructorStatus[] = [
    {
      key: "pythia",
      label: "Pythia",
      npmPackage: PYTHIA_CLIENT_PACKAGE,
      installed: pythiaInstalled,
      available: pythiaLatest,
      wired: true,
      updateAvailable: pythiaUpdate,
    },
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
    deployMode: deployMode(),
  };
}
