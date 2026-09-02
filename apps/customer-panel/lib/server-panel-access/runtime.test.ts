import assert from "node:assert/strict";
import test from "node:test";

import {
  createApprovedStagingServerPanelAccessRuntime,
  createDisabledServerPanelAccessRuntime,
  createUnavailableServerPanelAccessRuntime,
} from "./runtime.ts";

const NOW = new Date("2026-07-16T10:00:00.000Z");
const CREDENTIAL = `v1.session.v1.${"A".repeat(43)}`;
const PANEL_ORIGIN = "https://staging-panel.celebix.site";
const STORE_ID = "33333333-3333-4333-8333-333333333333";
const OPERATION_ID = "44444444-4444-4444-8444-444444444444";

test("disabled and unavailable runtimes stay fail closed and frozen", async () => {
  const disabled = createDisabledServerPanelAccessRuntime();
  const unavailable = createUnavailableServerPanelAccessRuntime();
  assert.equal(disabled.readiness.mode, "disabled");
  assert.equal(unavailable.readiness.mode, "unavailable");
  assert.equal(disabled.panelOrigin, null);
  assert.equal(unavailable.panelOrigin, null);
  assert.equal(Object.isFrozen(disabled), true);
  assert.deepEqual(await disabled.resolveCredential({
    credential: CREDENTIAL,
    requestId: "request-disabled",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await unavailable.resolveCredential({
    credential: null,
    requestId: "request-unavailable-missing",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await unavailable.resolveCredential({
    credential: CREDENTIAL,
    requestId: "request-unavailable",
    now: NOW,
  }), { kind: "unavailable" });
  assert.deepEqual(await disabled.rotateCredential({
    currentCredential: CREDENTIAL,
    operationId: OPERATION_ID,
    requestedStoreId: STORE_ID,
    now: NOW,
  }), { kind: "unavailable" });
  assert.deepEqual(await unavailable.revokeCredential({
    credential: CREDENTIAL,
    reason: "logout",
    now: NOW,
  }), { kind: "unavailable" });
});

test("approved staging runtime delegates exactly one durable resolve without exposing authority internals", async () => {
  const calls: unknown[] = [];
  const runtime = createApprovedStagingServerPanelAccessRuntime({
    async resolveSession(input) {
      calls.push(input);
      return { kind: "unauthenticated" };
    },
    async rotateSession(input) { calls.push(input); return { kind: "unauthenticated" }; },
    async recoverOperation(input) { calls.push(input); return { kind: "operation_mismatch" }; },
    async revokePrincipalSessions(input) { calls.push(input); return { kind: "unauthenticated" }; },
  }, PANEL_ORIGIN);
  assert.equal(runtime.readiness.mode, "approved_staging");
  assert.equal(runtime.panelOrigin, PANEL_ORIGIN);
  assert.deepEqual(Object.keys(runtime).sort(), [
    "panelOrigin", "readiness", "resolveCredential", "revokeCredential", "rotateCredential",
  ]);
  assert.deepEqual(await runtime.resolveCredential({
    credential: CREDENTIAL,
    requestId: "request-approved",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await runtime.rotateCredential({
    currentCredential: CREDENTIAL,
    operationId: OPERATION_ID,
    requestedStoreId: STORE_ID,
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.deepEqual(await runtime.revokeCredential({
    credential: CREDENTIAL,
    reason: "logout",
    now: NOW,
  }), { kind: "unauthenticated" });
  assert.equal(calls.length, 3);
  for (const forbidden of ["pool", "keys", "database", "repository", "authority", "tokenDigest"]) {
    assert.equal(forbidden in runtime, false);
  }
});

test("binds an authenticated session to the exact active admin request hostname", async () => {
  const runtime = createApprovedStagingServerPanelAccessRuntime({
    async resolveSession() {
      return { kind: "resolved" as const, session: {
        sessionId: "session", familyId: "family", principalId: "principal", activeStoreId: "store", version: 1,
        issuedAt: NOW.toISOString(), rotatedAt: NOW.toISOString(), expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
      }, tenantContext: {
        schemaVersion: 1 as const,
        requestId: "request-custom",
        principal: { id: "principal", issuer: "issuer", subject: "subject", email: "owner@example.test", emailVerified: true },
        store: { id: "store", name: "Store A", slug: "store-a", locale: "tr-TR", currency: "TRY", status: "active" as const, themeKey: "starter" },
        membership: { schemaVersion: 1 as const, id: "membership", principalId: "principal", storeId: "store", role: "store_owner" as const, status: "active" as const, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() },
        entitlements: { schemaVersion: 1 as const, planId: "plan", planCode: "starter", version: 1, status: "active" as const, features: [], limits: { products: 0, staff: 0, storageBytes: 0 }, validFrom: NOW.toISOString() },
        locale: "tr-TR",
      } };
    },
    async rotateSession() { return { kind: "unavailable" as const }; },
    async recoverOperation() { return { kind: "operation_mismatch" as const }; },
    async revokePrincipalSessions() { return { kind: "unavailable" as const }; },
  }, PANEL_ORIGIN, {
    async resolvePublicBrand({ hostname }) {
      return hostname === "admin.guzidekuyumcu.com.tr"
        ? { kind: "resolved" as const, brand: { storeSlug: "store-a", displayName: "Store A", logoUrl: null, accentColor: null, canonicalAdminOrigin: "https://admin.guzidekuyumcu.com.tr" } }
        : { kind: "admin_host_unknown" as const };
    },
  });
  assert.equal((await runtime.resolveCredential({ credential: CREDENTIAL, requestId: "request-custom", now: NOW, hostname: "admin.guzidekuyumcu.com.tr" })).kind, "authenticated");
  assert.equal((await runtime.resolveCredential({ credential: CREDENTIAL, requestId: "request-cross", now: NOW, hostname: "other.admin.example.test" })).kind, "unauthorized");
  assert.equal((await runtime.resolveCredential({ credential: CREDENTIAL, requestId: "request-central", now: NOW, hostname: "staging-panel.celebix.site" })).kind, "unauthorized");
});
