import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import {
  OidcFlowError,
  type OidcAuthorizationRequest,
  type OidcAuthorizationTransaction,
  type OidcFlowErrorCode,
  type OidcProviderCallbackInput,
  type OidcVerifiedIdentity,
} from "../self-serve-oidc.ts";
import type { RegistrationAttempt } from "../self-serve-registration-orchestrator.ts";
import type {
  RecordIdentityResult,
  ResumeTenantResult,
} from "../self-serve-registration-completion.ts";
import {
  createDisabledSelfServeRuntime,
  createPersistentSelfServeRuntime,
  createSelfServeHttpActivationApproval,
} from "./runtime.ts";

type HandlerModule = typeof import("./oidc-callback-completion.ts");
const handlerModule = await import(new URL("./oidc-callback-completion.ts", import.meta.url).href).catch(
  () => ({} as Partial<HandlerModule>),
);

const NOW = new Date("2026-07-13T12:00:00.000Z");
const CALLBACK_URL = "https://panel.celebix.site/auth/callback";
const STATE = "state_0123456789abcdefghijklmnop";
const CODE = "expected-code";
const ISSUER = "https://identity.example.test/oidc";
const AUDIENCE = "customer-panel";
const VERIFIER = "verifier_private_0123456789";
const NONCE = "nonce_private_0123456789";

function transaction(expiresAt = "2026-07-13T12:10:00.000Z"): OidcAuthorizationTransaction {
  return {
    state: STATE,
    nonce: NONCE,
    codeVerifier: VERIFIER,
    redirectUri: CALLBACK_URL,
    returnTo: "/kayit",
    expectedIssuer: ISSUER,
    expectedAudience: AUDIENCE,
    createdAt: NOW.toISOString(),
    expiresAt,
  };
}

function attempt(): RegistrationAttempt {
  return {
    id: "attempt_0123456789abcdefghijklmnop",
    state: STATE,
    details: {
      storeName: "Çiçek Pazarı",
      storeSlug: "cicek-pazari",
      locale: "tr",
      currency: "TRY",
      themeKey: "starter",
      privacyAcceptedAt: NOW.toISOString(),
    },
    idempotencyKey: "ssik_0123456789abcdefghijklmnop",
    requestedAt: NOW.toISOString(),
    status: "awaiting_identity",
    createdAt: NOW.toISOString(),
    expiresAt: "2026-07-13T12:10:00.000Z",
  };
}

function identity(overrides: Partial<OidcVerifiedIdentity> = {}): OidcVerifiedIdentity {
  return {
    issuer: ISSUER,
    subject: "subject-123",
    audience: [AUDIENCE],
    nonce: NONCE,
    email: "owner@example.test",
    emailVerified: true,
    displayName: "Owner Name",
    ...overrides,
  };
}

const tenantResult = {
  store: { slug: "cicek-pazari" },
  storefrontUrl: "https://cicek-pazari.celebix.site",
  panelUrl: "https://panel.celebix.site",
  operationId: "operation_123",
  replayed: false,
} as CreateStarterTenantResult;

class RecordingOidcStore {
  active = new Map<string, OidcAuthorizationTransaction>();
  consumed = new Set<string>();
  consumeCalls = 0;
  discardCalls = 0;
  order: string[];

  constructor(order: string[]) { this.order = order; }
  async save(value: OidcAuthorizationTransaction) { this.active.set(value.state, structuredClone(value)); }
  async consume(state: string, now: Date) {
    this.order.push("oidc_consume");
    this.consumeCalls += 1;
    if (this.consumed.has(state)) throw new OidcFlowError("oidc_state_replayed", "secret replay detail");
    const value = this.active.get(state);
    if (!value) throw new OidcFlowError("oidc_invalid_state", "secret state detail");
    this.active.delete(state);
    this.consumed.add(state);
    if (Date.parse(value.expiresAt) <= now.getTime()) throw new OidcFlowError("oidc_state_expired", "secret expiry detail");
    return structuredClone(value);
  }
  async discard(state: string) {
    this.order.push("oidc_discard");
    this.discardCalls += 1;
    this.active.delete(state);
  }
}

class RecordingAttemptStore {
  active = new Map<string, RegistrationAttempt>();
  consumed = new Set<string>();
  consumeCalls = 0;
  failConsume = false;
  order: string[];

  constructor(order: string[]) { this.order = order; }
  async save(value: RegistrationAttempt) { this.active.set(value.state, structuredClone(value)); }
  async consume(state: string, now = NOW) {
    this.order.push("attempt_consume");
    this.consumeCalls += 1;
    if (this.failConsume) throw new Error("registration persistence SQLSTATE secret");
    if (this.consumed.has(state)) throw new Error("registration_attempt_replayed SQLSTATE secret");
    const value = this.active.get(state);
    if (!value) throw new Error("registration_attempt_missing schema secret");
    this.active.delete(state);
    this.consumed.add(state);
    if (Date.parse(value.expiresAt) <= now.getTime()) throw new Error("registration_attempt_expired table secret");
    return structuredClone(value);
  }
}

class DeterministicProvider {
  verifyCalls = 0;
  input: OidcProviderCallbackInput | null = null;
  output = identity();
  errorCode: OidcFlowErrorCode | null = null;
  unexpectedError = false;
  order: string[];

  constructor(order: string[]) { this.order = order; }
  buildAuthorizationUrl(_input: OidcAuthorizationRequest): URL { throw new Error("not used by callback"); }
  async verifyCallback(input: OidcProviderCallbackInput) {
    this.order.push("provider_verify");
    this.verifyCalls += 1;
    this.input = structuredClone(input);
    if (
      input.code !== CODE || input.state !== STATE || input.codeVerifier !== VERIFIER ||
      input.redirectUri !== CALLBACK_URL || input.expectedNonce !== NONCE ||
      input.expectedIssuer !== ISSUER || input.expectedAudience !== AUDIENCE
    ) throw new OidcFlowError("oidc_provider_rejected", "provider token client_secret detail");
    if (this.unexpectedError) throw new Error("provider endpoint token client_secret transport detail");
    if (this.errorCode) throw new OidcFlowError(this.errorCode, "provider token client_secret detail");
    return structuredClone(this.output);
  }
}

class RecordingCompletion {
  recordCalls = 0;
  resumeCalls = 0;
  reconcileCalls = 0;
  tenantCoreCalls = 0;
  identityInput: unknown = null;
  recordResult: RecordIdentityResult = { kind: "identity_recorded", status: "identity_verified", version: 2 };
  resumeResult: ResumeTenantResult = { kind: "tenant_created", result: tenantResult };
  order: string[];

  constructor(order: string[]) { this.order = order; }
  async recordVerifiedIdentity(input: { attemptId: string; expectedVersion: number; identity: unknown }) {
    this.order.push("identity_record");
    this.recordCalls += 1;
    this.identityInput = structuredClone(input);
    return this.recordResult;
  }
  async resumeTenantCreation() {
    this.order.push("tenant_resume");
    this.resumeCalls += 1;
    return this.resumeResult;
  }
  async reconcileUnknownCommit() {
    this.order.push("reconcile");
    this.reconcileCalls += 1;
    return { kind: "pending" as const };
  }
}

type RecoveryResult =
  | { kind: "identity_verified" | "tenant_created"; attemptId: string }
  | { kind: "awaiting_identity_consumed" | "terminal" | "missing" | "corrupt" | "unavailable" };

class RecordingRecovery {
  calls = 0;
  result: RecoveryResult;
  order: string[];

  constructor(order: string[], result: RecoveryResult) {
    this.order = order;
    this.result = result;
  }

  async classifyConsumedCallback(state: string, now: Date): Promise<RecoveryResult> {
    this.order.push("callback_recovery_inspect");
    this.calls += 1;
    assert.equal(state, STATE);
    assert.equal(now.toISOString(), NOW.toISOString());
    return structuredClone(this.result);
  }
}

function createFixture(options: {
  gate?: "allowed" | "unauthorized" | "forbidden" | "rate_limited" | "unavailable";
  state?: "active" | "expired" | "replayed" | "discarded" | "unknown";
  recovery?: RecoveryResult;
  audit?: (event: unknown) => void | Promise<void>;
} = {}) {
  const order: string[] = [];
  const oidc = new RecordingOidcStore(order);
  const attempts = new RecordingAttemptStore(order);
  const provider = new DeterministicProvider(order);
  const completion = new RecordingCompletion(order);
  const recovery = new RecordingRecovery(order, options.recovery ?? { kind: "awaiting_identity_consumed" });
  const auditEvents: unknown[] = [];
  const state = options.state ?? "active";
  if (state === "active" || state === "expired") {
    oidc.active.set(STATE, transaction(state === "expired" ? "2026-07-13T11:59:59.000Z" : undefined));
  } else if (state === "replayed") {
    oidc.consumed.add(STATE);
  }
  if (state !== "unknown") attempts.active.set(STATE, attempt());
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: attempts,
    oidcTransactionStore: oidc,
    registrationCompletion: completion,
    consumedCallbackRecovery: recovery,
    oidcProvider: provider,
    requestGate: {
      async verify() {
        order.push("edge_gate");
        return options.gate ?? "allowed";
      },
    },
    clock: () => new Date(NOW),
    audit: options.audit ?? ((event) => { auditEvents.push(structuredClone(event)); }),
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co",
    callbackAuthority: CALLBACK_URL,
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: ISSUER, audience: AUDIENCE, authorizationOrigin: "https://identity.example.test" },
  });
  return { runtime, oidc, attempts, provider, completion, recovery, order, auditEvents };
}

function callbackRequest(query = `state=${encodeURIComponent(STATE)}&code=${CODE}`, url = CALLBACK_URL, method = "GET") {
  return new Request(`${url}?${query}`, { method });
}

async function responseBody(response: Response) {
  return await response.json() as Record<string, unknown>;
}

test("exports a callback-completion handler factory and rejects non-approved runtimes", () => {
  assert.equal(typeof handlerModule.createSelfServeOidcCallbackCompletionHandler, "function");
  assert.throws(
    () => handlerModule.createSelfServeOidcCallbackCompletionHandler(createDisabledSelfServeRuntime()),
    /self_serve_http_activation_not_approved/,
  );
  assert.throws(
    () => handlerModule.createSelfServeOidcCallbackCompletionHandler(Object.freeze({ kind: "persistent" }) as never),
    /self_serve_http_activation_not_approved/,
  );
});

test("edge trust runs before URL parsing, database, and provider work", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  for (const [gate, status] of [["unauthorized", 401], ["forbidden", 403], ["rate_limited", 429], ["unavailable", 503]] as const) {
    const fixture = createFixture({ gate });
    const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(
      callbackRequest("bad=query", "https://attacker.example/wrong"),
      Object.freeze({ edge: "trusted-test-fixture" }),
    );
    assert.equal(response.status, status, gate);
    assert.deepEqual(fixture.order, ["edge_gate"], gate);
  }
});

test("accepts only the exact callback and passes persisted PKCE and verification authority to the provider", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture();
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(
    callbackRequest(), Object.freeze({ edge: "trusted-test-fixture" }),
  );
  assert.equal(response.status, 200);
  const safeBody = await responseBody(response);
  assert.deepEqual(safeBody, {
    state: "tenant_created_session_pending",
    storeSlug: "cicek-pazari",
    storefrontUrl: "https://cicek-pazari.celebix.site",
    panelUrl: "https://panel.celebix.site",
    provisioningStatus: "ready",
    session: "pending",
  });
  assert.deepEqual(fixture.order.slice(0, 6), [
    "edge_gate", "oidc_consume", "provider_verify", "attempt_consume", "identity_record", "tenant_resume",
  ]);
  assert.deepEqual(fixture.provider.input, {
    code: CODE,
    state: STATE,
    codeVerifier: VERIFIER,
    redirectUri: CALLBACK_URL,
    expectedNonce: NONCE,
    expectedIssuer: ISSUER,
    expectedAudience: AUDIENCE,
  });
  assert.deepEqual(fixture.completion.identityInput, {
    attemptId: "attempt_0123456789abcdefghijklmnop",
    expectedVersion: 1,
    identity: {
      issuer: ISSUER,
      subject: "subject-123",
      email: "owner@example.test",
      emailVerified: true,
      displayName: "Owner Name",
    },
  });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.doesNotMatch(JSON.stringify(safeBody), /nonce|verifier|token|identity|logged.?in/i);
});

test("rejects alternate authority, method, fragment, query expansion, duplicates, conflicts, and missing values", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const cases: Array<[string, Request, number]> = [
    ["host", callbackRequest(undefined, "https://attacker.example/auth/callback"), 400],
    ["path", callbackRequest(undefined, "https://panel.celebix.site/auth/callback/extra"), 400],
    ["port", callbackRequest(undefined, "https://panel.celebix.site:444/auth/callback"), 400],
    ["fragment", callbackRequest(undefined, `${CALLBACK_URL}#fragment`), 400],
    ["post", callbackRequest(undefined, CALLBACK_URL, "POST"), 405],
    ["duplicate state", callbackRequest(`state=${STATE}&state=${STATE}&code=${CODE}`), 400],
    ["duplicate code", callbackRequest(`state=${STATE}&code=${CODE}&code=other`), 400],
    ["conflict", callbackRequest(`state=${STATE}&code=${CODE}&error=access_denied`), 400],
    ["missing state", callbackRequest(`code=${CODE}`), 400],
    ["missing code", callbackRequest(`state=${STATE}`), 400],
    ["empty code", callbackRequest(`state=${STATE}&code=`), 400],
    ["return URL", callbackRequest(`state=${STATE}&code=${CODE}&returnUrl=https://attacker.example`), 400],
    ["callback URL", callbackRequest(`state=${STATE}&code=${CODE}&callbackUrl=${encodeURIComponent(CALLBACK_URL)}`), 400],
    ["identity", callbackRequest(`state=${STATE}&code=${CODE}&email=attacker@example.test`), 400],
  ];
  for (const [label, request, status] of cases) {
    const fixture = createFixture();
    const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(request, {});
    assert.equal(response.status, status, label);
    assert.equal(fixture.oidc.consumeCalls, 0, label);
    assert.equal(fixture.provider.verifyCalls, 0, label);
  }
  const fixture = createFixture();
  const oversized = callbackRequest(`state=${STATE}&code=${"x".repeat(2_100)}`);
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(oversized, {});
  assert.equal(response.status, 413);
  assert.equal(fixture.oidc.consumeCalls, 0);
});

test("provider-error callbacks terminally consume state without provider or tenant work", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture();
  const handler = handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime);
  const first = await handler(callbackRequest(`state=${STATE}&error=access_denied&error_description=${encodeURIComponent("secret provider detail")}`), {});
  assert.equal(first.status, 400);
  assert.deepEqual(await responseBody(first), {
    code: "self_serve_oidc_provider_rejected",
    state: "rejected",
    retryable: false,
    message: "Kimlik sağlayıcı kayıt isteğini reddetti.",
  });
  assert.equal(fixture.oidc.consumeCalls, 1);
  assert.equal(fixture.provider.verifyCalls, 0);
  assert.equal(fixture.attempts.consumeCalls, 0);
  assert.equal(fixture.completion.recordCalls, 0);
  const replay = await handler(callbackRequest(`state=${STATE}&error=access_denied`), {});
  assert.equal(replay.status, 409);
  assert.equal((await responseBody(replay)).code, "self_serve_callback_restart_required");
});

test("maps expired, replayed, discarded, and unknown state without provider or tenant work", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  for (const [state, expectedStatus, expectedCode] of [
    ["expired", 410, "self_serve_oidc_state_expired"],
    ["replayed", 409, "self_serve_callback_restart_required"],
    ["discarded", 400, "self_serve_oidc_invalid_state"],
    ["unknown", 400, "self_serve_oidc_invalid_state"],
  ] as const) {
    const fixture = createFixture({ state });
    const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
    assert.equal(response.status, expectedStatus, state);
    assert.equal((await responseBody(response)).code, expectedCode, state);
    assert.equal(fixture.provider.verifyCalls, 0, state);
    assert.equal(fixture.completion.recordCalls, 0, state);
  }
});

test("replayed consumed callback with no verified identity requires a fresh registration without provider or tenant work", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture({ state: "replayed", recovery: { kind: "awaiting_identity_consumed" } });
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
  assert.equal(response.status, 409);
  assert.deepEqual(await responseBody(response), {
    code: "self_serve_callback_restart_required",
    state: "restart_required",
    retryable: false,
    restartRegistration: true,
    message: "Kayıt işlemi güvenli şekilde yeniden başlatılmalı.",
  });
  assert.equal(fixture.recovery.calls, 1);
  assert.equal(fixture.provider.verifyCalls, 0);
  assert.equal(fixture.completion.recordCalls, 0);
  assert.equal(fixture.completion.resumeCalls, 0);
  assert.equal(fixture.completion.tenantCoreCalls, 0);
});

test("replayed callback resumes durable identity_verified completion at most once without provider verification", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture({
    state: "replayed",
    recovery: { kind: "identity_verified", attemptId: "attempt_0123456789abcdefghijklmnop" },
  });
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
  assert.equal(response.status, 200);
  assert.equal((await responseBody(response)).state, "tenant_created_session_pending");
  assert.equal(fixture.recovery.calls, 1);
  assert.equal(fixture.provider.verifyCalls, 0);
  assert.equal(fixture.completion.recordCalls, 0);
  assert.equal(fixture.completion.resumeCalls, 1);
  assert.equal(fixture.completion.tenantCoreCalls, 0);
  assert.equal(fixture.completion.reconcileCalls, 0);
  assert.deepEqual(fixture.auditEvents.at(-1), {
    operation: "callback_completion",
    stage: "tenant_completion",
    outcome: "completed",
    retryable: false,
    statusCategory: "2xx",
  });
});

test("replayed callback recovers tenant_created authority read-only without provider or Tenant Core", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture({
    state: "replayed",
    recovery: { kind: "tenant_created", attemptId: "attempt_0123456789abcdefghijklmnop" },
  });
  fixture.completion.resumeResult = { kind: "tenant_already_created", result: tenantResult };
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
  assert.equal(response.status, 200);
  assert.equal((await responseBody(response)).state, "tenant_already_created_session_pending");
  assert.equal(fixture.provider.verifyCalls, 0);
  assert.equal(fixture.completion.recordCalls, 0);
  assert.equal(fixture.completion.resumeCalls, 1);
  assert.equal(fixture.completion.tenantCoreCalls, 0);
  assert.equal(fixture.completion.reconcileCalls, 0);
  assert.deepEqual(fixture.auditEvents.at(-1), {
    operation: "callback_completion",
    stage: "tenant_completion",
    outcome: "completed",
    retryable: false,
    statusCategory: "2xx",
  });
});

test("post-consume persistence failure is inspected and maps to non-retryable restart_required", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture({ recovery: { kind: "awaiting_identity_consumed" } });
  fixture.attempts.failConsume = true;
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
  const safeBody = await responseBody(response);
  assert.equal(response.status, 409);
  assert.equal(safeBody.state, "restart_required");
  assert.equal(safeBody.retryable, false);
  assert.equal(safeBody.restartRegistration, true);
  assert.equal(fixture.oidc.consumeCalls, 1);
  assert.equal(fixture.provider.verifyCalls, 1);
  assert.equal(fixture.recovery.calls, 1);
  assert.equal(fixture.completion.recordCalls, 0);
  assert.doesNotMatch(JSON.stringify(safeBody), /SQLSTATE|state_|expected-code|nonce|verifier|owner@example/i);
});

test("unexpected provider failure is classified unavailable after consume without same-callback retry advice", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture();
  fixture.provider.unexpectedError = true;
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await responseBody(response), {
    code: "self_serve_oidc_provider_unavailable",
    state: "restart_required",
    retryable: false,
    restartRegistration: true,
    message: "Kimlik sağlayıcı şu anda kullanılamıyor; kayıt yeniden başlatılmalı.",
  });
  assert.equal(fixture.oidc.consumeCalls, 1);
  assert.equal(fixture.provider.verifyCalls, 1);
  assert.equal(fixture.attempts.consumeCalls, 0);
  assert.equal(fixture.completion.recordCalls, 0);
});

test("provider-supplied transport, timeout, and temporary-unavailable classification stays restart-only", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture();
  fixture.provider.errorCode = "oidc_provider_unavailable";
  const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
  assert.equal(response.status, 503);
  assert.deepEqual(await responseBody(response), {
    code: "self_serve_oidc_provider_unavailable",
    state: "restart_required",
    retryable: false,
    restartRegistration: true,
    message: "Kimlik sağlayıcı şu anda kullanılamıyor; kayıt yeniden başlatılmalı.",
  });
  assert.equal(fixture.oidc.consumeCalls, 1);
  assert.equal(fixture.provider.verifyCalls, 1);
  assert.equal(fixture.attempts.consumeCalls, 0);
  assert.equal(fixture.completion.recordCalls, 0);
});

test("missing, corrupt, unavailable, and terminal replay authority fail closed without provider or tenant creation", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  for (const kind of ["missing", "corrupt", "unavailable", "terminal"] as const) {
    const fixture = createFixture({ state: "replayed", recovery: { kind } });
    const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
    const safeBody = await responseBody(response);
    assert.equal(response.status, kind === "unavailable" ? 503 : 409, kind);
    assert.equal(safeBody.state, "recovery_failed", kind);
    assert.equal(safeBody.retryable, false, kind);
    assert.equal(fixture.provider.verifyCalls, 0, kind);
    assert.equal(fixture.completion.resumeCalls, 0, kind);
    assert.doesNotMatch(JSON.stringify(safeBody), /attempt_|state_|SQL|nonce|verifier/i, kind);
  }
});

test("rejects provider failure, issuer, audience, nonce, PKCE, unverified email, and malformed identity after one-time state consumption", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const cases: Array<[string, (provider: DeterministicProvider) => void, string]> = [
    ["provider", (provider) => { provider.errorCode = "oidc_provider_rejected"; }, "self_serve_oidc_provider_rejected"],
    ["issuer", (provider) => { provider.output = identity({ issuer: "https://attacker.example" }); }, "self_serve_oidc_issuer_mismatch"],
    ["audience", (provider) => { provider.output = identity({ audience: ["wrong"] }); }, "self_serve_oidc_audience_mismatch"],
    ["nonce", (provider) => { provider.output = identity({ nonce: "wrong" }); }, "self_serve_oidc_nonce_mismatch"],
    ["PKCE", (provider) => { provider.errorCode = "oidc_provider_rejected"; }, "self_serve_oidc_provider_rejected"],
    ["emailVerified", (provider) => { provider.output = identity({ emailVerified: false }); }, "self_serve_oidc_provider_rejected"],
    ["email", (provider) => { provider.output = identity({ email: "not-an-email" }); }, "self_serve_oidc_provider_rejected"],
    ["subject", (provider) => { provider.output = identity({ subject: "  " }); }, "self_serve_oidc_provider_rejected"],
  ];
  for (const [label, arrange, code] of cases) {
    const fixture = createFixture();
    arrange(fixture.provider);
    const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
    assert.equal(response.status, 400, label);
    const serialized = JSON.stringify(await responseBody(response));
    assert.match(serialized, new RegExp(code), label);
    assert.doesNotMatch(serialized, /client_secret|expected-code|nonce_private|verifier_private|owner@example|SQLSTATE/i, label);
    assert.equal(fixture.oidc.consumeCalls, 1, label);
    assert.equal(fixture.attempts.consumeCalls, 0, label);
    assert.equal(fixture.completion.recordCalls, 0, label);
  }
});

test("two concurrent callbacks have one winner and record identity and tenant completion once", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const fixture = createFixture();
  const handler = handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime);
  const responses = await Promise.all([handler(callbackRequest(), {}), handler(callbackRequest(), {})]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(fixture.provider.verifyCalls, 1);
  assert.equal(fixture.attempts.consumeCalls, 1);
  assert.equal(fixture.completion.recordCalls, 1);
  assert.equal(fixture.completion.resumeCalls, 1);
});

test("maps every durable completion outcome without automatic reconciliation or Tenant Core retry", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  const cases: Array<[ResumeTenantResult, number, string]> = [
    [{ kind: "tenant_created", result: tenantResult }, 200, "tenant_created_session_pending"],
    [{ kind: "tenant_replayed", result: tenantResult }, 200, "tenant_already_created_session_pending"],
    [{ kind: "tenant_already_created", result: tenantResult }, 200, "tenant_already_created_session_pending"],
    [{ kind: "in_progress" }, 202, "in_progress"],
    [{ kind: "commit_unknown" }, 409, "commit_unknown"],
    [{ kind: "reconciliation_required" }, 409, "reconciliation_required"],
    [{ kind: "completion_state_unknown" }, 503, "completion_state_unknown"],
    [{ kind: "rejected", error: { code: "completion_persistence_failed", retryable: true } }, 503, "completion_rejected"],
    [{ kind: "rejected", error: { code: "slug_conflict", retryable: false } }, 409, "completion_rejected"],
    [{ kind: "rejected", error: { code: "durable_authority_invalid", retryable: false } }, 409, "completion_rejected"],
  ];
  for (const [result, status, state] of cases) {
    const fixture = createFixture();
    fixture.completion.resumeResult = result;
    const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
    assert.equal(response.status, status, result.kind);
    assert.equal((await responseBody(response)).state, state, result.kind);
    assert.equal(fixture.completion.resumeCalls, 1, result.kind);
    assert.equal(fixture.completion.reconcileCalls, 0, result.kind);
  }
});

test("identity-record rejection stops before tenant completion and safely maps retryable and corruption outcomes", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  for (const error of [
    { code: "completion_persistence_failed", retryable: true },
    { code: "durable_authority_invalid", retryable: false },
  ]) {
    const fixture = createFixture();
    fixture.completion.recordResult = { kind: "rejected", error };
    const response = await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
    assert.equal(response.status, 409);
    const safeBody = await responseBody(response);
    if (error.retryable) {
      assert.equal(safeBody.state, "restart_required");
      assert.equal(safeBody.retryable, false);
      assert.equal(safeBody.restartRegistration, true);
    } else {
      assert.equal(safeBody.state, "completion_rejected");
      assert.equal(safeBody.retryable, false);
    }
    assert.equal(fixture.completion.recordCalls, 1);
    assert.equal(fixture.completion.resumeCalls, 0);
    assert.equal(fixture.completion.reconcileCalls, 0);
  }
});

test("audit is coarse, redacted, and throw, rejection, or an unresolved Promise cannot block callback results", async () => {
  assert.ok(handlerModule.createSelfServeOidcCallbackCompletionHandler);
  for (const audit of [
    () => { throw new Error("audit SQLSTATE owner@example.test"); },
    async () => { throw new Error("audit token nonce verifier"); },
    () => new Promise<void>(() => undefined),
  ]) {
    const fixture = createFixture({ audit });
    const response = await Promise.race([
      handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {}),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("audit blocked callback")), 100)),
    ]);
    assert.equal(response.status, 200);
  }
  const fixture = createFixture();
  await handlerModule.createSelfServeOidcCallbackCompletionHandler(fixture.runtime)(callbackRequest(), {});
  const serialized = JSON.stringify(fixture.auditEvents);
  assert.doesNotMatch(serialized, /owner@example|cicek|state_|expected-code|nonce|verifier|https:\/\//i);
  assert.match(serialized, /callback_completion/);
});
