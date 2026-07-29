import assert from "node:assert/strict";
import test from "node:test";

import { createPanelBrowserBindingAuthorityCodec } from "../panel-browser-binding/credential-codec.ts";
import type { PostgresPanelBrowserBindingRepository } from "../panel-browser-binding/postgres-repository.ts";
import {
  createPersistentSelfServeRuntime,
  createSelfServeHttpActivationApproval,
} from "../self-serve-http/runtime.ts";
import { createOwnerSelfServeAuthCompositionApproval } from "./activation.ts";
import {
  assertDisabledOwnerSelfServeAuthComposition,
  createDisabledOwnerSelfServeAuthComposition,
} from "./composition.ts";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const UUID = "11111111-1111-4111-8111-111111111111";
const INTERNAL_KEYS = new Map([["internal-key", new Uint8Array(32).fill(23)]]);

function fixture() {
  let gateCalls = 0;
  let attemptSaves = 0;
  let bootstrapCreates = 0;
  const oidc = new Map<string, unknown>();
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    registrationAttemptStore: {
      async save() { attemptSaves += 1; },
      async consume(): Promise<never> { throw new Error("unused"); },
    },
    oidcTransactionStore: {
      async save(transaction) { oidc.set(transaction.state, transaction); },
      async consume(): Promise<never> { throw new Error("unused"); },
      async discard(state) { oidc.delete(state); },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded", status: "identity_verified", version: 2 }; },
      async resumeTenantCreation() { return { kind: "in_progress" }; },
      async reconcileUnknownCommit() { return { kind: "pending" }; },
    },
    consumedCallbackRecovery: { async classifyConsumedCallback() { return { kind: "missing" } as const; } },
    oidcProvider: {
      buildAuthorizationUrl(input) {
        const url = new URL("https://identity.example.test/authorize");
        url.searchParams.set("response_type", "code");
        url.searchParams.set("response_mode", "query");
        url.searchParams.set("state", input.state);
        url.searchParams.set("nonce", input.nonce);
        url.searchParams.set("code_challenge", input.codeChallenge);
        url.searchParams.set("code_challenge_method", input.codeChallengeMethod);
        url.searchParams.set("redirect_uri", input.redirectUri);
        return url;
      },
      async verifyCallback(): Promise<never> { throw new Error("unused"); },
    },
    requestGate: { async verify() { gateCalls += 1; return "allowed"; } },
    clock: () => new Date(NOW),
    audit: () => undefined,
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 8_192 },
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
  const stateDigester = Object.freeze({ digest: () => "a".repeat(64) });
  const credentialCodec = createPanelBrowserBindingAuthorityCodec({
    bootstrapKeys: new Map([["bootstrap-key", new Uint8Array(32).fill(29)]]),
    activeBootstrapKeyId: "bootstrap-key",
    browserBindingKeys: new Map([["binding-key", new Uint8Array(32).fill(31)]]),
    activeBrowserBindingKeyId: "binding-key",
    randomBytes: (size) => new Uint8Array(size).fill(37),
  });
  const repository: PostgresPanelBrowserBindingRepository = {
    async createBootstrap(input) {
      bootstrapCreates += 1;
      return { kind: "browser_bootstrap_created", expiresAt: input.expiresAt.toISOString() };
    },
    async bindBrowserCredential(input) {
      return {
        kind: "browser_binding_created",
        providerAuthorizationUrl: input.providerAuthorizationUrl,
        expiresAt: input.expiresAt.toISOString(),
      };
    },
    async claimCallback() { return { kind: "browser_callback_claimed" }; },
    async cleanupExpired() { return { kind: "cleaned", count: 0 }; },
  };
  const composition = createDisabledOwnerSelfServeAuthComposition({
    activationApproval: createOwnerSelfServeAuthCompositionApproval("disposable_test"),
    runtime,
    stateDigester,
    browserBindingCredentialCodec: credentialCodec,
    browserBindingRepository: repository,
    ownerInternalOrigin: "https://ecommerce.celebix.co",
    browserBindingInternalKeys: INTERNAL_KEYS,
    sessionCompletionInternalKeys: INTERNAL_KEYS,
    browserBindingMaximumBodyBytes: 16_384,
    sessionCompletionMaximumBodyBytes: 16_384,
    clock: () => new Date(NOW),
    randomUuid: () => UUID,
    randomNonceBytes: (size) => new Uint8Array(size).fill(41),
    handoffIssuer: {
      pool: { async connect(): Promise<never> { throw new Error("not connected during composition"); } },
      handoffKeys: new Map([["handoff-key", new Uint8Array(32).fill(43)]]),
      activeHandoffKeyId: "handoff-key",
      sessionTokenKeyId: "session-key",
      randomBytes: (size) => new Uint8Array(size).fill(47),
      timeouts: { poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 },
      audit: () => undefined,
    },
    bridgeAudit: () => undefined,
    browserBindingStartAudit: () => undefined,
    browserBindingGatewayAudit: () => undefined,
    initialCallbackAudit: () => undefined,
    sessionHandoffGatewayAudit: () => undefined,
  });
  return { composition, counts: () => ({ gateCalls, attemptSaves, bootstrapCreates }) };
}

test("Owner composition returns only the genuine frozen handler bundle and exact readiness", () => {
  const { composition } = fixture();
  assert.deepEqual(Object.keys(composition), [
    "browserBoundRegistrationHandler",
    "browserBindingInternalGateway",
    "sessionHandoffInternalGateway",
    "readiness",
  ]);
  assert.equal(Object.isFrozen(composition), true);
  assert.equal(Object.isSealed(composition), true);
  assert.doesNotThrow(() => assertDisabledOwnerSelfServeAuthComposition(composition));
  assert.throws(() => assertDisabledOwnerSelfServeAuthComposition({ ...composition }));
  assert.deepEqual(composition.readiness, {
    schemaVersion: 1,
    phase: "2B2B2B",
    productionActivation: "forbidden",
    requiredNextGate: "route_mount_and_staging_e2e",
    endpoints: {
      publicRegistration: { method: "POST", path: "/api/self-serve/register", state: "disabled_unmounted" },
      internalBrowserBinding: { method: "POST", path: "/api/internal/self-serve/browser-binding", state: "disabled_unmounted" },
      internalCallback: { method: "POST", path: "/api/internal/self-serve/oidc-callback", state: "disabled_unmounted" },
    },
  });
  assert.equal(JSON.stringify(composition).includes("internal-key"), false);
});

test("Owner composition uses the same genuine runtime for one gate, one registration, and one bootstrap", async () => {
  const { composition, counts } = fixture();
  const response = await composition.browserBoundRegistrationHandler(new Request(
    "https://ecommerce.celebix.co/api/self-serve/register",
    {
      method: "POST",
      headers: { origin: "https://ecommerce.celebix.co", "content-type": "application/json" },
      body: JSON.stringify({
        storeName: "Çiçek Pazarı",
        storeSlug: "cicek-pazari",
        marketingConsent: false,
        privacyConsent: true,
      }),
    },
  ));
  assert.equal(response.status, 200);
  assert.deepEqual(counts(), { gateCalls: 1, attemptSaves: 1, bootstrapCreates: 1 });
  assert.equal(response.headers.has("location"), false);
  assert.equal(response.headers.has("set-cookie"), false);
});
