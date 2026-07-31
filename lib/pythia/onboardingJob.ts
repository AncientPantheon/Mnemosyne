import { ensureConnectorApolloPair } from "./apolloIdentity";
import { getConnectorForHalf } from "./connectorClient";
import { readConnectorStatus, writeConnectorStatus, type ConnectorStatus } from "./connectorStatus";
import { deployApolloHalf, linkDualApiKey } from "./onboardingChain";

/**
 * The onboarding orchestrator — organs/06's full ensure-identity → deploy ×2
 * → link → prove ×2 lifecycle, run once, fire-and-forget, reachable only
 * from the ancient-gated `POST /api/admin/pythia-connector`.
 * Mirrors `lib/deploy/devDeploy.ts`'s `startDevDeploy` shape: runs
 * in-process, updates `lib/pythia/connectorStatus.ts`'s `ConnectorStatus` as
 * it advances, and NEVER lets an exception escape to the caller — the whole
 * body is one try/catch, and any thrown error at any stage is recorded as
 * `stage: "failed"` + `lastError` instead of propagating.
 *
 * Every `writeConnectorStatus` call ANNOUNCES the stage about to run (not
 * the stage just finished), same "truthful mid-run progress" posture the
 * deploy panel's own `writeFileSync(deployStatusPath(id), "running")` (set
 * BEFORE `spawn`, not after) already established — so a `GET /status` poll
 * mid-run reflects what's actually happening right now.
 */

/** Fixed free-text consumer-lane identifier for `C_LinkDualApiKey` — the
 * doc's own free-text lane identifier, not specified further; "mnemosyne"
 * is Mnemosyne's own choice, not derived from anything else in this repo. */
const CONSUMER_LANE = "mnemosyne";

function nowIso(): string {
  return new Date().toISOString();
}

/** Merge `patch` onto the CURRENT persisted status and persist the result,
 * stamping `updatedAt`. Every stage transition below goes through this so a
 * later write never accidentally drops a field an earlier stage recorded
 * (e.g. an Apollo public key). */
function patchStatus(patch: Partial<ConnectorStatus>): ConnectorStatus {
  const next: ConnectorStatus = { ...readConnectorStatus(), ...patch, updatedAt: nowIso() };
  writeConnectorStatus(next);
  return next;
}

export async function runOnboarding(): Promise<void> {
  try {
    patchStatus({ stage: "ensuring-identity" });
    const { standardPublicKey, smartPublicKey, standardAddress, smartAddress } =
      await ensureConnectorApolloPair();

    // The Standard half is necessarily self-service for its OWN deploy
    // (organs/06 §1a: "user-called, self-service" — it authorizes and pays
    // for itself, being the first thing that exists on-chain for this
    // identity). Reusing it as `ownerAccount` for the Smart deploy too keeps
    // one owner account across the whole pairing. On-chain calls sign with
    // the RAW public key (`createMnemosyneKeyResolver().getKeyPairByPublicKey`'s
    // own lookup convention, `lib/khronoton/keyResolver.ts`) — never the
    // `₱./Π.`-prefixed address, which that resolver does not index by.
    const ownerAccount = standardPublicKey;

    // `connectorStatus` and `getConnectorForHalf` below are Pythia's HTTP
    // wire protocol (`/connectors/auth/*`), which requires the `₱./Π.`-
    // prefixed 162-char ADDRESS, not the raw public key — see
    // `apolloIdentity.ts`'s `ConnectorApolloPair` doc comment for the full
    // on-chain-vs-wire-protocol split.
    patchStatus({
      stage: "deploying-standard",
      standardApollo: standardAddress,
      smartApollo: smartAddress,
    });
    await deployApolloHalf(ownerAccount, standardPublicKey, true);

    patchStatus({ stage: "deploying-smart" });
    await deployApolloHalf(ownerAccount, smartPublicKey, false);

    patchStatus({ stage: "linking" });
    await linkDualApiKey(standardPublicKey, smartPublicKey, CONSUMER_LANE);

    patchStatus({ stage: "proving-standard" });
    // A `{status: "pending"}` result (ownership proven, not yet an active
    // dual link) is an EXPECTED steady state at this point in the lifecycle,
    // not a failure — only a THROWN `PythiaConnectorError` fails this stage.
    await getConnectorForHalf(standardAddress).refresh();

    patchStatus({ stage: "proving-smart" });
    await getConnectorForHalf(smartAddress).refresh();

    patchStatus({ stage: "success" });
    // Best-effort only: opportunistically pick up an already-active secret
    // into T2's secret store if Pythia's own activation-resolver was fast.
    // Never blocks or fails the job on its outcome — success was already
    // recorded above regardless.
    try {
      await getConnectorForHalf(standardAddress).refresh();
    } catch {
      /* best-effort — intentionally ignored */
    }
  } catch (err) {
    patchStatus({
      stage: "failed",
      lastError: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Starts onboarding, guarding against a second concurrent run. There is no
 * double-start guard precedent to mirror in this codebase: the closest
 * analog, `POST /api/admin/deploy` (`app/api/admin/deploy/route.ts`), has NO
 * such guard at all — it always mints a fresh id and starts a new deploy
 * regardless of whether one is already in flight, which is fine there (each
 * deploy id is independent and disk-spooled, re-running is non-destructive)
 * but would be wrong here: this job spends real STOA and creates a permanent
 * on-chain identity, so a second concurrent run must never fire. Absent a
 * precedent, this uses the simplest guard available: the status file's own
 * `stage` IS the guard — anything other than `"idle"` or `"failed"` means a
 * run is already in flight (or already succeeded), so this throws instead of
 * starting another. (`app/api/admin/pythia-connector/route.ts` is expected to
 * pre-check the same condition itself to return a `409` instead of relying on
 * this throw, but this function stays defensive regardless of caller.)
 */
export function startOnboarding(): void {
  const current = readConnectorStatus();
  if (current.stage !== "idle" && current.stage !== "failed") {
    throw new Error(`pythia connector onboarding is already in progress (stage: ${current.stage})`);
  }
  writeConnectorStatus({
    ...current,
    stage: "ensuring-identity",
    startedAt: nowIso(),
    updatedAt: nowIso(),
    lastError: null,
  });
  void runOnboarding();
}
