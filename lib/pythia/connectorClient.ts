import { PythiaClient, PythiaConnector } from "@ancientpantheon/pythia-client";

import { readAdminSettings } from "../adminSettings";
import { createMnemosyneApolloSigner } from "./apolloSigner";
import { MnemosyneConnectorSecretStore } from "./connectorSecretStore";
import { readConnectorStatus } from "./connectorStatus";

/**
 * Ongoing (post-onboarding) gated Pythia access — organs/06 §2c/§4. Two
 * entry points:
 *  - `getConnectorForHalf(apolloAccount)` builds a `PythiaConnector` for ONE
 *    Apollo half (Standard or Smart), wired with Mnemosyne's own
 *    `ApolloSigner` (T3, `apolloSigner.ts`) and sealed `SecretStorage` (T2,
 *    `connectorSecretStore.ts`). Used both by the onboarding job's proving
 *    stages (`lib/pythia/onboardingJob.ts`) and by `getGatedPythiaClient`
 *    below for ongoing use.
 *  - `getGatedPythiaClient()` is what the rest of Mnemosyne should call for
 *    any Pythia access that wants gated attribution when available. It is
 *    strictly additive and never throws: with no successful onboarding yet
 *    (`stage !== "success"`), it degrades to a plain, unattributed
 *    `PythiaClient` — the same keyless/ungated mode Mnemosyne already used
 *    before this connector existed. Once `stage === "success"`, it wires
 *    `pythiaKey` from the Standard half's connector's own `keyProvider()`
 *    (the SDK's own "resolved fresh per request, no manual refresh loop"
 *    idiom — see `PythiaConnector.keyProvider()`'s own doc comment). Either
 *    half works once linked (doc §2c); Standard is the reasoned default
 *    since it's the self-service half deployed/proved first in the
 *    onboarding sequence (see `onboardingJob.ts`).
 */
export function getConnectorForHalf(apolloAccount: string): PythiaConnector {
  return new PythiaConnector({
    baseUrl: readAdminSettings().pythiaUrl,
    apolloAccount,
    signer: createMnemosyneApolloSigner(),
    storage: new MnemosyneConnectorSecretStore(),
  });
}

export function getGatedPythiaClient(): PythiaClient {
  const status = readConnectorStatus();
  if (status.stage !== "success" || !status.standardApollo) {
    return new PythiaClient({ baseUrl: readAdminSettings().pythiaUrl });
  }
  return new PythiaClient({
    baseUrl: readAdminSettings().pythiaUrl,
    pythiaKey: getConnectorForHalf(status.standardApollo).keyProvider(),
  });
}
