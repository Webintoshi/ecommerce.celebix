import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import { OidcFlowError } from "../self-serve-oidc.ts";
import {
  createPersistentSelfServeRuntime,
  createSelfServeHttpActivationApproval,
} from "../self-serve-http/runtime.ts";
import {
  createInitialVerifiedCallbackGrantBoundary,
  isActiveInitialVerifiedCallbackGrantForState,
} from "./initial-callback-grant.ts";

const NOW = new Date("2026-07-14T10:00:00.000Z");
const STATE = "state_0123456789abcdefghijklmnop";
const OTHER_STATE = "state_other_0123456789abcdefghijk";
const CODE = "verified-code";
const OTHER_CODE = "substituted-code";
const CALLBACK = "https://panel.celebix.site/auth/callback";
const ISSUER = "https://identity.example.test/oidc";
const AUDIENCE = "customer-panel";

const tenantResult = {
  store: { slug: "verified-store" },
  storefrontUrl: "https://verified-store.celebix.site",
  panelUrl: "https://panel.celebix.site",
  operationId: "operation_verified",
  replayed: false,
} as CreateStarterTenantResult;

function fixture(
  completionKind: "tenant_created" | "in_progress" = "tenant_created",
  hooks: { providerStarted?(): void; waitForProviderRelease?(): Promise<void> } = {},
) {
  let consumed = false;
  let providerCalls = 0;
  let recoveryCalls = 0;
  const providerInputs: Array<{ state: string; code: string; responseIssuer?: string }> = [];
  const attemptStates: string[] = [];
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    oidcTransactionStore: {
      async save() {},
      async discard() {},
      async consume(state: string) {
        assert.equal(state, STATE);
        if (consumed) throw new OidcFlowError("oidc_state_replayed", "private replay detail");
        consumed = true;
        return {
          state: STATE,
          nonce: "nonce_0123456789abcdefghijklmnop",
          codeVerifier: "verifier_0123456789abcdefghijklmnop",
          redirectUri: CALLBACK,
          returnTo: "/kayit",
          expectedIssuer: ISSUER,
          expectedAudience: AUDIENCE,
          createdAt: NOW.toISOString(),
          expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    registrationAttemptStore: {
      async save() {},
      async consume(state: string) {
        attemptStates.push(state);
        return {
          id: "attempt_0123456789abcdefghijklmnop",
          state: STATE,
          details: {
            storeName: "Verified Store",
            storeSlug: "verified-store",
            locale: "tr" as const,
            currency: "TRY" as const,
            themeKey: "starter",
            privacyAcceptedAt: NOW.toISOString(),
          },
          idempotencyKey: "ssik_0123456789abcdefghijklmnop",
          requestedAt: NOW.toISOString(),
          status: "awaiting_identity" as const,
          createdAt: NOW.toISOString(),
          expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    oidcProvider: {
      buildAuthorizationUrl() { throw new Error("not used"); },
      async verifyCallback(input) {
        providerCalls += 1;
        providerInputs.push({
          state: input.state,
          code: input.code,
          ...(input.responseIssuer ? { responseIssuer: input.responseIssuer } : {}),
        });
        hooks.providerStarted?.();
        await hooks.waitForProviderRelease?.();
        return {
          issuer: ISSUER,
          subject: "subject-verified",
          audience: [AUDIENCE],
          nonce: "nonce_0123456789abcdefghijklmnop",
          email: "owner@example.test",
          emailVerified: true,
        };
      },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() {
        return { kind: "identity_recorded" as const, status: "identity_verified" as const, version: 2 };
      },
      async resumeTenantCreation() {
        return completionKind === "tenant_created"
          ? { kind: "tenant_created" as const, result: tenantResult }
          : { kind: "in_progress" as const };
      },
      async reconcileUnknownCommit() { return { kind: "pending" as const }; },
    },
    consumedCallbackRecovery: {
      async classifyConsumedCallback() {
        recoveryCalls += 1;
        return { kind: "tenant_created" as const, attemptId: "attempt_0123456789abcdefghijklmnop" };
      },
    },
    requestGate: { async verify() { return "allowed" as const; } },
    clock: () => new Date(NOW),
    audit() {},
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co",
    callbackAuthority: CALLBACK,
    panelOrigin: "https://panel.celebix.site",
    platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: ISSUER, audience: AUDIENCE, authorizationOrigin: "https://identity.example.test" },
  });
  return {
    runtime,
    get providerCalls() { return providerCalls; },
    get recoveryCalls() { return recoveryCalls; },
    providerInputs,
    attemptStates,
  };
}

test("current provider-verified callback owns one frozen active grant with no sensitive surface", async () => {
  const current = fixture();
  const boundary = createInitialVerifiedCallbackGrantBoundary(current.runtime);
  let captured: unknown;
  const result = await boundary.executeInitialCallback({ state: STATE, code: CODE }, async (grant, completion) => {
    captured = grant;
    assert.equal(Object.isFrozen(boundary), true);
    assert.equal(Object.isFrozen(grant), true);
    assert.deepEqual(Object.keys(grant), []);
    assert.deepEqual(JSON.parse(JSON.stringify(grant)), {});
    assert.equal(isActiveInitialVerifiedCallbackGrantForState(boundary, grant, STATE), true);
    assert.equal(isActiveInitialVerifiedCallbackGrantForState(boundary, grant, OTHER_STATE), false);
    assert.equal(completion.kind, "tenant_created_session_pending");
    return "work-completed" as const;
  });
  assert.deepEqual(result, {
    kind: "initial_callback_granted",
    completion: {
      kind: "tenant_created_session_pending",
      storeSlug: "verified-store",
      storefrontUrl: "https://verified-store.celebix.site",
      panelUrl: "https://panel.celebix.site",
      provisioningStatus: "ready",
    },
    value: "work-completed",
  });
  assert.equal(current.providerCalls, 1);
  assert.equal(current.recoveryCalls, 0);
  assert.equal(isActiveInitialVerifiedCallbackGrantForState(boundary, captured, STATE), false);
  assert.equal(isActiveInitialVerifiedCallbackGrantForState(boundary, { ...(captured as object) }, STATE), false);
  assert.equal(isActiveInitialVerifiedCallbackGrantForState(boundary, JSON.parse(JSON.stringify(captured)), STATE), false);
  assert.equal(isActiveInitialVerifiedCallbackGrantForState(boundary, { kind: "tenant_created_session_pending" }, STATE), false);
});

test("consumed callback and cross-boundary copies receive no grant and never use recovery", async () => {
  const current = fixture();
  const boundary = createInitialVerifiedCallbackGrantBoundary(current.runtime);
  const otherBoundary = createInitialVerifiedCallbackGrantBoundary(current.runtime);
  let workCalls = 0;
  let crossBoundaryAccepted = false;
  await boundary.executeInitialCallback({ state: STATE, code: CODE }, async (grant) => {
    workCalls += 1;
    crossBoundaryAccepted = isActiveInitialVerifiedCallbackGrantForState(otherBoundary, grant, STATE);
  });
  const replay = await boundary.executeInitialCallback({ state: STATE, code: CODE }, async () => { workCalls += 1; });
  assert.deepEqual(replay, { kind: "initial_callback_replayed" });
  assert.equal(workCalls, 1);
  assert.equal(crossBoundaryAccepted, false);
  assert.equal(current.providerCalls, 1);
  assert.equal(current.recoveryCalls, 0);
});

test("callback snapshot survives caller mutation and privately binds the grant to the original exact state", async () => {
  let announceProvider!: () => void;
  const providerStarted = new Promise<void>((resolve) => { announceProvider = resolve; });
  let releaseProvider!: () => void;
  const providerRelease = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const current = fixture("tenant_created", {
    providerStarted: announceProvider,
    waitForProviderRelease: () => providerRelease,
  });
  const boundary = createInitialVerifiedCallbackGrantBoundary(current.runtime);
  const callback = { state: STATE, code: CODE, responseIssuer: ISSUER };
  let acceptedOriginal = false;
  let acceptedSubstitution = true;
  const pending = boundary.executeInitialCallback(callback, (grant) => {
    acceptedOriginal = isActiveInitialVerifiedCallbackGrantForState(boundary, grant, STATE);
    acceptedSubstitution = isActiveInitialVerifiedCallbackGrantForState(boundary, grant, OTHER_STATE);
  });
  await providerStarted;
  callback.state = OTHER_STATE;
  callback.code = OTHER_CODE;
  callback.responseIssuer = "https://attacker.example/oidc";
  releaseProvider();
  const result = await pending;

  assert.equal(result.kind, "initial_callback_granted");
  assert.deepEqual(current.providerInputs, [{ state: STATE, code: CODE, responseIssuer: ISSUER }]);
  assert.deepEqual(current.attemptStates, [STATE]);
  assert.equal(acceptedOriginal, true);
  assert.equal(acceptedSubstitution, false);
});

test("non-terminal completion creates no grant and does not invoke work", async () => {
  const current = fixture("in_progress");
  const boundary = createInitialVerifiedCallbackGrantBoundary(current.runtime);
  let workCalls = 0;
  const result = await boundary.executeInitialCallback({ state: STATE, code: CODE }, async () => { workCalls += 1; });
  assert.deepEqual(result, {
    kind: "initial_callback_completed_without_grant",
    completion: { kind: "in_progress", retryable: true },
  });
  assert.equal(workCalls, 0);
});
