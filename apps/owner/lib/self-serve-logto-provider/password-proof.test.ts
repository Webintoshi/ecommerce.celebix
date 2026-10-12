import assert from "node:assert/strict";
import { createHash, createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { createLogtoOidcProvider } from "./provider.ts";

const issuer = "https://identity.example.test/oidc";
const resource = "urn:celebix:admin-signin-proof";
const verificationId = "a12345678901234567890";
const marker = `celebix:admin-password-record:${verificationId}`;
const tokenId = "access-token-id-1";
const nonce = "nonce_1234567890123456789012345678901234567890";
const now = new Date("2026-10-12T12:00:00Z");
const seconds = now.getTime() / 1000;
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), alg: "RS256", kid: "proof", use: "sig" };
const { privateKey: rotatedKey, publicKey: rotatedPublicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const rotatedJwk = { ...rotatedPublicKey.export({ format: "jwk" }), alg: "RS256", kid: "rotated", use: "sig" };
function signed(payload: Record<string, unknown>, key = privateKey, kid = "proof", algorithm = "RS256") {
  const input = [{ alg: algorithm, kid }, { iss: issuer, sub: "user-1", iat: seconds - 10, exp: seconds + 300, ...payload }]
    .map(x => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
  return `${input}.${createSign(`RSA-SHA${algorithm.slice(2)}`).update(input).end().sign(key).toString("base64url")}`;
}
function access(payload: Record<string, unknown> = {}) {
  return signed({ aud: resource, client_id: "panel-1", scope: "signin:proof", jti: tokenId, celebix_admin_password_proof: { version: 3, verificationId, method: "password", subject: "user-1", clientId: "panel-1", tokenId }, ...payload });
}
function fixture(accessToken = access(), configured = true, rotating = false, idOverrides: Record<string, unknown> = {}, idAlgorithm = "RS256") {
  let jwksReads = 0;
  const options: any = {
    issuer, discoveryUrl: `${issuer}/.well-known/openid-configuration`, clientId: "panel-1", clientSecret: "private-test-secret", tokenAuthMethod: "client_secret_basic", algorithms: [...new Set(["RS256", idAlgorithm])], clock: () => now, timeoutMs: 1000, maximumResponseBytes: 65536,
    ...(configured ? { passwordProof: { resource } } : {}),
    fetch: async (url: string, init: RequestInit) => {
      if (url.endsWith("openid-configuration")) return Response.json({ issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`, token_endpoint_auth_methods_supported: ["client_secret_basic"], id_token_signing_alg_values_supported: [...new Set(["RS256", idAlgorithm])] });
      if (url.endsWith("token")) {
        const body = new URLSearchParams(String(init.body));
        assert.equal(body.get("grant_type"), "authorization_code");
        return Response.json({ id_token: signed({ aud: "panel-1", nonce, amr: ["pwd", marker], auth_time: seconds - 10, at_hash: createHash(`sha${idAlgorithm.slice(2)}`).update(accessToken).digest().subarray(0, Number(idAlgorithm.slice(2)) / 16).toString("base64url"), email: "owner@example.test", email_verified: true, ...idOverrides }, privateKey, "proof", idAlgorithm), token_type: "Bearer", access_token: accessToken });
      }
      if (url.endsWith("jwks")) { jwksReads++; return Response.json({ keys: rotating && jwksReads > 1 ? [{ ...jwk, alg: undefined }, rotatedJwk] : [{ ...jwk, alg: undefined }] }); }
      throw new Error("unexpected URL");
    },
  };
  return createLogtoOidcProvider(options);
}
const authorization = { state: "state-1", nonce, codeChallenge: "challenge-1", codeChallengeMethod: "S256" as const, redirectUri: "https://panel.example.test/auth/callback" };
const callback = { code: "code-1", state: "state-1", codeVerifier: "verifier-1", redirectUri: authorization.redirectUri, expectedNonce: nonce, expectedIssuer: issuer, expectedAudience: "panel-1" };

test("explicit proof authorization adds exact resource/scope and forces fresh login", async () => {
  const url = await fixture().buildAuthorizationUrl({ ...authorization, passwordProof: { nonce } } as any);
  assert.equal(url.searchParams.get("resource"), resource);
  assert.equal(url.searchParams.get("scope"), "openid profile email signin:proof");
  assert.equal(url.searchParams.get("prompt"), "login consent");
  assert.equal(url.searchParams.has("sign_in_context"), false);
  assert.equal(url.searchParams.get("max_age"), "0");
});

test("legacy authorization and callback stay unchanged without explicit proof input", async () => {
  const provider = fixture("opaque-legacy-access");
  const url = await provider.buildAuthorizationUrl(authorization);
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(url.searchParams.has("sign_in_context"), false);
  assert.equal(url.searchParams.has("resource"), false);
  assert.equal(url.searchParams.has("prompt"), false);
  assert.equal((await provider.verifyCallback(callback)).passwordProof, undefined);
});

test("disabled capability rejects explicit proof authorization and callback", async () => {
  const provider = fixture(access(), false);
  await assert.rejects(async () => provider.buildAuthorizationUrl({ ...authorization, passwordProof: { nonce } } as any));
  await assert.rejects(() => provider.verifyCallback({ ...callback, passwordProof: true } as any));
});

test("provider validates signed access proof after ID token validation", async () => {
  const identity = await fixture().verifyCallback({ ...callback, passwordProof: true } as any);
  assert.equal(identity.passwordProof?.nonce, nonce);
  assert.equal(identity.passwordProof?.subject, identity.subject);
  assert.equal(identity.passwordProof?.method, "password");
  assert.equal(identity.passwordProof?.verificationId, verificationId);
  assert.equal(identity.passwordProof?.verifiedAt, "2026-10-12T11:59:50.000Z");
});

test("provider keeps signup without completed Password unproved and rejects another transaction", async () => {
  const input = { ...callback, passwordProof: true } as any;
  assert.equal((await fixture(access({ celebix_admin_password_proof: undefined })).verifyCallback(input)).passwordProof, undefined);
  await assert.rejects(() => fixture(access({ celebix_admin_password_proof: { version: 3, verificationId, method: "password", subject: "user-1", clientId: "panel-1", tokenId: "attacker-token" } })).verifyCallback(input));
  await assert.rejects(() => fixture("opaque-legacy-access").verifyCallback(input));
});

test("proof with an unknown signing key is rejected during the existing JWKS refresh cooldown", async () => {
  // First set only has the ID token key; a new proof kid must trigger the same refresh path.
  const rotated = signed({ aud: resource, client_id: "panel-1", scope: "signin:proof", jti: tokenId, celebix_admin_password_proof: { version: 3, verificationId, method: "password", subject: "user-1", clientId: "panel-1", tokenId } }, rotatedKey, "rotated");
  await assert.rejects(() => fixture(rotated, true, true).verifyCallback({ ...callback, passwordProof: true } as any));
});


test("proof rejects missing, invalid, or swapped access hashes and stale signed authentication time", async () => {
  const otherAccess = access({ jti: "another-code-access", celebix_admin_password_proof: { version: 3, verificationId, method: "password", subject: "user-1", clientId: "panel-1", tokenId: "another-code-access" } });
  const swappedHash = createHash("sha256").update(otherAccess).digest().subarray(0, 16).toString("base64url");
  for (const overrides of [
    { at_hash: undefined }, { at_hash: "" }, { at_hash: "invalid" }, { at_hash: swappedHash },
    { auth_time: undefined }, { auth_time: "recent" }, { auth_time: seconds - 301 },
    { auth_time: seconds + 31 }, { auth_time: seconds - 0.5 },
  ]) await assert.rejects(() => fixture(access(), true, false, overrides).verifyCallback({ ...callback, passwordProof: true } as any));
});


test("at_hash follows verified ID token signing algorithm, independently of access JWT algorithm", async () => {
  for (const algorithm of ["RS384", "RS512"]) {
    const identity = await fixture(access(), true, false, {}, algorithm).verifyCallback({ ...callback, passwordProof: true } as any);
    assert.equal(identity.passwordProof?.tokenId, tokenId);
    const wrongAlgorithmHash = createHash("sha256").update(access()).digest().subarray(0, 16).toString("base64url");
    await assert.rejects(() => fixture(access(), true, false, { at_hash: wrongAlgorithmHash }, algorithm).verifyCallback({ ...callback, passwordProof: true } as any));
  }
});


test("ordinary or absent signed methods cannot borrow a password claim from mutable session context", async () => {
  for (const amr of [undefined, [], ["pwd"], ["social"], "pwd", null]) {
    const identity = await fixture(access(), true, false, { amr }).verifyCallback({ ...callback, passwordProof: true } as any);
    assert.equal(identity.passwordProof, undefined);
  }
});

test("conflicting or malformed signed password record markers are rejected", async () => {
  for (const amr of [
    ["pwd", "celebix:admin-password-record:another-password"],
    ["pwd", marker, "extra"], [marker, "pwd"], ["social", marker],
    ["pwd", "celebix:admin-password-record:"], ["pwd", marker, marker],
  ]) await assert.rejects(() => fixture(access(), true, false, { amr }).verifyCallback({ ...callback, passwordProof: true } as any));
});

test("verification time comes from signed authentication completion, never refreshed access mint time", async () => {
  const identity = await fixture(access(), true, false, { auth_time: seconds - 240 }).verifyCallback({ ...callback, passwordProof: true } as any);
  assert.equal(identity.passwordProof?.verifiedAt, "2026-10-12T11:56:00.000Z");
  assert.equal(identity.passwordProof?.issuedAt, "2026-10-12T11:59:50.000Z");
});
