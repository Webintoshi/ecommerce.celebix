import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import type { AnalyticsOutboxClaim, AnalyticsOutboxRepository } from "@celebix/saas-data";
import { deliverAnalyticsOutbox } from "./delivery.ts";

const WEBSITE = "50000000-0000-4000-8000-000000000001";
const HOSTNAME = "shop.example.test";
const NOW = new Date("2026-07-26T12:00:00.000Z");
const UMAMI_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) CelebixEvents/1.0 Safari/537.36";
const COLLECTOR = Object.freeze({ mode: "approved_staging" as const, trackerScriptUrl: "https://analytics.example.test/script.js", collectorOrigin: "https://analytics.example.test" });

function purchaseClaim(index = 1, attemptCount = 1): AnalyticsOutboxClaim {
  return Object.freeze({ eventId: `90000000-0000-4000-8000-${String(index).padStart(12, "0")}`, leaseToken: String(index).repeat(64).slice(0, 64), websiteId: WEBSITE, hostname: HOSTNAME, attemptCount, payload: Object.freeze({ name: "purchase", valueCents: 12_900, currency: "TRY", source: "quick_link" as const }) });
}

function lifecycleClaim(): AnalyticsOutboxClaim {
  return Object.freeze({ eventId: "90000000-0000-4000-8000-000000000099", leaseToken: "f".repeat(64), websiteId: WEBSITE, hostname: HOSTNAME, attemptCount: 1, payload: Object.freeze({ name: "cart_abandoned", schemaVersion: 1, currency: "TRY", valueMinor: 12_900 }) });
}

function repository(claims: readonly AnalyticsOutboxClaim[]) {
  const calls = { claim: [] as unknown[], delivered: [] as unknown[], failed: [] as unknown[], requeue: [] as unknown[] };
  const value: AnalyticsOutboxRepository = {
    async claim(input) { calls.claim.push(input); return claims; },
    async delivered(input) { calls.delivered.push(input); },
    async failed(input) { calls.failed.push(input); },
    async requeue(input) { calls.requeue.push(input); },
  };
  return { calls, value };
}

function dependencies(fetch: typeof globalThis.fetch) {
  return Object.freeze({ now: () => new Date(NOW), fetch, userAgent: UMAMI_USER_AGENT, timeoutMs: 1_000 });
}

function acceptedResponse(): Response {
  return new Response(JSON.stringify({ cache: "header.payload.signature", sessionId: "70000000-0000-4000-8000-000000000001", visitId: "80000000-0000-4000-8000-000000000001" }), { status: 200, headers: { "content-type": "application/json" } });
}

test("an empty outbox is a bounded no-op", async () => {
  const repo = repository([]);
  const result = await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => { throw new Error("not called"); }));
  assert.deepEqual(result, { claimed: 0, delivered: 0, retried: 0, terminal: 0 });
  assert.deepEqual(repo.calls.claim, [{ now: NOW, limit: 25, leaseMs: 30_000 }]);
});

test("settled purchase delivery contains only approved aggregate data", async () => {
  const repo = repository([purchaseClaim()]);
  const sent: Array<{ url: unknown; init: RequestInit | undefined }> = [];
  const result = await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async (url, init) => { sent.push({ url, init }); return acceptedResponse(); }));
  assert.equal(sent[0]?.url, "https://analytics.example.test/api/send");
  assert.equal(new Headers(sent[0]?.init?.headers).get("user-agent"), UMAMI_USER_AGENT);
  assert.deepEqual(JSON.parse(String(sent[0]?.init?.body)), { type: "event", payload: { website: WEBSITE, hostname: HOSTNAME, url: "/checkout/complete", name: "purchase", data: { value: 129, currency: "TRY", source: "quick_link" } } });
  assert.deepEqual(repo.calls.delivered, [{ eventId: purchaseClaim().eventId, leaseToken: purchaseClaim().leaseToken, now: NOW }]);
  assert.deepEqual(result, { claimed: 1, delivered: 1, retried: 0, terminal: 0 });
});

test("cart lifecycle delivery preserves minor units and exposes no cart identity", async () => {
  const repo = repository([lifecycleClaim()]);
  const sent: RequestInit[] = [];
  await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async (_url, init) => { sent.push(init ?? {}); return acceptedResponse(); }));
  assert.deepEqual(JSON.parse(String(sent[0]?.body)), { type: "event", payload: { website: WEBSITE, hostname: HOSTNAME, url: "/cart", name: "cart_abandoned", data: { schema_version: 1, value_minor: 12_900, currency: "TRY" } } });
  assert.doesNotMatch(String(sent[0]?.body), /cartId|orderId|customer|email|phone|token/);
});

test("delivery concurrency never exceeds four", async () => {
  const repo = repository(Array.from({ length: 9 }, (_, index) => purchaseClaim(index + 1)));
  let active = 0; let maximum = 0;
  await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active -= 1;
    return acceptedResponse();
  }));
  assert.equal(maximum, 4);
});

test("network failure schedules bounded exponential retry without provider text", async () => {
  const repo = repository([purchaseClaim(1, 3)]);
  const result = await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => { throw new Error("secret provider response"); }));
  assert.deepEqual(repo.calls.failed, [{ eventId: purchaseClaim().eventId, leaseToken: purchaseClaim().leaseToken, now: NOW, errorCode: "collector_unavailable", retryAt: new Date("2026-07-26T12:04:00.000Z"), terminal: false }]);
  assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 1, terminal: 0 });
});

test("collector rejection and invalid success are classified without response bodies", async () => {
  const repo = repository([purchaseClaim(1), purchaseClaim(2)]);
  let call = 0;
  await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => call++ === 0 ? new Response("private provider body", { status: 503 }) : new Response(null, { status: 204 })));
  assert.deepEqual((repo.calls.failed as Array<{ errorCode: string }>).map((value) => value.errorCode), ["collector_rejected", "collector_response_invalid"]);
});

test("Umami bot-decoy success is retried instead of falsely marked delivered", async () => {
  const repo = repository([purchaseClaim()]);
  const result = await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => new Response('{"beep":"boop"}', { status: 200, headers: { "content-type": "application/json" } })));
  assert.equal(repo.calls.delivered.length, 0);
  assert.deepEqual(repo.calls.failed, [{ eventId: purchaseClaim().eventId, leaseToken: purchaseClaim().leaseToken, now: NOW, errorCode: "collector_response_invalid", retryAt: new Date("2026-07-26T12:01:00.000Z"), terminal: false }]);
  assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 1, terminal: 0 });
});

test("the tenth failed attempt is terminal", async () => {
  const repo = repository([purchaseClaim(1, 10)]);
  const result = await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => { throw new Error("offline"); }));
  assert.deepEqual(repo.calls.failed, [{ eventId: purchaseClaim().eventId, leaseToken: purchaseClaim().leaseToken, now: NOW, errorCode: "collector_unavailable", retryAt: NOW, terminal: true }]);
  assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 0, terminal: 1 });
});

test("lease loss is contained without an unfenced second mutation", async () => {
  const repo = repository([purchaseClaim()]);
  repo.value.delivered = async (input) => { repo.calls.delivered.push(input); throw Object.assign(new Error("lease"), { code: "lease_lost" }); };
  const result = await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => acceptedResponse()));
  assert.equal(repo.calls.failed.length, 0);
  assert.deepEqual(result, { claimed: 1, delivered: 0, retried: 1, terminal: 0 });
});

test("aggregate counters reflect mixed delivery outcomes", async () => {
  const repo = repository([purchaseClaim(1), purchaseClaim(2, 2), purchaseClaim(3, 10)]);
  let call = 0;
  const result = await deliverAnalyticsOutbox(repo.value, COLLECTOR, dependencies(async () => call++ === 0 ? acceptedResponse() : Promise.reject(new Error("offline"))));
  assert.deepEqual(result, { claimed: 3, delivered: 1, retried: 1, terminal: 1 });
});

test("worker source is secret-free and settlement outbox identity is replay-safe", async () => {
  const [delivery, cli, migration] = await Promise.all([
    readFile(new URL("./delivery.ts", import.meta.url), "utf8"),
    readFile(new URL("../../scripts/deliver-analytics-events.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../../owner/scripts/sql/saas/202607260039_store_analytics_authority.up.sql", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(`${delivery}\n${cli}`, /console[.]|providerBody|response[.]text|CELEBIX_UMAMI_(?:USERNAME|PASSWORD)|TenantContext|distinctId/);
  assert.match(migration, /UNIQUE \(store_id,order_id,event_kind\)/);
  assert.match(migration, /ON CONFLICT \(store_id,order_id,event_kind\) DO NOTHING/);
  assert.ok(cli.indexOf("commerce_analytics_evaluate_carts") < cli.indexOf("const collector = await parseUmamiPublicCollectorConfig"));
  assert.match(cli, /analytics_delivery_degraded/);
});
