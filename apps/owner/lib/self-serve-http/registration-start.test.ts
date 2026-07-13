import assert from "node:assert/strict";
import test from "node:test";

import type {
  OidcAuthorizationRequest,
  OidcAuthorizationTransaction,
  OidcProviderCallbackInput,
} from "../self-serve-oidc.ts";
import {
  createDisabledSelfServeRuntime,
  createPersistentSelfServeRuntime,
  createSelfServeHttpActivationApproval,
} from "./runtime.ts";

type HandlerModule = typeof import("./registration-start.ts");
const handlerModule = await import(new URL("./registration-start.ts", import.meta.url).href).catch(
  () => ({} as Partial<HandlerModule>),
);

const NOW = new Date("2026-07-13T12:00:00.000Z");
const REGISTER_URL = "https://ecommerce.celebix.co/api/self-serve/register";
const CALLBACK_URL = "https://panel.celebix.site/auth/callback";
const ISSUER = "https://identity.example.test/oidc";
const AUDIENCE = "customer-panel";

const validInput = {
  storeName: "Çiçek Pazarı",
  storeSlug: "cicek-pazari",
  marketingConsent: false,
  privacyConsent: true,
};

class RecordingAttemptStore {
  saved: unknown = null;
  saveCalls = 0;
  failSave = false;
  async save(attempt: unknown) {
    this.saveCalls += 1;
    if (this.failSave) throw new Error("schema table SQLSTATE secret");
    this.saved = structuredClone(attempt);
  }
  async consume(): Promise<never> { throw new Error("not used by registration start"); }
}

class RecordingOidcStore {
  active = new Map<string, OidcAuthorizationTransaction>();
  saveCalls = 0;
  discardCalls = 0;
  failSave = false;
  async save(transaction: OidcAuthorizationTransaction) {
    this.saveCalls += 1;
    if (this.failSave) throw new Error("database host SQLSTATE secret");
    this.active.set(transaction.state, structuredClone(transaction));
  }
  async consume(): Promise<never> { throw new Error("not used by registration start"); }
  async discard(state: string) {
    this.discardCalls += 1;
    this.active.delete(state);
  }
}

class DeterministicProvider {
  authorizationCalls = 0;
  failAuthorization = false;
  buildAuthorizationUrl(input: OidcAuthorizationRequest) {
    this.authorizationCalls += 1;
    if (this.failAuthorization) throw new Error("provider client_secret token response");
    const url = new URL("https://identity.example.test/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", input.state);
    url.searchParams.set("nonce", input.nonce);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
    url.searchParams.set("redirect_uri", input.redirectUri);
    return url;
  }
  async verifyCallback(_input: OidcProviderCallbackInput): Promise<never> {
    throw new Error("not used by registration start");
  }
}

function createFixture(options: {
  gateDecision?: "allowed" | "unauthorized" | "forbidden" | "rate_limited" | "unavailable";
  audit?: (event: unknown) => void | Promise<void>;
  maximumBytes?: number;
} = {}) {
  const attempts = new RecordingAttemptStore();
  const oidc = new RecordingOidcStore();
  const provider = new DeterministicProvider();
  const calls = { gate: 0, completion: 0, reconcile: 0, bodyUsedAtGate: true };
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: attempts,
    oidcTransactionStore: oidc,
    registrationCompletion: {
      async recordVerifiedIdentity() { calls.completion += 1; return { kind: "identity_recorded", status: "identity_verified", version: 2 }; },
      async resumeTenantCreation() { calls.completion += 1; return { kind: "in_progress" }; },
      async reconcileUnknownCommit() { calls.reconcile += 1; return { kind: "pending" }; },
    },
    oidcProvider: provider,
    requestGate: {
      async verify(input) {
        calls.gate += 1;
        calls.bodyUsedAtGate = input.request.bodyUsed;
        return options.gateDecision ?? "allowed";
      },
    },
    clock: () => new Date(NOW),
    audit: options.audit ?? (() => undefined),
    bodyPolicy: { maximumBytes: options.maximumBytes ?? 4_096, maximumCallbackQueryBytes: 2_048 },
    callbackAuthority: CALLBACK_URL,
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: ISSUER, audience: AUDIENCE, authorizationOrigin: "https://identity.example.test" },
  });
  return { runtime, attempts, oidc, provider, calls };
}

function jsonRequest(body: string | Record<string, unknown>, options: {
  method?: string;
  origin?: string | null;
  headers?: Record<string, string>;
} = {}) {
  const headers = new Headers({ "content-type": "application/json", ...options.headers });
  if (options.origin !== null) headers.set("origin", options.origin ?? "https://ecommerce.celebix.co");
  return new Request(REGISTER_URL, {
    method: options.method ?? "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function formRequest(body: string, headers: Record<string, string> = {}) {
  return new Request(REGISTER_URL, {
    method: "POST",
    headers: {
      origin: "https://ecommerce.celebix.co",
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body,
  });
}

async function body(response: Response) {
  return await response.json() as Record<string, unknown>;
}

test("exports a registration-start HTTP handler factory", () => {
  assert.equal(typeof handlerModule.createSelfServeRegistrationStartHandler, "function");
});

test("disabled runtime returns 503 after origin validation without reading body or calling dependencies", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  const handler = handlerModule.createSelfServeRegistrationStartHandler(createDisabledSelfServeRuntime());
  const request = jsonRequest({ password: "must-not-be-read" });
  const response = await handler(request);
  assert.equal(response.status, 503);
  assert.equal(request.bodyUsed, false);
  assert.deepEqual(await body(response), {
    code: "self_serve_saas_registration_disabled",
    state: "disabled",
    message: "Güvenli mağaza kayıt altyapısı henüz etkin değil.",
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
});

test("disabled runtime still rejects missing origin before the disabled response without reading body", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  const handler = handlerModule.createSelfServeRegistrationStartHandler(createDisabledSelfServeRuntime());
  const request = jsonRequest(validInput, { origin: null });
  const response = await handler(request);
  assert.equal(response.status, 403);
  assert.equal(request.bodyUsed, false);
  assert.equal((await body(response)).code, "self_serve_origin_required");
});

test("method and exact same-origin validation run before gate and body parsing", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  for (const scenario of [
    { method: "PUT", origin: "https://ecommerce.celebix.co", status: 405, code: "self_serve_register_read_disabled" },
    { method: "POST", origin: null, status: 403, code: "self_serve_origin_required" },
    { method: "POST", origin: "https://attacker.example", status: 403, code: "self_serve_origin_required" },
    { method: "POST", origin: "https://ecommerce.celebix.co/path", status: 403, code: "self_serve_origin_required" },
    { method: "POST", origin: "not an origin", status: 403, code: "self_serve_origin_required" },
  ] as const) {
    const fixture = createFixture();
    const request = jsonRequest(validInput, { method: scenario.method, origin: scenario.origin });
    const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(request);
    assert.equal(response.status, scenario.status);
    assert.equal((await body(response)).code, scenario.code);
    assert.equal(request.bodyUsed, false);
    assert.equal(fixture.calls.gate, 0);
    assert.equal(fixture.attempts.saveCalls, 0);
    assert.equal(fixture.provider.authorizationCalls, 0);
  }
});

test("trust gate executes before body parsing and maps every controlled denial", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  for (const [decision, status, code] of [
    ["unauthorized", 401, "self_serve_unauthorized"],
    ["forbidden", 403, "self_serve_forbidden"],
    ["rate_limited", 429, "self_serve_rate_limited"],
    ["unavailable", 503, "self_serve_request_gate_unavailable"],
  ] as const) {
    const fixture = createFixture({ gateDecision: decision });
    const request = jsonRequest(validInput);
    const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(request);
    assert.equal(response.status, status);
    assert.equal((await body(response)).code, code);
    assert.equal(fixture.calls.gate, 1);
    assert.equal(fixture.calls.bodyUsedAtGate, false);
    assert.equal(request.bodyUsed, false);
    assert.equal(fixture.attempts.saveCalls, 0);
    assert.equal(fixture.provider.authorizationCalls, 0);
  }
});

test("supports only JSON and the existing URL-encoded form contract", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  for (const request of [
    jsonRequest(validInput),
    formRequest("storeName=%C3%87i%C3%A7ek+Pazar%C4%B1&storeSlug=cicek-pazari&marketingConsent=false&privacyConsent=true"),
  ]) {
    const fixture = createFixture();
    const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(request);
    assert.equal(response.status, 201);
    assert.equal((await body(response)).state, "awaiting_identity");
    assert.equal(fixture.attempts.saveCalls, 1);
    assert.equal(fixture.oidc.saveCalls, 1);
  }

  const fixture = createFixture();
  const request = new Request(REGISTER_URL, {
    method: "POST",
    headers: { origin: "https://ecommerce.celebix.co", "content-type": "multipart/form-data; boundary=x" },
    body: "--x--",
  });
  const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(request);
  assert.equal(response.status, 415);
  assert.equal((await body(response)).code, "self_serve_content_type_unsupported");
  assert.equal(request.bodyUsed, false);
});

test("rejects oversized declared and streamed bodies without unbounded buffering", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  const declaredFixture = createFixture({ maximumBytes: 128 });
  const declared = jsonRequest(validInput, { headers: { "content-length": "129" } });
  const declaredResponse = await handlerModule.createSelfServeRegistrationStartHandler(declaredFixture.runtime)(declared);
  assert.equal(declaredResponse.status, 413);
  assert.equal((await body(declaredResponse)).code, "self_serve_request_too_large");
  assert.equal(declared.bodyUsed, false);

  const streamedFixture = createFixture({ maximumBytes: 128 });
  const streamed = new Request(REGISTER_URL, {
    method: "POST",
    headers: { origin: "https://ecommerce.celebix.co", "content-type": "application/json" },
    body: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("x".repeat(129))); controller.close(); } }),
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  const streamedResponse = await handlerModule.createSelfServeRegistrationStartHandler(streamedFixture.runtime)(streamed);
  assert.equal(streamedResponse.status, 413);
  assert.equal((await body(streamedResponse)).code, "self_serve_request_too_large");
  assert.equal(streamedFixture.attempts.saveCalls, 0);
});

test("rejects malformed UTF-8, malformed encodings, malformed JSON, duplicate fields, arrays, and objects", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  const malformedUtf8 = new Request(REGISTER_URL, {
    method: "POST",
    headers: { origin: "https://ecommerce.celebix.co", "content-type": "application/json" },
    body: new Uint8Array([0xff]),
  });
  const cases = [
    ["malformed UTF-8", malformedUtf8],
    ["malformed JSON", jsonRequest("{")],
    ["duplicate JSON field", jsonRequest('{"storeName":"One","storeName":"Two","storeSlug":"valid-slug","marketingConsent":false,"privacyConsent":true}')],
    ["array value", jsonRequest({ ...validInput, storeName: ["bad"] })],
    ["object value", jsonRequest({ ...validInput, storeName: { bad: true } })],
    ["malformed form encoding", formRequest("storeName=%ZZ&storeSlug=valid-slug&privacyConsent=true")],
    ["duplicate form field", formRequest("storeName=One&storeName=Two&storeSlug=valid-slug&privacyConsent=true")],
  ];
  for (const [label, request] of cases) {
    const fixture = createFixture();
    const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(request as Request);
    assert.equal(response.status, 400, label as string);
    assert.match(String((await body(response)).code), /^self_serve_(request_malformed|registration_duplicate_field)$/, label as string);
    assert.equal(fixture.attempts.saveCalls, 0, label as string);
  }
});

test("rejects unknown browser authority, password, token, callback, and return fields", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  for (const field of [
    "password",
    "passwordConfirmation",
    "accessToken",
    "refreshToken",
    "idToken",
    "authorizationCode",
    "nonce",
    "pkceVerifier",
    "providerSecret",
    "returnUrl",
    "callbackUrl",
    "locale",
    "currency",
    "themeKey",
    "tenantId",
    "principalId",
    "storeId",
  ]) {
    const fixture = createFixture();
    const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(
      jsonRequest({ ...validInput, [field]: "attacker-authority" }),
    );
    assert.equal(response.status, 400, field);
    assert.equal((await body(response)).code, "self_serve_registration_unknown_field", field);
    assert.equal(fixture.attempts.saveCalls, 0, field);
  }
});

test("strict fields reject invalid and reserved slugs, missing privacy consent, invalid booleans, and oversized values", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  for (const request of [
    jsonRequest({ ...validInput, storeSlug: "Bad Slug" }),
    jsonRequest({ ...validInput, storeSlug: "admin" }),
    jsonRequest({ ...validInput, privacyConsent: false }),
    jsonRequest({ ...validInput, marketingConsent: "false" }),
    jsonRequest({ ...validInput, storeName: "x".repeat(121) }),
    formRequest("storeName=Valid&storeSlug=valid-slug&privacyConsent=yes"),
  ]) {
    const fixture = createFixture();
    const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(request);
    assert.equal(response.status, 400);
    assert.equal((await body(response)).code, "self_serve_registration_rejected");
    assert.equal(fixture.attempts.saveCalls, 0);
  }
});

test("successful durable start returns only authorization-safe fields without cookie or session claims", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  const fixture = createFixture();
  const response = await handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(jsonRequest(validInput));
  const result = await body(response);
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(result).sort(), ["authorizationUrl", "expiresAt", "state"]);
  assert.equal(result.state, "awaiting_identity");
  assert.match(String(result.authorizationUrl), /^https:\/\/identity\.example\.test\/authorize\?/);
  assert.equal(result.expiresAt, "2026-07-13T12:10:00.000Z");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  const serialized = JSON.stringify(result);
  for (const prohibited of ["codeVerifier", "stateDigest", "encryption", "database", "tenant", "session_created"]) {
    assert.equal(serialized.includes(prohibited), false);
  }
});

test("provider and either persistence failure cannot produce a successful or reusable start", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  const providerFailure = createFixture();
  providerFailure.provider.failAuthorization = true;
  let response = await handlerModule.createSelfServeRegistrationStartHandler(providerFailure.runtime)(jsonRequest(validInput));
  assert.equal(response.status, 503);
  assert.equal((await body(response)).code, "self_serve_identity_start_failed");
  assert.equal(providerFailure.attempts.saveCalls, 0);
  assert.equal(providerFailure.oidc.active.size, 0);

  const oidcFailure = createFixture();
  oidcFailure.oidc.failSave = true;
  response = await handlerModule.createSelfServeRegistrationStartHandler(oidcFailure.runtime)(jsonRequest(validInput));
  assert.equal(response.status, 503);
  assert.equal((await body(response)).code, "self_serve_identity_start_failed");
  assert.equal(oidcFailure.provider.authorizationCalls, 0);
  assert.equal(oidcFailure.attempts.saveCalls, 0);

  const attemptFailure = createFixture();
  attemptFailure.attempts.failSave = true;
  response = await handlerModule.createSelfServeRegistrationStartHandler(attemptFailure.runtime)(jsonRequest(validInput));
  assert.equal(response.status, 503);
  assert.equal((await body(response)).code, "self_serve_identity_start_failed");
  assert.equal(attemptFailure.oidc.discardCalls, 1);
  assert.equal(attemptFailure.oidc.active.size, 0);
});

test("audit throw, rejection, and unresolved promise never block or replace the registration result", async () => {
  assert.ok(handlerModule.createSelfServeRegistrationStartHandler);
  for (const audit of [
    () => { throw new Error("audit failed"); },
    () => Promise.reject(new Error("audit rejected")),
    () => new Promise<void>(() => undefined),
  ]) {
    const fixture = createFixture({ audit });
    const response = await Promise.race([
      handlerModule.createSelfServeRegistrationStartHandler(fixture.runtime)(jsonRequest(validInput)),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("handler blocked on audit")), 100)),
    ]);
    assert.equal(response.status, 201);
  }
});
