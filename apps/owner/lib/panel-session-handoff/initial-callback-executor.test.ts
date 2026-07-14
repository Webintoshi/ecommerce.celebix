import assert from "node:assert/strict";
import test from "node:test";

import type { CreateStarterTenantResult } from "@celebix/saas-contracts";

import { OidcFlowError } from "../self-serve-oidc.ts";
import { createPersistentSelfServeRuntime, createSelfServeHttpActivationApproval } from "../self-serve-http/runtime.ts";
import { createInitialVerifiedCallbackGrantBoundary } from "./initial-callback-grant.ts";
import { createInitialCallbackPanelSessionHandoffExecutor } from "./initial-callback-executor.ts";

const NOW = new Date("2026-07-14T10:00:00.000Z");
const STATE = "state_0123456789abcdefghijklmnop";
const CALLBACK = "https://panel.celebix.site/auth/callback";
const ISSUER = "https://identity.example.test/oidc";
const AUDIENCE = "customer-panel";

function runtimeFixture() {
  let consumed = false;
  let recoveryCalls = 0;
  const runtime = createPersistentSelfServeRuntime({
    activationApproval: createSelfServeHttpActivationApproval("disposable_test"),
    oidcTransactionStore: {
      async save() {}, async discard() {},
      async consume() {
        if (consumed) throw new OidcFlowError("oidc_state_replayed", "private");
        consumed = true;
        return {
          state: STATE, nonce: "nonce_0123456789abcdefghijklmnop", codeVerifier: "verifier_0123456789abcdefghijklmnop",
          redirectUri: CALLBACK, returnTo: "/kayit", expectedIssuer: ISSUER, expectedAudience: AUDIENCE,
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    registrationAttemptStore: {
      async save() {},
      async consume() {
        return {
          id: "attempt_0123456789abcdefghijklmnop", state: STATE,
          details: { storeName: "Verified Store", storeSlug: "verified-store", locale: "tr" as const, currency: "TRY" as const, themeKey: "starter", privacyAcceptedAt: NOW.toISOString() },
          idempotencyKey: "ssik_0123456789abcdefghijklmnop", requestedAt: NOW.toISOString(), status: "awaiting_identity" as const,
          createdAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 600_000).toISOString(),
        };
      },
    },
    oidcProvider: {
      buildAuthorizationUrl() { throw new Error("not used"); },
      async verifyCallback() {
        return { issuer: ISSUER, subject: "subject", audience: [AUDIENCE], nonce: "nonce_0123456789abcdefghijklmnop", email: "owner@example.test", emailVerified: true };
      },
    },
    registrationCompletion: {
      async recordVerifiedIdentity() { return { kind: "identity_recorded" as const, status: "identity_verified" as const, version: 2 }; },
      async resumeTenantCreation() {
        return {
          kind: "tenant_created" as const,
          result: {
            store: { slug: "verified-store" }, storefrontUrl: "https://verified-store.celebix.site",
            panelUrl: "https://panel.celebix.site", operationId: "operation_verified", replayed: false,
          } as CreateStarterTenantResult,
        };
      },
      async reconcileUnknownCommit() { return { kind: "pending" as const }; },
    },
    consumedCallbackRecovery: {
      async classifyConsumedCallback() { recoveryCalls += 1; return { kind: "missing" as const }; },
    },
    requestGate: { async verify() { return "allowed" as const; } },
    clock: () => new Date(NOW), audit() {},
    bodyPolicy: { maximumBytes: 4_096, maximumCallbackQueryBytes: 2_048 },
    registrationOrigin: "https://ecommerce.celebix.co", callbackAuthority: CALLBACK,
    panelOrigin: "https://panel.celebix.site", platformDomainSuffix: "celebix.site",
    providerAuthority: { issuer: ISSUER, audience: AUDIENCE, authorizationOrigin: "https://identity.example.test" },
  });
  return { runtime, get recoveryCalls() { return recoveryCalls; } };
}

test("unmounted executor issues only inside the first verified callback grant", async () => {
  const fixture = runtimeFixture();
  const boundary = createInitialVerifiedCallbackGrantBoundary(fixture.runtime);
  const calls: unknown[] = [];
  const issuer = {
    async issueHandoff(input: unknown) {
      calls.push(input);
      return { kind: "handoff_created" as const, credential: "h1.active.random", expiresAt: "2026-07-14T10:10:00.000Z" };
    },
    async recoverHandoff() { throw new Error("not expected"); },
  };
  const executor = createInitialCallbackPanelSessionHandoffExecutor({ runtime: fixture.runtime, boundary, issuer });
  const first = await executor.execute({ state: STATE, code: "verified-code" });
  assert.equal(first.kind, "initial_callback_granted");
  if (first.kind === "initial_callback_granted") assert.equal(first.value.handoff.kind, "handoff_created");
  assert.equal(calls.length, 1);
  assert.equal((calls[0] as { rawState: string }).rawState, STATE);

  const replay = await executor.execute({ state: STATE, code: "verified-code" });
  assert.deepEqual(replay, { kind: "initial_callback_replayed" });
  assert.equal(calls.length, 1);
  assert.equal(fixture.recoveryCalls, 0);
  assert.equal(Object.isFrozen(executor), true);
  assert.deepEqual(Object.keys(executor), ["execute"]);
});
