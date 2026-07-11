import { describe, it, expect } from "vitest";
import {
  generateKeyPair,
  SignJWT,
  exportJWK,
  createLocalJWKSet,
  type JWTVerifyGetKey,
  type JWK,
  type CryptoKey,
} from "jose";

import { verifyIdToken, hasAncientRole } from "../lib/auth/idToken";

const ISSUER = "https://ancientholdings.eu";
const CLIENT_ID = "mnemosyne";
const NONCE = "nonce-123";
const KID = "test-key";

interface MintOpts {
  iss?: string;
  aud?: string;
  sub?: string;
  nonce?: string;
  roles?: unknown;
  alg?: string;
  key?: CryptoKey | Uint8Array;
  kid?: string;
}

async function harness() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = (await exportJWK(publicKey)) as JWK;
  jwk.kid = KID;
  jwk.alg = "RS256";
  jwk.use = "sig";
  const jwks: JWTVerifyGetKey = createLocalJWKSet({ keys: [jwk] });

  function mint(opts: MintOpts = {}): Promise<string> {
    const {
      iss = ISSUER,
      aud = CLIENT_ID,
      sub = "user-1",
      nonce = NONCE,
      roles = ["ancient"],
      alg = "RS256",
      key = privateKey,
      kid = KID,
    } = opts;
    return new SignJWT({ nonce, roles })
      .setProtectedHeader({ alg, kid })
      .setIssuer(iss)
      .setAudience(aud)
      .setSubject(sub)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(key);
  }

  const verify = (token: string, expectedNonce = NONCE) =>
    verifyIdToken(token, { jwks, issuer: ISSUER, clientId: CLIENT_ID, expectedNonce });

  return { mint, verify };
}

describe("verifyIdToken", () => {
  it("accepts a well-formed token and extracts the sub + roles identity", async () => {
    const { mint, verify } = await harness();
    const identity = await verify(await mint({ sub: "abc", roles: ["ancient"] }));
    expect(identity.sub).toBe("abc");
    expect(identity.roles).toEqual(["ancient"]);
  });

  it("rejects a token from a different issuer (iss pin)", async () => {
    const { mint, verify } = await harness();
    await expect(verify(await mint({ iss: "https://evil.example" }))).rejects.toThrow();
  });

  it("rejects a token minted for a different audience (cross-client token defence)", async () => {
    const { mint, verify } = await harness();
    await expect(verify(await mint({ aud: "someone-else" }))).rejects.toThrow();
  });

  it("rejects a nonce that does not match the login request (replay defence)", async () => {
    const { mint, verify } = await harness();
    await expect(verify(await mint(), "a-different-nonce")).rejects.toThrow();
  });

  it("rejects an HS256 token forged on the published public key (alg pin excludes HS256/none)", async () => {
    const { mint, verify } = await harness();
    const forged = await mint({
      alg: "HS256",
      key: new TextEncoder().encode("attacker-guessed-secret"),
      kid: "whatever",
    });
    await expect(verify(forged)).rejects.toThrow();
  });

  it("rejects a token with an empty sub (no anonymous session)", async () => {
    const { mint, verify } = await harness();
    await expect(verify(await mint({ sub: "" }))).rejects.toThrow(/sub/);
  });

  it("keeps only string roles and ignores non-string entries", async () => {
    const { mint, verify } = await harness();
    const identity = await verify(await mint({ roles: ["ancient", 7, "operator", null] }));
    expect(identity.roles).toEqual(["ancient", "operator"]);
  });

  it("yields empty roles when the claim is absent or non-array (fails closed to no admin)", async () => {
    const { mint, verify } = await harness();
    const identity = await verify(await mint({ roles: "ancient" }));
    expect(identity.roles).toEqual([]);
  });
});

describe("hasAncientRole", () => {
  it("admits only the ancient tier — operator and empty are not admins", () => {
    expect(hasAncientRole(["ancient"])).toBe(true);
    expect(hasAncientRole(["ancient", "operator"])).toBe(true);
    expect(hasAncientRole(["operator"])).toBe(false);
    expect(hasAncientRole([])).toBe(false);
  });
});
