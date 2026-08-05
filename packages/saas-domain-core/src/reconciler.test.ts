import assert from "node:assert/strict";
import test from "node:test";

import {
  CloudflareCustomHostnameError,
  createStoreDomainReconciler,
  type StoreDomainWorkflowPersistence,
} from "./index.ts";

const NOW = new Date("2026-08-05T12:00:00.000Z");
const CLAIM = Object.freeze({
  domainId: "77777777-7777-4777-8777-777777777777", storeId: "33333333-3333-4333-8333-333333333333",
  hostname: "www.example.com", providerHostnameId: "cf-host-1", attemptCount: 1,
  leaseId: "99999999-9999-4999-8999-999999999999", leaseOwner: "domain-worker-1",
  leaseExpiresAt: "2026-08-05T12:00:30.000Z", requestedRemoval: false,
});

function workflow(overrides: Partial<StoreDomainWorkflowPersistence> = {}): StoreDomainWorkflowPersistence {
  return { async claim() { return [CLAIM]; }, async complete() {}, async fail() {}, ...overrides };
}

test("marks one hostname ready only when provider DNS and exact-host health all agree", async () => {
  let completed: unknown;
  const reconciler = createStoreDomainReconciler({
    workflow: workflow({ async complete(input) { completed = input; } }),
    provider: { async create() { throw new Error("unused"); }, async find() { return null; }, async remove() { return { deleted: true }; }, async get() { return { providerHostnameId: "cf-host-1", hostname: "www.example.com", hostnameStatus: "active", sslStatus: "active", ownershipValidation: null, certificateValidation: [] }; } },
    resolveCname: async () => ["shops.celebix.site"],
    fetch: async () => new Response(JSON.stringify({ schemaVersion: 1, status: "ok", storeId: CLAIM.storeId, hostname: CLAIM.hostname }), { status: 200, headers: { "content-type": "application/json" } }),
    workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
  });
  assert.equal(await reconciler.runOnce(), "updated");
  assert.deepEqual(completed, {
    domainId: CLAIM.domainId, leaseId: CLAIM.leaseId, workerId: "domain-worker-1", now: NOW,
    hostnameStatus: "active", sslStatus: "active", dnsStatus: "ready", originStatus: "ready",
    safeProviderErrorCode: null, nextCheckAt: new Date("2026-08-05T13:00:00.000Z"),
  });
});

test("schedules the fixed bounded retry for transient provider failure", async () => {
  let failed: unknown;
  const reconciler = createStoreDomainReconciler({
    workflow: workflow({ async fail(input) { failed = input; } }),
    provider: { async create() { throw new Error("unused"); }, async find() { return null; }, async remove() { return { deleted: true }; }, async get() { throw new CloudflareCustomHostnameError("rate_limited", true); } },
    resolveCname: async () => [], fetch: async () => new Response(), workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
  });
  assert.equal(await reconciler.runOnce(), "retry_scheduled");
  assert.deepEqual(failed, { domainId: CLAIM.domainId, leaseId: CLAIM.leaseId, workerId: "domain-worker-1", now: NOW, errorCode: "provider_rate_limited", retryAt: new Date("2026-08-05T12:00:30.000Z"), terminal: false });
});

test("treats provider not-found during requested removal as successful deletion", async () => {
  let completed: unknown;
  const removed = Object.freeze({ ...CLAIM, requestedRemoval: true, attemptCount: 7 });
  const reconciler = createStoreDomainReconciler({
    workflow: workflow({ async claim() { return [removed]; }, async complete(input) { completed = input; } }),
    provider: { async create() { throw new Error("unused"); }, async get() { throw new Error("unused"); }, async find() { return null; }, async remove() { throw new CloudflareCustomHostnameError("not_found"); } },
    resolveCname: async () => [], fetch: async () => new Response(), workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
  });
  assert.equal(await reconciler.runOnce(), "updated");
  assert.deepEqual(completed, {
    domainId: CLAIM.domainId, leaseId: CLAIM.leaseId, workerId: "domain-worker-1", now: NOW,
    hostnameStatus: "deleted", sslStatus: "deleted", dnsStatus: "pending", originStatus: "pending",
    safeProviderErrorCode: null, nextCheckAt: new Date("2026-08-05T13:00:00.000Z"),
  });
});

test("an empty or unavailable claim performs zero provider calls", async () => {
  let providerCalls = 0;
  const provider = { async create() { providerCalls += 1; throw new Error(); }, async get() { providerCalls += 1; throw new Error(); }, async find() { providerCalls += 1; return null; }, async remove() { providerCalls += 1; return { deleted: true as const }; } };
  const empty = createStoreDomainReconciler({ workflow: workflow({ async claim() { return []; } }), provider, resolveCname: async () => [], fetch: async () => new Response(), workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW });
  assert.equal(await empty.runOnce(), "empty");
  const stale = createStoreDomainReconciler({ workflow: workflow({ async claim() { throw new Error("stale"); } }), provider, resolveCname: async () => [], fetch: async () => new Response(), workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW });
  assert.equal(await stale.runOnce(), "failed");
  assert.equal(providerCalls, 0);
});
