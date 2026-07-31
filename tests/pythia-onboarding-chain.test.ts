import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `lib/pythia/onboardingChain.ts` — the on-chain build+sign+relay leg of Pythia
 * onboarding. This makes REAL chain calls in production (spends real STOA), so
 * every dependency that could touch a network is stubbed here: the chain runtime
 * (`getChainRuntime`, mirroring `tests/khronoton-api-route.test.ts`'s
 * `vi.mock("../lib/khronoton/runtime", ...)`), the key resolver, admin settings,
 * and the `PythiaClient` relay itself. What's under test is the ADAPTER contract:
 * the exact Pact code built per call, the exact signer set used, and that the
 * signed command is what reaches `PythiaClient.send`'s `cmds` array.
 */

const PACT_BUILDER_CALLS: string[] = [];
const SET_META_CALLS: Record<string, unknown>[] = [];
const ADD_SIGNER_CALLS: string[] = [];
const SIGN_CALLS: { tx: unknown; keypairs: unknown[] }[] = [];
const SEND_CALLS: { cmds: unknown[] }[] = [];

function makeChainBuilder(code: string) {
  const chain = {
    setMeta: vi.fn((meta: Record<string, unknown>) => {
      SET_META_CALLS.push(meta);
      return chain;
    }),
    setNetworkId: vi.fn(() => chain),
    addSigner: vi.fn((publicKey: string) => {
      ADD_SIGNER_CALLS.push(publicKey);
      return chain;
    }),
    createTransaction: vi.fn(() => ({ cmd: code, hash: `hash-${code}`, sigs: [] })),
  };
  return chain;
}

vi.mock("../lib/khronoton/runtime", () => ({
  getChainRuntime: async () => ({
    Pact: {
      builder: {
        execution: (code: string) => {
          PACT_BUILDER_CALLS.push(code);
          return makeChainBuilder(code);
        },
      },
    },
    universalSignTransaction: vi.fn(async (tx: unknown, keypairs: unknown[]) => {
      SIGN_CALLS.push({ tx, keypairs });
      return { signed: true, tx, keypairs };
    }),
    anuToStoa: (anu: number) => anu / 1e12,
    networkId: "test-network",
    getPactUrl: (chainId: string) => `http://node.test/${chainId}`,
  }),
}));

const getKeyPairByPublicKeyMock = vi.fn(async (publicKey: string) => ({
  publicKey,
  privateKey: `secret-for-${publicKey}`,
  seedType: "koala",
}));

vi.mock("../lib/khronoton/keyResolver", () => ({
  createMnemosyneKeyResolver: () => ({
    getKeyPairByPublicKey: (publicKey: string) => getKeyPairByPublicKeyMock(publicKey),
  }),
}));

vi.mock("../lib/adminSettings", () => ({
  readAdminSettings: () => ({ pythiaUrl: "http://pythia.test" }),
}));

const sendMock = vi.fn(async (input: { cmds: unknown[] }) => {
  SEND_CALLS.push(input);
  return { ok: true };
});

vi.mock("@ancientpantheon/pythia-client", () => ({
  PythiaClient: vi.fn().mockImplementation(() => ({ send: sendMock })),
}));

import { PythiaClient } from "@ancientpantheon/pythia-client";
import { deployApolloHalf, linkDualApiKey } from "../lib/pythia/onboardingChain";

beforeEach(() => {
  PACT_BUILDER_CALLS.length = 0;
  SET_META_CALLS.length = 0;
  ADD_SIGNER_CALLS.length = 0;
  SIGN_CALLS.length = 0;
  SEND_CALLS.length = 0;
  sendMock.mockClear();
  (PythiaClient as unknown as ReturnType<typeof vi.fn>).mockClear();
  getKeyPairByPublicKeyMock.mockClear();
  getKeyPairByPublicKeyMock.mockImplementation(async (publicKey: string) => ({
    publicKey,
    privateKey: `secret-for-${publicKey}`,
    seedType: "koala",
  }));
});

describe("deployApolloHalf", () => {
  it("builds the exact C_DeployApolloPythiaApiKey Pact code with the given args", async () => {
    await deployApolloHalf("k:owner-account", "apollo-pub-standard", true);
    expect(PACT_BUILDER_CALLS).toEqual([
      '(ouronet-ns.PYTHIA.C_DeployApolloPythiaApiKey "k:owner-account" "apollo-pub-standard" true)',
    ]);
  });

  it("renders isStandard=false as the Pact literal `false`, not the JS truthy string", async () => {
    await deployApolloHalf("k:owner-account", "apollo-pub-smart", false);
    expect(PACT_BUILDER_CALLS[0]).toContain('"apollo-pub-smart" false)');
  });

  it("signs with exactly ONE keypair — the Apollo half being deployed", async () => {
    await deployApolloHalf("k:owner-account", "apollo-pub-standard", true);
    expect(ADD_SIGNER_CALLS).toEqual(["apollo-pub-standard"]);
    expect(SIGN_CALLS).toHaveLength(1);
    expect(SIGN_CALLS[0].keypairs).toHaveLength(1);
    expect(SIGN_CALLS[0].keypairs[0]).toMatchObject({
      publicKey: "apollo-pub-standard",
      secretKey: "secret-for-apollo-pub-standard",
    });
  });

  it("relays the signed command through PythiaClient.send's cmds array", async () => {
    await deployApolloHalf("k:owner-account", "apollo-pub-standard", true);
    expect(PythiaClient).toHaveBeenCalledWith({ baseUrl: "http://pythia.test" });
    expect(SEND_CALLS).toHaveLength(1);
    expect(SEND_CALLS[0].cmds).toHaveLength(1);
    expect(SEND_CALLS[0].cmds[0]).toMatchObject({ signed: true });
  });
});

describe("linkDualApiKey", () => {
  it("builds the exact C_LinkDualApiKey Pact code with the given args", async () => {
    await linkDualApiKey("apollo-pub-standard", "apollo-pub-smart", "mnemosyne");
    expect(PACT_BUILDER_CALLS).toEqual([
      '(ouronet-ns.PYTHIA.C_LinkDualApiKey "apollo-pub-standard" "apollo-pub-smart" "mnemosyne")',
    ]);
  });

  it("signs with BOTH half-owners' keypairs, standard then smart", async () => {
    await linkDualApiKey("apollo-pub-standard", "apollo-pub-smart", "mnemosyne");
    expect(ADD_SIGNER_CALLS).toEqual(["apollo-pub-standard", "apollo-pub-smart"]);
    expect(SIGN_CALLS).toHaveLength(1);
    expect(SIGN_CALLS[0].keypairs).toHaveLength(2);
    expect(SIGN_CALLS[0].keypairs).toEqual([
      expect.objectContaining({ publicKey: "apollo-pub-standard" }),
      expect.objectContaining({ publicKey: "apollo-pub-smart" }),
    ]);
  });

  it("relays the signed command through PythiaClient.send's cmds array", async () => {
    await linkDualApiKey("apollo-pub-standard", "apollo-pub-smart", "mnemosyne");
    expect(SEND_CALLS).toHaveLength(1);
    expect(SEND_CALLS[0].cmds[0]).toMatchObject({ signed: true });
  });
});

describe("known gap: Apollo-curve keys cannot be resolved by the Kadena-native signing pipeline", () => {
  // Regression guard for a CONFIRMED, real production failure mode (documented in
  // design.md's Decisions): the connector's own Standard/Smart Apollo keys are
  // `dalos-apollo` Schnorr-v2-curve keys stored as base-49 scalars, but
  // `createMnemosyneKeyResolver().getKeyPairByPublicKey` (`lib/khronoton/keyResolver.ts`)
  // rejects any decrypted pure-keypair secret that isn't raw hex — EXACTLY the shape an
  // Apollo secret is. This test reproduces that exact rejection message (verbatim, from
  // the real `assertHexSecret` source) and asserts `deployApolloHalf` re-throws it wrapped
  // in a clear, specific explanation instead of leaking the resolver's generic "codex
  // entry shape has drifted" message, which is misleading for this exact root cause.
  it("wraps a hex-shape rejection from the key resolver with a clear Apollo-curve explanation", async () => {
    getKeyPairByPublicKeyMock.mockRejectedValueOnce(
      new Error(
        "khronoton key resolver: decrypted pure-keypair secret is not a raw hex key — " +
          "the codex entry shape has drifted; refusing to sign.",
      ),
    );

    const error = await deployApolloHalf("k:owner-account", "apollo-pub-standard", true).catch(
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/dalos-apollo|Apollo-curve|Schnorr/i);
    expect((error as Error).message).toMatch(/not yet supported/i);
  });

  it("preserves the resolver's original error text so the real cause is still visible", async () => {
    getKeyPairByPublicKeyMock.mockRejectedValueOnce(
      new Error(
        "khronoton key resolver: decrypted pure-keypair secret is not a raw hex key — " +
          "the codex entry shape has drifted; refusing to sign.",
      ),
    );

    await expect(
      deployApolloHalf("k:owner-account", "apollo-pub-standard", true),
    ).rejects.toThrow(/codex entry shape has drifted/);
  });
});

describe("VERIFY-against-live-module warning", () => {
  it("is present in the source, marking BOTH Pact-code-string constants", () => {
    const source = readFileSync(
      join(process.cwd(), "lib/pythia/onboardingChain.ts"),
      "utf8",
    );
    const matches = source.match(
      /VERIFY AGAINST THE LIVE PYTHIA\.pact MODULE BEFORE THIS PATH IS EVER TRIGGERED/g,
    );
    expect(matches).not.toBeNull();
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});
