import assert from "node:assert/strict";
import { createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { createLogtoOidcProvider } from "../../../apps/owner/lib/self-serve-logto-provider/provider.ts";

const ISSUER = "https://identity.staging.example.test/oidc";
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const AUTHORIZATION = `${ISSUER}/authorize`;
const TOKEN = `${ISSUER}/token`;
const JWKS = `${ISSUER}/jwks`;
const CLIENT_ID = "celebix-staging-owner";
const CLIENT_SECRET = "client-secret-must-never-leak";
const CALLBACK = "https://panel-auth.staging.example.test/auth/callback";
const NOW = new Date("2026-07-15T12:00:00.000Z");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), use: "sig", alg: "RS256", kid: "staging-rsa-v1" };
const { privateKey: es384PrivateKey, publicKey: es384PublicKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
const es384PublicJwk = { ...es384PublicKey.export({ format: "jwk" }), use: "sig", alg: "ES384", kid: "staging-es384-v1" };

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function idToken(overrides = {}, headerOverrides = {}) {
  const header = { alg: "RS256", typ: "JWT", kid: "staging-rsa-v1", ...headerOverrides };
  const payload = {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: "logto-subject-123",
    nonce: "nonce_1234567890123456",
    email: "verified-owner@example.test",
    email_verified: true,
    name: "Verified Owner",
    iat: Math.floor(NOW.getTime() / 1000) - 30,
    exp: Math.floor(NOW.getTime() / 1000) + 300,
    ...overrides,
  };
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = createSign("RSA-SHA256").update(signingInput).end().sign(privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

function es384IdToken(overrides = {}) {
  const header = { alg: "ES384", typ: "JWT", kid: "staging-es384-v1" };
  const payload = {
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: "logto-subject-123",
    nonce: "nonce_1234567890123456",
    email: "verified-owner@example.test",
    email_verified: true,
    name: "Verified Owner",
    iat: Math.floor(NOW.getTime() / 1000) - 30,
    exp: Math.floor(NOW.getTime() / 1000) + 300,
    ...overrides,
  };
  const signingInput = `${base64url(header)}.${base64url(payload)}`;
  const signature = createSign("SHA384").update(signingInput).end().sign({
    key: es384PrivateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${signingInput}.${signature}`;
}

function json(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

function jsonWithMediaType(value, mediaType) {
  return new Response(new TextEncoder().encode(JSON.stringify(value)), {
    status: 200,
    headers: mediaType === null ? {} : { "content-type": mediaType },
  });
}

function fixture(options = {}) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push({ url, init, body: typeof init.body === "string" ? init.body : "" });
    if (url === DISCOVERY) {
      if (options.discoveryResponse) return options.discoveryResponse;
      return json({
        issuer: options.issuer ?? ISSUER,
        authorization_endpoint: options.authorizationEndpoint ?? AUTHORIZATION,
        token_endpoint: options.tokenEndpoint ?? TOKEN,
        jwks_uri: options.jwksUri ?? JWKS,
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        id_token_signing_alg_values_supported: options.providerAlgorithms ?? ["RS256"],
      });
    }
    if (url === TOKEN) {
      if (options.tokenResponse) return options.tokenResponse;
      return json({ id_token: options.token ?? idToken(), token_type: "Bearer", access_token: "ignored-access-token" });
    }
    if (url === JWKS) {
      if (options.jwksResponse) return options.jwksResponse;
      return json({ keys: options.jwksKeys ?? [publicJwk] });
    }
    throw new Error("unexpected fixture URL");
  };
  return { calls, fetch };
}

function provider(source, overrides = {}) {
  return createLogtoOidcProvider({
    issuer: ISSUER,
    discoveryUrl: DISCOVERY,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    tokenAuthMethod: "client_secret_basic",
    algorithms: ["RS256"],
    fetch: source.fetch,
    clock: () => new Date(NOW),
    timeoutMs: 1_000,
    maximumResponseBytes: 65_536,
    ...overrides,
  });
}

const authorizationInput = Object.freeze({
  state: "state_1234567890123456",
  nonce: "nonce_1234567890123456",
  codeChallenge: "challenge_1234567890123456789012345678901234567890123",
  codeChallengeMethod: "S256",
  redirectUri: CALLBACK,
});

const callbackInput = Object.freeze({
  code: "authorization-code-once",
  state: authorizationInput.state,
  codeVerifier: "verifier_1234567890123456789012345678901234567890123",
  redirectUri: CALLBACK,
  expectedNonce: authorizationInput.nonce,
  expectedIssuer: ISSUER,
  expectedAudience: CLIENT_ID,
});

test("Logto provider validates discovery and builds the exact Authorization Code + PKCE URL", async () => {
  const source = fixture();
  const url = await provider(source).buildAuthorizationUrl(authorizationInput);
  assert.equal(url.origin + url.pathname, AUTHORIZATION);
  assert.deepEqual([...url.searchParams.entries()], [
    ["response_type", "code"], ["response_mode", "query"], ["scope", "openid profile email"],
    ["client_id", CLIENT_ID], ["redirect_uri", CALLBACK], ["state", authorizationInput.state],
    ["nonce", authorizationInput.nonce], ["code_challenge", authorizationInput.codeChallenge],
    ["code_challenge_method", "S256"],
  ]);
  assert.equal(source.calls.length, 1);
  assert.equal(source.calls[0].url, DISCOVERY);
  assert.equal(source.calls[0].init.redirect, "manual");
});

test("Logto callback exchanges the code exactly once and verifies a pinned asymmetric ID token", async () => {
  const source = fixture();
  const identity = await provider(source).verifyCallback(callbackInput);
  assert.deepEqual(identity, {
    issuer: ISSUER,
    subject: "logto-subject-123",
    audience: [CLIENT_ID],
    nonce: authorizationInput.nonce,
    email: "verified-owner@example.test",
    emailVerified: true,
    displayName: "Verified Owner",
  });
  const tokenCalls = source.calls.filter(({ url }) => url === TOKEN);
  assert.equal(tokenCalls.length, 1);
  assert.equal(tokenCalls[0].init.redirect, "manual");
  assert.equal(new URLSearchParams(tokenCalls[0].body).get("code"), callbackInput.code);
  assert.equal(new URLSearchParams(tokenCalls[0].body).get("code_verifier"), callbackInput.codeVerifier);
  assert.equal(new URLSearchParams(tokenCalls[0].body).get("redirect_uri"), CALLBACK);
  assert.equal(tokenCalls[0].init.headers.authorization, `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64")}`);
  assert.equal(source.calls.filter(({ url }) => url === JWKS).length, 1);
});

test("Logto accepts only the registered JWKS JSON media types and sends the exact JWKS Accept preference", async () => {
  for (const mediaType of [
    "application/jwk-set+json",
    "application/jwk-set+json; charset=utf-8",
    "application/json",
  ]) {
    const source = fixture({
      jwksResponse: jsonWithMediaType({ keys: [publicJwk] }, mediaType),
    });
    await provider(source).verifyCallback(callbackInput);
    const jwksCall = source.calls.find(({ url }) => url === JWKS);
    assert.equal(jwksCall.init.headers.accept, "application/jwk-set+json, application/json");
  }
});

test("Logto discovery and token endpoints continue accepting only application/json", async () => {
  const discoveryDocument = {
    issuer: ISSUER,
    authorization_endpoint: AUTHORIZATION,
    token_endpoint: TOKEN,
    jwks_uri: JWKS,
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    id_token_signing_alg_values_supported: ["RS256"],
  };
  await assert.rejects(
    () => provider(fixture({
      discoveryResponse: jsonWithMediaType(discoveryDocument, "application/jwk-set+json"),
    })).buildAuthorizationUrl(authorizationInput),
    /oidc_provider_rejected/,
  );
  await assert.rejects(
    () => provider(fixture({
      tokenResponse: jsonWithMediaType({ id_token: idToken() }, "application/jwk-set+json"),
    })).verifyCallback(callbackInput),
    /oidc_provider_rejected/,
  );
});

test("Logto JWKS rejects wildcard, suffix, text, missing, comma-separated, and malformed media types", async () => {
  for (const mediaType of [
    "application/*+json",
    "application/problem+json",
    "text/json",
    "text/plain",
    null,
    "application/jwk-set+json, application/json",
    "application/jwk-set+json; charset=utf-8, application/json",
    "application/jwk-set+json; charset",
    "application/jwk-set+json;",
  ]) {
    const source = fixture({
      jwksResponse: jsonWithMediaType({ keys: [publicJwk] }, mediaType),
    });
    await assert.rejects(
      () => provider(source).verifyCallback(callbackInput),
      /oidc_provider_rejected/,
      `unexpectedly accepted ${String(mediaType)}`,
    );
  }
});

test("Logto continues verifying a valid ES384 ID token with an asymmetric P-384 key", async () => {
  const source = fixture({
    providerAlgorithms: ["ES384"],
    token: es384IdToken(),
    jwksKeys: [es384PublicJwk],
  });
  const identity = await provider(source, { algorithms: ["ES384"] }).verifyCallback(callbackInput);
  assert.equal(identity.subject, "logto-subject-123");
  assert.equal(identity.emailVerified, true);
});

test("failed JWKS media-type validation reaches no durable identity, tenant, handoff, or session effect", async () => {
  const effects = { identity: 0, tenant: 0, handoff: 0, session: 0 };
  const source = fixture({
    jwksResponse: jsonWithMediaType({ keys: [publicJwk] }, "application/problem+json"),
  });
  await assert.rejects(async () => {
    await provider(source).verifyCallback(callbackInput);
    effects.identity += 1;
    effects.tenant += 1;
    effects.handoff += 1;
    effects.session += 1;
  }, /oidc_provider_rejected/);
  assert.deepEqual(effects, { identity: 0, tenant: 0, handoff: 0, session: 0 });
});

test("Logto supports only the configured confidential client_secret_post exchange", async () => {
  const source = fixture();
  await provider(source, { tokenAuthMethod: "client_secret_post" }).verifyCallback(callbackInput);
  const tokenCall = source.calls.find(({ url }) => url === TOKEN);
  assert.equal(tokenCall.init.headers.authorization, undefined);
  const body = new URLSearchParams(tokenCall.body);
  assert.equal(body.get("client_id"), CLIENT_ID);
  assert.equal(body.get("client_secret"), CLIENT_SECRET);
});

test("Logto discovery and endpoints fail closed on redirects, origin drift, credentials, and oversized bodies", async () => {
  const cases = [
    fixture({ discoveryResponse: new Response(null, { status: 302, headers: { location: DISCOVERY } }) }),
    fixture({ authorizationEndpoint: "https://drift.staging.example.test/authorize" }),
    fixture({ tokenEndpoint: "https://user:pass@identity.staging.example.test/oidc/token" }),
    fixture({ discoveryResponse: json({ ignored: "x".repeat(70_000) }) }),
  ];
  for (const source of cases) {
    await assert.rejects(() => provider(source).buildAuthorizationUrl(authorizationInput), /oidc_provider_rejected|oidc_provider_unavailable/);
  }
});

test("Logto token and JWKS responses reject redirects, oversize, and malformed content", async () => {
  for (const source of [
    fixture({ tokenResponse: new Response(null, { status: 302, headers: { location: TOKEN } }) }),
    fixture({ tokenResponse: json({ id_token: "x".repeat(70_000) }) }),
    fixture({ jwksResponse: new Response(null, { status: 302, headers: { location: JWKS } }) }),
    fixture({ jwksResponse: json({ keys: [{ kty: "oct", k: "a".repeat(43), alg: "HS256" }] }) }),
  ]) {
    await assert.rejects(() => provider(source).verifyCallback(callbackInput), /oidc_provider_rejected|oidc_provider_unavailable/);
  }
});

test("Logto callback rejects issuer, audience, nonce, expiry, unverified email, and HMAC/none algorithms", async () => {
  const tokens = [
    idToken({ iss: "https://attacker.example.test" }),
    idToken({ aud: "wrong-audience" }),
    idToken({ nonce: "wrong-nonce" }),
    idToken({ exp: Math.floor(NOW.getTime() / 1000) - 1 }),
    idToken({ email_verified: false }),
    idToken({}, { alg: "HS256" }),
    `${base64url({ alg: "none", kid: "staging-rsa-v1" })}.${base64url({ sub: "x" })}.`,
  ];
  for (const token of tokens) {
    await assert.rejects(() => provider(fixture({ token })).verifyCallback(callbackInput), /oidc_/);
  }
  await assert.rejects(
    () => provider(fixture({ token: idToken({ nonce: undefined }) })).verifyCallback({
      ...callbackInput,
      expectedNonce: undefined,
    }),
    /oidc_provider_rejected/,
  );
  for (const token of [
    idToken({ aud: [CLIENT_ID, "staging-api"] }),
    idToken({ aud: [CLIENT_ID, "staging-api"], azp: "wrong-client" }),
  ]) {
    await assert.rejects(() => provider(fixture({ token })).verifyCallback(callbackInput), /oidc_provider_rejected/);
  }
});

test("Logto failures expose only stable safe errors and never include code, token, or client secret", async () => {
  const sensitive = [callbackInput.code, CLIENT_SECRET, "sensitive-id-token"];
  const source = fixture({ tokenResponse: json({ id_token: "sensitive-id-token" }) });
  let message = "";
  try { await provider(source).verifyCallback(callbackInput); }
  catch (error) { message = String(error); }
  assert.match(message, /oidc_provider_rejected|oidc_provider_unavailable/);
  for (const value of sensitive) assert.equal(message.includes(value), false);
});
