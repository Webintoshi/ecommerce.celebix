import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import vm from "node:vm";
import { createLocalJWKSet } from "jose";

const customizer = await import("./customizer.ts").catch(() => ({} as any));
const verifier = await import("./verifier.ts").catch(() => ({} as any));
const resource = "urn:celebix:admin-signin-proof";
const nonce = "nonce_1234567890123456789012345678901234567890";
const issuer = "https://identity.example.test/oidc";
const now = new Date("2026-10-12T12:00:00Z");
const seconds = now.getTime() / 1000;
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: wrongKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwks = createLocalJWKSet({ keys: [{ ...publicKey.export({ format: "jwk" }), alg: "RS256", use: "sig", kid: "proof-key" }] });
const verificationId = "a12345678901234567890";
const tokenId = "access-token-id-1";
const claim = { version: 3, method: "password", tokenId, verificationId, subject: "user-1", clientId: "panel-1" };

function source() {
  return {
    token: { jti: tokenId, kind: "AccessToken", accountId: "user-1", clientId: "panel-1", aud: resource, scope: "signin:proof", gty: "authorization_code" },
    context: {
      user: { id: "user-1", primaryEmail: "owner@example.test", username: "owner", primaryPhone: "905551112233", hasPassword: true },
      interaction: { interactionEvent: "SignIn", userId: "user-1", verificationRecords: [{ id: verificationId, type: "Password", verified: true, identifier: { type: "email", value: "owner@example.test" } }] },
    },
  };
}

test("actual verified Password record matching identified account attests this transaction", async () => {
  assert.equal(typeof customizer.createAdminPasswordProofCustomizer, "function");
  const getClaims = customizer.createAdminPasswordProofCustomizer({ eligibleClientIds: ["panel-1"] });
  assert.deepEqual(await getClaims(source()), { celebix_admin_password_proof: claim });
  for (const [type, value] of [["username", "owner"], ["phone", "905551112233"], ["userId", "user-1"]]) {
    const input = source();
    input.context.interaction.verificationRecords[0]!.identifier = { type: type!, value: value! };
    assert.deepEqual(await getClaims(input), { celebix_admin_password_proof: claim });
  }
});

test("verified email accepts case variants while deployed username policy and identity bindings remain exact", async () => {
  const getClaims = customizer.createAdminPasswordProofCustomizer({ eligibleClientIds: ["panel-1"] });
  const script = customizer.buildAdminPasswordProofCustomizerScript({ eligibleClientIds: ["panel-1"] });
  for (const [type, value] of [["email", "OWNER@EXAMPLE.TEST"]]) {
    const input = source();
    input.context.interaction.verificationRecords[0]!.identifier = { type: type!, value: value! };
    assert.deepEqual(await getClaims(input), { celebix_admin_password_proof: claim });
    assert.deepEqual(JSON.parse(JSON.stringify(await vm.runInNewContext(`${script}\ngetCustomJwtClaims(input)`, { input }))), { celebix_admin_password_proof: claim });
    input.context.interaction.verificationRecords[0]!.identifier.value = type === "email" ? "ATTACKER@EXAMPLE.TEST" : "ATTACKER";
    assert.deepEqual(await getClaims(input), {});
  }
  const wrongAccount = source();
  wrongAccount.context.interaction.verificationRecords[0]!.identifier.value = "OWNER@EXAMPLE.TEST";
  wrongAccount.context.interaction.userId = "other-user";
  assert.deepEqual(await getClaims(wrongAccount), {});
  for (const [type, value] of [["username", "OWNER"], ["username", "attacker"], ["userId", "USER-1"], ["phone", "+905551112233"]]) {
    const input = source();
    input.context.interaction.verificationRecords[0]!.identifier = { type: type!, value: value! };
    assert.deepEqual(await getClaims(input), {});
  }
});

test("password proof fails closed for every unrelated account, flow, record and client context", async () => {
  assert.equal(typeof customizer.createAdminPasswordProofCustomizer, "function");
  const getClaims = customizer.createAdminPasswordProofCustomizer({ eligibleClientIds: ["panel-1"] });
  const mutations = [
    (x: any) => { x.token.gty = "refresh_token"; },
    (x: any) => { x.token.gty = "client_credentials"; },
    (x: any) => { x.token.gty = "urn:ietf:params:oauth:grant-type:token-exchange"; },
    (x: any) => { x.token.kind = "ClientCredentials"; },
    (x: any) => { x.token.clientId = "social-client"; },
    (x: any) => { x.token.scope = "other"; },
    (x: any) => { x.token.accountId = "other-user"; },
    (x: any) => { delete x.token.accountId; x.token.sub = "user-1"; },
    (x: any) => { x.context.user.id = "other-user"; },
    (x: any) => { x.context.interaction.userId = "other-user"; },
    (x: any) => { x.context.interaction.interactionEvent = "Register"; },
    (x: any) => { x.context.interaction.interactionEvent = "ForgotPassword"; },
    (x: any) => { x.context.interaction.verificationRecords = []; },
    (x: any) => { x.context.interaction.verificationRecords[0].verified = false; },
    (x: any) => { x.context.interaction.verificationRecords[0].type = "Social"; },
    (x: any) => { x.context.interaction.verificationRecords[0].type = "NewPasswordIdentity"; },
    (x: any) => { x.context.interaction.verificationRecords[0].identifier.value = "attacker@example.test"; },
    (x: any) => { x.context.interaction.verificationRecords[0].identifier.type = "userId"; },
    (x: any) => { delete x.token.jti; },
    (x: any) => { delete x.context.interaction.verificationRecords[0].id; },
    (x: any) => { x.context.interaction.verificationRecords[0].id = "bad:marker"; },
    (x: any) => { x.context.interaction.verificationRecords[0].id = "short"; },
    (x: any) => { x.context.interaction.verificationRecords[0].id = "A12345678901234567890"; },
    (x: any) => { x.token.jti = ""; },
    (x: any) => { delete x.context.interaction; x.context.signInContext = { celebixAdminLoginNonce: nonce, passwordVerified: "true" }; },
  ];
  for (const mutate of mutations) {
    const input = source(); mutate(input);
    assert.deepEqual(await getClaims(input), {});
  }
});

test("customizer preserves existing other-resource claims and cannot inherit forged proof for its resource", async () => {
  assert.equal(typeof customizer.createAdminPasswordProofCustomizer, "function");
  const prior = () => ({ existing: { permission: "read" }, celebix_admin_password_proof: claim });
  const getClaims = customizer.createAdminPasswordProofCustomizer({ eligibleClientIds: ["panel-1"], previousCustomizer: prior });
  const input = source(); input.token.aud = "urn:other";
  assert.deepEqual(await getClaims(input), await prior());
  input.token.aud = resource; input.token.gty = "refresh_token";
  assert.deepEqual(await getClaims(input), { existing: { permission: "read" } });
});

test("generated standalone Logto getCustomJwtClaims script executes the same gates", async () => {
  assert.equal(typeof customizer.buildAdminPasswordProofCustomizerScript, "function");
  const script = customizer.buildAdminPasswordProofCustomizerScript({ eligibleClientIds: ["panel-1"] });
  const claims = await vm.runInNewContext(`${script}\ngetCustomJwtClaims(input)`, { input: source() });
  assert.deepEqual(JSON.parse(JSON.stringify(claims)), { celebix_admin_password_proof: claim });
});

test("standalone script composes an existing customizer and preserves its unrelated claims", async () => {
  const script = customizer.buildAdminPasswordProofCustomizerScript({ eligibleClientIds: ["panel-1"], previousScript: "const getCustomJwtClaims = async ({token}) => ({legacy:token.kind});" });
  const input = source();
  const claims = await vm.runInNewContext(`${script}\ngetCustomJwtClaims(input)`, { input });
  assert.deepEqual(JSON.parse(JSON.stringify(claims)), { legacy: "AccessToken", celebix_admin_password_proof: claim });
  input.token.aud = "urn:other";
  assert.deepEqual(JSON.parse(JSON.stringify(await vm.runInNewContext(`${script}\ngetCustomJwtClaims(input)`, { input }))), { legacy: "AccessToken" });
});

function token(overrides: Record<string, unknown> = {}, key = privateKey, header: Record<string, unknown> = {}) {
  const payload = { iss: issuer, aud: resource, sub: "user-1", client_id: "panel-1", scope: "signin:proof", jti: tokenId, iat: seconds - 20, exp: seconds + 300, celebix_admin_password_proof: claim, ...overrides };
  const input = [ { alg: "RS256", typ: "JWT", kid: "proof-key", ...header }, payload ].map(x => Buffer.from(JSON.stringify(x)).toString("base64url")).join(".");
  return `${input}.${createSign("RSA-SHA256").update(input).end().sign(key).toString("base64url")}`;
}

function verify(jwt: string) {
  assert.equal(typeof verifier.verifyAdminPasswordProof, "function");
  return verifier.verifyAdminPasswordProof({ accessToken: jwt, jwks, issuer, clientId: "panel-1", subject: "user-1", algorithms: ["RS256"], now });
}

test("password proof is projected only after real asymmetric signature and transaction validation", async () => {
  assert.deepEqual(await verify(token()), { method: "password", issuer, subject: "user-1", clientId: "panel-1", tokenId, verificationId, issuedAt: "2026-10-12T11:59:40.000Z", expiresAt: "2026-10-12T12:05:00.000Z" });
});

test("a signed token lacking proof cannot attest password or turn sign-in context into assurance", async () => {
  assert.equal(await verify(token({ celebix_admin_password_proof: undefined, passwordVerified: true, signInContext: { celebixAdminLoginNonce: nonce } })), undefined);
});

test("verifier rejects invalid signatures and every cryptographic binding mismatch", async () => {
  for (const jwt of [
    token({}, wrongKey), token({}, privateKey, { alg: "none" }),
    token({ iss: "https://attacker.example.test" }), token({ aud: "urn:other" }),
    token({ aud: [resource, "urn:other"] }), token({ sub: "other-user" }),
    token({ client_id: "other-client" }), token({ scope: "openid" }),
    token({ exp: seconds }), token({ exp: undefined }), token({ iat: undefined }),
    token({ iat: seconds - 601 }), token({ iat: seconds + 31 }),
    token({ celebix_admin_password_proof: { ...claim, tokenId: "other-token" } }),
    token({ celebix_admin_password_proof: { ...claim, verificationId: undefined } }),
    token({ celebix_admin_password_proof: { ...claim, verificationId: "bad:marker" } }),
    token({ jti: undefined }), token({ jti: "other-token" }),
    token({ celebix_admin_password_proof: { ...claim, version: 1 } }),
    token({ celebix_admin_password_proof: { ...claim, version: 2 } }),
    token({ celebix_admin_password_proof: { ...claim, verificationId: "short" } }),
    token({ celebix_admin_password_proof: { ...claim, verificationId: "A12345678901234567890" } }),
    token({ celebix_admin_password_proof: { ...claim, subject: "other-user" } }),
    token({ celebix_admin_password_proof: { ...claim, clientId: "other-client" } }),
    token({ celebix_admin_password_proof: { ...claim, method: "social" } }),
    token({ celebix_admin_password_proof: true }),
  ]) await assert.rejects(() => verify(jwt));
});
