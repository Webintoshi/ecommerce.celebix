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
  return { async claim() { return [CLAIM]; }, async complete() {}, async defer() {}, async fail() {}, ...overrides };
}

function activeProvider(hostname: string = CLAIM.hostname) {
  return {
    async create() { throw new Error("unused"); },
    async find() { return null; },
    async remove() { return { deleted: true as const }; },
    async get() { return { providerHostnameId: "cf-host-1", hostname, hostnameStatus: "active" as const, sslStatus: "active" as const, ownershipValidation: null, certificateValidation: [] }; },
  };
}

function health(claim: Readonly<{ storeId: string; hostname: string }>, overrides: Partial<{ storeId: string; hostname: string }> = {}) {
  return new Response(JSON.stringify({ schemaVersion: 1, status: "ok", storeId: overrides.storeId ?? claim.storeId, hostname: overrides.hostname ?? claim.hostname }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
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

test("accepts exact-host health when dependency telemetry extends the response", async () => {
  let completed: Parameters<StoreDomainWorkflowPersistence["complete"]>[0] | undefined;
  const reconciler = createStoreDomainReconciler({
    workflow: workflow({ async complete(input) { completed = input; } }),
    provider: activeProvider(),
    resolveCname: async () => ["shops.celebix.site"],
    fetch: async () => new Response(JSON.stringify({
      schemaVersion: 1,
      status: "ok",
      storeId: CLAIM.storeId,
      hostname: CLAIM.hostname,
      dependencies: { redisCache: { required: false, status: "ready", metrics: {} } },
    }), { status: 200, headers: { "content-type": "application/json" } }),
    workerId: "domain-worker-1",
    cnameTarget: "shops.celebix.site",
    now: () => NOW,
  });

  assert.equal(await reconciler.runOnce(), "updated");
  assert.equal(completed?.dnsStatus, "ready");
  assert.equal(completed?.originStatus, "ready");
  assert.equal(completed?.safeProviderErrorCode, null);
});

test("marks an apex hostname ready when Cloudflare flattening hides the CNAME but provider TLS and exact tenant health agree", async () => {
  const apex = Object.freeze({ ...CLAIM, hostname: "example.com" });
  let completed: Parameters<StoreDomainWorkflowPersistence["complete"]>[0] | undefined;
  const noCname = Object.assign(new Error("queryCname ENODATA example.com"), { code: "ENODATA" });
  const reconciler = createStoreDomainReconciler({
    workflow: workflow({ async claim() { return [apex]; }, async complete(input) { completed = input; } }),
    provider: activeProvider(apex.hostname), resolveCname: async () => { throw noCname; }, fetch: async () => health(apex),
    workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
  });
  assert.equal(await reconciler.runOnce(), "updated");
  assert.equal(completed?.dnsStatus, "ready");
  assert.equal(completed?.originStatus, "ready");
  assert.equal(completed?.safeProviderErrorCode, null);
});

test("keeps a flattened apex fail-closed when health resolves the wrong tenant or fallback hostname", async () => {
  const apex = Object.freeze({ ...CLAIM, hostname: "example.com" });
  const noCname = Object.assign(new Error("queryCname ENODATA example.com"), { code: "ENODATA" });
  for (const response of [health(apex, { storeId: "44444444-4444-4444-8444-444444444444" }), health(apex, { hostname: "fallback.celebix.site" })]) {
    let completed: Parameters<StoreDomainWorkflowPersistence["complete"]>[0] | undefined;
    const reconciler = createStoreDomainReconciler({
      workflow: workflow({ async claim() { return [apex]; }, async complete(input) { completed = input; } }),
      provider: activeProvider(apex.hostname), resolveCname: async () => { throw noCname; }, fetch: async () => response,
      workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
    });
    assert.equal(await reconciler.runOnce(), "updated");
    assert.equal(completed?.dnsStatus, "pending");
    assert.equal(completed?.originStatus, "failed");
  }
});

test("does not use HTTPS alone to bypass subdomain CNAME provider or TLS readiness", async () => {
  const noCname = Object.assign(new Error("queryCname ENODATA www.example.com"), { code: "ENODATA" });
  const snapshots = [
    { hostnameStatus: "active" as const, sslStatus: "active" as const, expectedDns: "pending", expectedOrigin: "pending" },
    { hostnameStatus: "pending" as const, sslStatus: "active" as const, expectedDns: "ready", expectedOrigin: "pending" },
    { hostnameStatus: "active" as const, sslStatus: "pending" as const, expectedDns: "ready", expectedOrigin: "pending" },
  ];
  for (const snapshot of snapshots) {
    let fetchCalls = 0;
    let completed: Parameters<StoreDomainWorkflowPersistence["complete"]>[0] | undefined;
    const reconciler = createStoreDomainReconciler({
      workflow: workflow({ async complete(input) { completed = input; } }),
      provider: { ...activeProvider(), async get() { return { providerHostnameId: "cf-host-1", hostname: CLAIM.hostname, hostnameStatus: snapshot.hostnameStatus, sslStatus: snapshot.sslStatus, ownershipValidation: null, certificateValidation: [] }; } },
      resolveCname: snapshot.expectedDns === "ready" ? async () => ["shops.celebix.site"] : async () => { throw noCname; },
      fetch: async () => { fetchCalls += 1; return health(CLAIM); }, workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
    });
    assert.equal(await reconciler.runOnce(), "updated");
    assert.equal(completed?.dnsStatus, snapshot.expectedDns);
    assert.equal(completed?.originStatus, snapshot.expectedOrigin);
    assert.equal(fetchCalls, 0);
  }
});

test("maps terminal hostname and SSL provider snapshots to action-required persistence metadata", async () => {
  const dnsUnavailable = Object.assign(new Error("queryCname EAI_AGAIN www.example.com"), { code: "EAI_AGAIN" });
  for (const snapshot of [
    { hostnameStatus: "failed" as const, sslStatus: "active" as const, code: "provider_hostname_failed" },
    { hostnameStatus: "active" as const, sslStatus: "failed" as const, code: "provider_ssl_failed" },
  ]) {
    let completed: Parameters<StoreDomainWorkflowPersistence["complete"]>[0] | undefined;
    const reconciler = createStoreDomainReconciler({
      workflow: workflow({ async complete(input) { completed = input; } }),
      provider: { ...activeProvider(), async get() { return { providerHostnameId: "cf-host-1", hostname: CLAIM.hostname, hostnameStatus: snapshot.hostnameStatus, sslStatus: snapshot.sslStatus, ownershipValidation: null, certificateValidation: [] }; } },
      resolveCname: async () => { throw dnsUnavailable; }, fetch: async () => health(CLAIM), workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
    });
    assert.equal(await reconciler.runOnce(), "updated");
    assert.equal(completed?.safeProviderErrorCode, snapshot.code);
  }
});

test("preserves verified readiness and defers with bounded backoff after a transient DNS lookup failure", async () => {
  let completed = 0;
  let failed = 0;
  let deferred: Parameters<StoreDomainWorkflowPersistence["defer"]>[0] | undefined;
  const unavailable = Object.assign(new Error("queryCname EAI_AGAIN www.example.com"), { code: "EAI_AGAIN" });
  const reconciler = createStoreDomainReconciler({
    workflow: workflow({ async complete() { completed += 1; }, async defer(input) { deferred = input; }, async fail() { failed += 1; } }),
    provider: activeProvider(), resolveCname: async () => { throw unavailable; }, fetch: async () => health(CLAIM),
    workerId: "domain-worker-1", cnameTarget: "shops.celebix.site", now: () => NOW,
  });
  assert.equal(await reconciler.runOnce(), "retry_scheduled");
  assert.equal(completed, 0);
  assert.equal(failed, 0);
  assert.deepEqual(deferred, {
    domainId: CLAIM.domainId, leaseId: CLAIM.leaseId, workerId: "domain-worker-1", now: NOW,
    retryAt: new Date("2026-08-05T12:00:30.000Z"),
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
