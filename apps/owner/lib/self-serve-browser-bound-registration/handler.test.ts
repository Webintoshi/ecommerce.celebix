import assert from "node:assert/strict";
import test from "node:test";

import {
  createPersistentSelfServeRuntime,
  createSelfServeHttpActivationApproval,
} from "../self-serve-http/runtime.ts";
import { createBrowserBoundRegistrationBridgeApproval } from "./activation.ts";
import { createBrowserBoundSelfServeRegistrationHandler } from "./handler.ts";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const BS1 = `bs1.active.${Buffer.alloc(32, 9).toString("base64url")}`;
const PROVIDER = "https://identity.example.test/authorize?response_type=code&response_mode=query&state=opaque_state_1234567890&redirect_uri=https%3A%2F%2Fpanel.celebix.site%2Fauth%2Fcallback";

function fixture(options: { executeFailure?: boolean; randomFailure?: boolean } = {}) {
  let gateCalls = 0;
  let executorCalls = 0;
  let randomCalls = 0;
  const audits: unknown[] = [];
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: {
      async save() {},
      async consume(): Promise<never> { throw new Error("unused"); },
    },
    oidcTransactionStore: {
      async save() {},
      async consume(): Promise<never> { throw new Error("unused"); },
      async discard() {},
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded", status: "identity_verified", version: 2 }; },
      async resumeTenantCreation() { return { kind: "in_progress" }; },
      async reconcileUnknownCommit() { return { kind: "pending" }; },
    },
    consumedCallbackRecovery: { async classifyConsumedCallback() { return { kind: "missing" } as const; } },
    oidcProvider: {
      buildAuthorizationUrl(): URL { throw new Error("unused"); },
      async verifyCallback(): Promise<never> { throw new Error("unused"); },
    },
    requestGate: { async verify() { gateCalls += 1; return "allowed"; } },
    clock: () => new Date(NOW),
    audit: () => undefined,
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co",
    callbackAuthority: "https://panel.celebix.site/auth/callback",
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: {
      issuer: "https://identity.example.test/oidc",
      audience: "customer-panel",
      authorizationOrigin: "https://identity.example.test",
    },
  });
  const handler = createBrowserBoundSelfServeRegistrationHandler({
    activationApproval: createBrowserBoundRegistrationBridgeApproval("disposable_test"),
    runtime,
    registrationStartExecutor: Object.freeze({
      async execute() {
        executorCalls += 1;
        if (options.executeFailure) throw new Error(`provider ${PROVIDER} ${BS1}`);
        return Object.freeze({
          bootstrapCredential: BS1,
          providerAuthorizationUrl: PROVIDER,
          panelBootstrapAuthority: "https://panel.celebix.site/auth/bootstrap" as const,
          bootstrapExpiresAt: "2026-07-15T12:05:00.000Z",
        });
      },
    }),
    randomBytes(size) {
      randomCalls += 1;
      if (options.randomFailure) throw new Error(`nonce ${PROVIDER} ${BS1}`);
      assert.equal(size, 24);
      return new Uint8Array(24);
    },
    audit(event) { audits.push(structuredClone(event)); },
  });
  return { handler, counts: () => ({ gateCalls, executorCalls, randomCalls }), audits };
}

function request(body: string | Record<string, unknown> = {
  storeName: "Çiçek Pazarı",
  storeSlug: "cicek-pazari",
  marketingConsent: false,
  privacyConsent: true,
}) {
  return new Request("https://ecommerce.celebix.co/api/self-serve/register", {
    method: "POST",
    headers: { origin: "https://ecommerce.celebix.co", "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("browser-bound registration executes the shared gate and durable start exactly once", async () => {
  const { handler, counts, audits } = fixture();
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.deepEqual(counts(), { gateCalls: 1, executorCalls: 1, randomCalls: 1 });
  const serializedAudits = JSON.stringify(audits);
  assert.equal(serializedAudits.includes(BS1), false);
  assert.equal(serializedAudits.includes(PROVIDER), false);
});

test("request rejection is hardened JSON and never starts registration or creates a nonce", async () => {
  const { handler, counts } = fixture();
  const response = await handler(request('{"storeName":"One","storeName":"Two"}'));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("content-type"), "application/json; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.has("set-cookie"), false);
  assert.equal(response.headers.has("location"), false);
  assert.deepEqual(counts(), { gateCalls: 1, executorCalls: 0, randomCalls: 0 });
});

test("bootstrap and nonce failures are controlled, secret-free, non-retryable, and never retried", async () => {
  for (const option of [{ executeFailure: true }, { randomFailure: true }]) {
    const { handler, counts } = fixture(option);
    const response = await handler(request());
    assert.equal(response.status, 503);
    const failure = await response.json();
    assert.deepEqual(failure, {
      code: "self_serve_browser_bridge_unavailable",
      state: "failed",
      retryable: false,
      message: "Güvenli kayıt geçişi tamamlanamadı.",
    });
    assert.equal(response.headers.has("set-cookie"), false);
    assert.equal(response.headers.has("location"), false);
    assert.equal(JSON.stringify(failure).includes(PROVIDER), false);
    assert.equal(counts().executorCalls, 1);
    assert.ok(counts().randomCalls <= 1);
  }
});
