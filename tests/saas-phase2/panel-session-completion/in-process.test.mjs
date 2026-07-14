import assert from "node:assert/strict";
import test from "node:test";

import { OidcFlowError } from "../../../apps/owner/lib/self-serve-oidc.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../../../apps/owner/lib/self-serve-http/runtime.ts";
import { createVerifiedEdgeTrustBoundary } from "../../../apps/owner/lib/self-serve-http/verified-edge-trust.ts";
import { createPanelSessionHandoffApproval } from "../../../apps/owner/lib/panel-session-handoff/activation.ts";
import { createOwnerPanelSessionInitialCallbackHandler } from "../../../apps/owner/lib/panel-session-handoff/internal-callback-handler.ts";
import { createInitialVerifiedCallbackGrantBoundary } from "../../../apps/owner/lib/panel-session-handoff/initial-callback-grant.ts";
import { createOwnerPanelSessionHandoffGatewayApproval, createOwnerPanelSessionHandoffInternalGateway } from "../../../apps/owner/lib/panel-session-handoff/internal-gateway.ts";
import { createPostgresPanelSessionHandoffIssuer } from "../../../apps/owner/lib/panel-session-handoff/postgres-handoff-issuer.ts";
import { createPanelSessionCompletionApproval } from "../../../apps/customer-panel/lib/panel-session-completion/activation.ts";
import { createPanelSessionCompletionHandler } from "../../../apps/customer-panel/lib/panel-session-completion/completion.ts";
import { createAuthenticatedPanelSessionCompletionTransport } from "../../../apps/customer-panel/lib/panel-session-completion/transport.ts";

const NOW = new Date("2026-07-14T12:00:00.000Z");
const CALLBACK = "https://panel.celebix.site/auth/callback";
const STATE = "state_0123456789abcdefghijklmnop";
const OWNER_ORIGIN = "https://owner-internal.example.test";
const ENDPOINT = `${OWNER_ORIGIN}/api/internal/self-serve/oidc-callback`;
const PROVIDER_ISSUER = "https://identity.example.test/oidc";
const AUDIENCE = "customer-panel";
const SECRET = new Uint8Array(32).fill(0x35);
const SESSION_CREDENTIAL = `v1.panel.active.${Buffer.alloc(32, 0x55).toString("base64url")}`;
const UUIDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
];

function withUrl(response, url = ENDPOINT) {
  Object.defineProperty(response, "url", { configurable: true, value: url });
  return response;
}

function session() {
  return Object.freeze({
    sessionId: UUIDS[0], familyId: UUIDS[1], principalId: UUIDS[2], activeStoreId: UUIDS[3], version: 1,
    issuedAt: NOW.toISOString(), rotatedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
}

function compose(options = {}) {
  const edgeBoundary = createVerifiedEdgeTrustBoundary();
  let consumed = false;
  let providerCalls = 0;
  let providerRejections = 0;
  let consumedRecoveryCalls = 0;
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    oidcTransactionStore: {
      async save() {}, async discard() {},
      async consume() {
        providerRejections += 1;
        if (consumed) throw new OidcFlowError("oidc_state_replayed", "private");
        consumed = true;
        return {
          state: STATE, nonce: "nonce_0123456789abcdefghijklmnop", codeVerifier: "verifier_0123456789abcdefghijklmnop",
          redirectUri: CALLBACK, returnTo: "/kayit", expectedIssuer: PROVIDER_ISSUER, expectedAudience: AUDIENCE,
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    registrationAttemptStore: {
      async save() {},
      async consume() {
        return {
          id: "attempt_0123456789abcdefghijklmnop", state: STATE,
          details: { storeName: "Verified Store", storeSlug: "verified-store", locale: "tr", currency: "TRY", themeKey: "starter", privacyAcceptedAt: NOW.toISOString() },
          idempotencyKey: "ssik_0123456789abcdefghijklmnop", requestedAt: NOW.toISOString(), status: "awaiting_identity",
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    oidcProvider: {
      buildAuthorizationUrl() { throw new Error("not used"); },
      async verifyCallback() {
        providerCalls += 1;
        return { issuer: PROVIDER_ISSUER, subject: "subject", audience: [AUDIENCE], nonce: "nonce_0123456789abcdefghijklmnop", email: "owner@example.test", emailVerified: true };
      },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded", status: "identity_verified", version: 2 }; },
      async resumeTenantCreation() {
        return {
          kind: "tenant_created",
          result: { store: { slug: "verified-store" }, storefrontUrl: "https://verified-store.celebix.site", panelUrl: "https://panel.celebix.site", operationId: "operation", replayed: false },
        };
      },
      async reconcileUnknownCommit() { return { kind: "pending" }; },
    },
    consumedCallbackRecovery: { async classifyConsumedCallback() { consumedRecoveryCalls += 1; return { kind: "missing" }; } },
    requestGate: edgeBoundary.requestGate,
    clock: () => new Date(NOW), audit() {}, bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co", callbackAuthority: CALLBACK, panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: PROVIDER_ISSUER, audience: AUDIENCE, authorizationOrigin: "https://identity.example.test" },
  });
  const grantBoundary = createInitialVerifiedCallbackGrantBoundary(runtime);
  let uuidIndex = 0;
  let createValues;
  let issuerCalls = 0;
  const handoffAuthority = (values) => ({
    handoffId: String((createValues ?? values)[4] ?? UUIDS[0]), attemptId: "attempt_0123456789abcdef",
    tenantOperationId: "20000000-0000-4000-8000-000000000001", principalId: UUIDS[2], activeStoreId: UUIDS[3],
    sessionOperationId: String((createValues ?? values)[5] ?? UUIDS[1]), sessionId: String((createValues ?? values)[6] ?? UUIDS[0]),
    familyId: String((createValues ?? values)[7] ?? UUIDS[1]), tokenKeyId: String(values[1]), tokenDigest: String(values[2]),
    sessionTokenKeyId: String(values[3]), issuedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
    sessionExpiresAt: new Date(NOW.getTime() + 28_800_000).toISOString(),
  });
  const issuer = createPostgresPanelSessionHandoffIssuer(createPanelSessionHandoffApproval("disposable_test"), {
    pool: { async connect() { return {
      async query(text, values = []) {
        if (/^BEGIN|^COMMIT$|^ROLLBACK$|set_config|SET LOCAL ROLE/.test(text)) return { rows: [], rowCount: 0 };
        if (text.includes("create_panel_session_handoff")) {
          issuerCalls += 1; createValues = values;
          return { rows: [{ outcome: "handoff_created", authority: handoffAuthority(values) }], rowCount: 1 };
        }
        return { rows: [{ outcome: "handoff_replayed", authority: handoffAuthority(values) }], rowCount: 1 };
      }, release() {},
    }; } },
    stateDigester: { digest() { return "a".repeat(64); } },
    handoffKeys: new Map([["handoff.active.v1", new Uint8Array(32).fill(0x41)]]), activeHandoffKeyId: "handoff.active.v1",
    sessionTokenKeyId: "panel.active.v1", clock: () => new Date(NOW), randomBytes: () => new Uint8Array(32).fill(0x42),
    randomUuid: () => UUIDS[uuidIndex++] ?? UUIDS.at(-1),
    timeouts: { poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 }, audit() {},
    initialCallbackGrantBoundary: grantBoundary,
  });
  const ownerHandler = createOwnerPanelSessionInitialCallbackHandler({
    runtime, edgeTrustBoundary: edgeBoundary, initialCallbackGrantBoundary: grantBoundary, issuer,
    clock: () => new Date(NOW), audit() {},
  });
  const ownerGateway = createOwnerPanelSessionHandoffInternalGateway({
    activationApproval: createOwnerPanelSessionHandoffGatewayApproval("disposable_test"), ownerInternalOrigin: OWNER_ORIGIN,
    keys: new Map([["active", SECRET]]), clock: () => new Date(NOW), maximumBodyBytes: 4_096,
    edgeTrustBoundary: edgeBoundary, callbackHandler: ownerHandler, audit() {},
  });
  let fetchCalls = 0;
  const fetch = async (request) => {
    fetchCalls += 1;
    const response = await ownerGateway(request);
    if (options.loseOwnerResponse) throw new Error("simulated response loss");
    if (options.tamper) {
      const body = await response.text();
      const headers = new Headers(response.headers);
      const tampered = options.tamper === "body"
        ? new Response(body.replace("handoff.active", "handoff.tampered"), { status: response.status, headers })
        : new Response(body, { status: 409, headers });
      return withUrl(tampered);
    }
    return withUrl(response);
  };
  const transport = createAuthenticatedPanelSessionCompletionTransport({
    activationApproval: createPanelSessionCompletionApproval("disposable_test"), ownerInternalOrigin: OWNER_ORIGIN,
    activeKeyId: "active", activeSecret: SECRET, fetch, clock: () => new Date(NOW), deadlineMs: 500,
    maximumResponseBytes: 4_096, audit() {},
  });
  let redeemCalls = 0;
  let recoveryCalls = 0;
  const redeemer = {
    async redeemHandoff() {
      redeemCalls += 1;
      if (options.redemptionCommitUnknown) return Object.freeze({ kind: "commit_unknown", credential: SESSION_CREDENTIAL });
      if (options.redemptionDenied) return Object.freeze({ kind: "unauthenticated" });
      return Object.freeze({ kind: "session_issued", credential: SESSION_CREDENTIAL, session: session() });
    },
    async recoverRedemption() {
      recoveryCalls += 1;
      return Object.freeze({ kind: "session_replayed", credential: SESSION_CREDENTIAL, session: session() });
    },
  };
  const completion = createPanelSessionCompletionHandler({
    activationApproval: createPanelSessionCompletionApproval("disposable_test"), publicCallbackAuthority: CALLBACK,
    maximumQueryBytes: 2_048, transport, redeemer, clock: () => new Date(NOW), audit() {},
  });
  return {
    completion, ownerGateway,
    get providerCalls() { return providerCalls; }, get providerRejections() { return providerRejections; },
    get consumedRecoveryCalls() { return consumedRecoveryCalls; }, get issuerCalls() { return issuerCalls; },
    get fetchCalls() { return fetchCalls; }, get redeemCalls() { return redeemCalls; }, get recoveryCalls() { return recoveryCalls; },
  };
}

function callback(query = `state=${STATE}&code=verified-code`) {
  return new Request(`${CALLBACK}?${query}`);
}

test("full in-process initial callback returns one cookie and replay reaches neither issuer nor redeemer", async () => {
  const current = compose();
  const first = await current.completion(callback());
  assert.equal(first.status, 303);
  assert.match(first.headers.get("set-cookie") ?? "", /^__Host-celebix_panel=v1\./);
  assert.equal(current.issuerCalls, 1);
  assert.equal(current.redeemCalls, 1);
  const replay = await current.completion(callback());
  assert.equal(replay.status, 409);
  assert.equal(replay.headers.has("set-cookie"), false);
  assert.equal(current.issuerCalls, 1);
  assert.equal(current.redeemCalls, 1);
  assert.equal(current.consumedRecoveryCalls, 0);
});

test("concurrent duplicate delivery creates exactly one session-bearing browser response", async () => {
  const current = compose();
  const responses = await Promise.all([current.completion(callback()), current.completion(callback())]);
  assert.equal(responses.filter((response) => response.headers.has("set-cookie")).length, 1);
  assert.equal(current.issuerCalls, 1);
  assert.equal(current.redeemCalls, 1);
});

test("signed response body/status tamper and Owner response loss never redeem or set a cookie", async () => {
  for (const tamper of ["body", "status"]) {
    const current = compose({ tamper });
    const response = await current.completion(callback());
    assert.equal(response.status, 503);
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(current.redeemCalls, 0);
  }
  const lost = compose({ loseOwnerResponse: true });
  const response = await lost.completion(callback());
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    code: "panel_session_transport_unavailable",
    retryable: false,
    freshLoginRequired: true,
  });
  assert.equal(lost.fetchCalls, 1);
  assert.equal(lost.issuerCalls, 1);
  assert.equal(lost.redeemCalls, 0);
});

test("redemption response loss performs one recovery; denied replay never re-cookies", async () => {
  const recovered = compose({ redemptionCommitUnknown: true });
  assert.equal((await recovered.completion(callback())).status, 303);
  assert.equal(recovered.redeemCalls, 1);
  assert.equal(recovered.recoveryCalls, 1);
  const denied = compose({ redemptionDenied: true });
  const response = await denied.completion(callback());
  assert.equal(response.status, 409);
  assert.equal(response.headers.has("set-cookie"), false);
});

test("provider error is signed but creates no grant, handoff, redemption, cookie, or redirect", async () => {
  const current = compose();
  const response = await current.completion(callback(`state=${STATE}&error=access_denied&error_description=private`));
  assert.equal(response.status, 400);
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.equal(current.providerCalls, 0);
  assert.equal(current.providerRejections, 1);
  assert.equal(current.issuerCalls, 0);
  assert.equal(current.redeemCalls, 0);
});

test("pre-authenticated Owner errors are unsigned and execute no callback authority", async () => {
  const current = compose();
  const response = await current.ownerGateway(new Request(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: "{}",
  }));
  assert.equal(response.status, 401);
  assert.equal(response.headers.has("x-celebix-session-response-signature"), false);
  assert.equal(current.providerCalls, 0);
  assert.equal(current.issuerCalls, 0);
});
