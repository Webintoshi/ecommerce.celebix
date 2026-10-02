import assert from "node:assert/strict";
import test from "node:test";
import { createMeilisearchCatalogSearchIndexer, runCatalogSearchWorkerOnce, PostgresCatalogSearchJobRepository, PostgresPublicCatalogSearchScopeRepository, type CatalogSearchJob, type CatalogSearchJobRepository } from "./index.ts";
import { StorefrontContentRepositoryError } from "../storefront-content/errors.ts";
import { parseCatalogSearchDocument } from "./validation.ts";

const STORE = "33333333-3333-4333-8333-333333333333";
const PRODUCT = "71000000-0000-4000-8000-000000000001";
const OTHER = "71000000-0000-4000-8000-000000000002";
const LEASE = "72000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-10-02T12:00:00.000Z");
const DOCUMENT = { id: STORE + "_" + PRODUCT, storeId: STORE, productId: PRODUCT, title: "İnci Şarjlı Akü", searchText: "inci sarjli aku", skus: ["sku-1"], barcodes: ["123456"], slug: "aku" };
const JOB: CatalogSearchJob = { storeId: STORE, productId: PRODUCT, generation: 3, document: DOCUMENT };

test("SQL-bounded Unicode documents use character counts rather than UTF-16 units", () => {
  const document = { ...DOCUMENT, searchText: "😀".repeat(60_000) };
  assert.equal(Array.from(parseCatalogSearchDocument(document, STORE, PRODUCT).searchText).length, 60_000);
  assert.throws(() => parseCatalogSearchDocument({ ...document, searchText: "😀".repeat(100_001) }, STORE, PRODUCT), unavailable);
});
const json = (value: unknown, status = 200) => Response.json(value, { status });
const unavailable = (error: unknown) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable";
type HttpCall = { url: string; method: string; body: unknown };
function transport(handler: (call: HttpCall) => Response | Promise<Response>) {
  return (async (url: string | URL | Request, init?: RequestInit) => handler({ url: String(url), method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined })) as typeof fetch;
}
function queue(jobs: readonly CatalogSearchJob[]) {
  const acknowledgements: Parameters<CatalogSearchJobRepository["acknowledge"]>[0][] = [];
  let claimed = false;
  const repository: CatalogSearchJobRepository = {
    claim: async (input) => { assert.equal(input.leaseId, LEASE); claimed = true; return jobs; },
    acknowledge: async (input) => { acknowledgements.push(input); return input.error ? "retry" : "acknowledged"; },
  };
  return { repository, acknowledgements, wasClaimed: () => claimed };
}

test("updates and tombstones are acknowledged only after their asynchronous tasks succeed", async () => {
  const events: string[] = [];
  const calls: HttpCall[] = [];
  let taskId = 0;
  const seen = new Set<number>();
  const fixture = queue([JOB, { ...JOB, productId: OTHER, generation: 4, document: null }]);
  const originalAck = fixture.repository.acknowledge;
  fixture.repository.acknowledge = async (input) => { events.push(`ack:${input.productId}`); return originalAck(input); };
  const indexer = createMeilisearchCatalogSearchIndexer({ url: "http://meili:7700", apiKey: "write-key", taskPollMs: 1, fetch: transport((call) => {
    calls.push(call);
    if (call.url.endsWith("/indexes/celebix_products_v1") && call.method === "GET") return json({ code: "index_not_found" }, 404);
    if (call.url.includes("/tasks/")) {
      const uid = Number(call.url.split("/").at(-1));
      if (!seen.has(uid)) { seen.add(uid); return json({ uid, indexUid: "celebix_products_v1", status: "processing" }); }
      events.push(`success:${uid}`);
      return json({ uid, indexUid: "celebix_products_v1", status: "succeeded" });
    }
    return json({ taskUid: ++taskId }, 202);
  }) });
  const result = await runCatalogSearchWorkerOnce({ repository: fixture.repository, indexer, now: () => NOW, leaseId: LEASE, limit: 20 });
  assert.deepEqual(result, { claimed: 2, acknowledged: 2, retried: 0, stale: 0 });
  assert.ok(events.indexOf("success:3") < events.indexOf(`ack:${PRODUCT}`));
  assert.ok(events.indexOf("success:4") < events.indexOf(`ack:${OTHER}`));
  assert.deepEqual(fixture.acknowledgements.map(({ generation, error }) => ({ generation, error })), [{ generation: 3, error: null }, { generation: 4, error: null }]);
  assert.deepEqual(calls.find((call) => call.url.endsWith("/indexes") && call.method === "POST")?.body, { uid: "celebix_products_v1", primaryKey: "id" });
  const settings = calls.find((call) => call.url.endsWith("/settings"))!.body as Record<string, unknown>;
  assert.deepEqual(settings.filterableAttributes, ["storeId", "skus", "barcodes"]);
  assert.deepEqual(settings.displayedAttributes, ["storeId", "productId"]);
  assert.deepEqual((calls.find((call) => call.url.endsWith("/documents") && call.method === "POST")!.body as unknown[])[0], DOCUMENT);
  assert.ok(calls.some((call) => call.method === "DELETE" && call.url.endsWith(`/documents/${STORE}_${OTHER}`)));
  assert.equal(JSON.stringify(calls).includes("priceCents"), false);
  await indexer.ensureReady();
  assert.equal(calls.filter((call) => call.url.endsWith("/settings")).length, 1);
});

test("failed, canceled, wrong-task and never-terminal tasks retain work for retry", async () => {
  for (const mode of ["failed", "canceled", "wrong-task", "timeout"]) {
    const fixture = queue([JOB]);
    let taskId = 0;
    const indexer = createMeilisearchCatalogSearchIndexer({ url: "http://meili:7700", apiKey: "write-key", taskTimeoutMs: 20, taskPollMs: 1, fetch: transport(({ url, method }) => {
      if (url.endsWith("/indexes/celebix_products_v1") && method === "GET") return json({ uid: "celebix_products_v1", primaryKey: "id" });
      if (url.includes("/tasks/")) {
        const uid = Number(url.split("/").at(-1));
        return json({ uid: mode === "wrong-task" && uid === 2 ? 55 : uid, indexUid: "celebix_products_v1", status: uid === 1 ? "succeeded" : mode === "timeout" ? "processing" : mode, error: { code: "secret-provider-data" } });
      }
      return json({ taskUid: ++taskId }, 202);
    }) });
    const result = await runCatalogSearchWorkerOnce({ repository: fixture.repository, indexer, now: () => NOW, leaseId: LEASE });
    assert.deepEqual(result, { claimed: 1, acknowledged: 0, retried: 1, stale: 0 });
    assert.equal(fixture.acknowledgements[0]?.error, "catalog_search_indexing_failed");
  }
});

test("index settings failure leaves all jobs unclaimed and later startup can retry", async () => {
  const fixture = queue([JOB]);
  let fail = true;
  const indexer = createMeilisearchCatalogSearchIndexer({ url: "http://meili:7700", apiKey: "write-key", fetch: transport(({ url }) => {
    if (url.endsWith("/indexes/celebix_products_v1")) return json({ uid: "celebix_products_v1", primaryKey: "id" });
    if (url.includes("/tasks/")) return json({ uid: 1, indexUid: "celebix_products_v1", status: fail ? "failed" : "succeeded" });
    return json({ taskUid: 1 }, 202);
  }) });
  await assert.rejects(runCatalogSearchWorkerOnce({ repository: fixture.repository, indexer, now: () => NOW, leaseId: LEASE }), unavailable);
  assert.equal(fixture.wasClaimed(), false);
  assert.equal(fixture.acknowledgements.length, 0);
  fail = false;
  await indexer.ensureReady();
});

test("a vanished index during document submission clears readiness and is recreated on the next worker pass", async () => {
  const calls: HttpCall[] = [];
  let missing = false;
  let lostOnce = false;
  let taskId = 0;
  const fixture = queue([JOB]);
  const indexer = createMeilisearchCatalogSearchIndexer({ url: "http://meili:7700", apiKey: "write-key", fetch: transport((call) => {
    calls.push(call);
    if (call.url.endsWith("/indexes/celebix_products_v1") && call.method === "GET") return missing ? json({ code: "index_not_found" }, 404) : json({ uid: "celebix_products_v1", primaryKey: "id" });
    if (call.url.endsWith("/documents") && !lostOnce) { missing = true; lostOnce = true; return json({ code: "index_not_found" }, 404); }
    if (call.url.endsWith("/indexes") && call.method === "POST") missing = false;
    if (call.url.includes("/tasks/")) return json({ uid: Number(call.url.split("/").at(-1)), indexUid: "celebix_products_v1", status: "succeeded" });
    return json({ taskUid: ++taskId }, 202);
  }) });
  assert.equal((await runCatalogSearchWorkerOnce({ repository: fixture.repository, indexer, leaseId: LEASE, now: () => NOW })).retried, 1);
  assert.equal((await runCatalogSearchWorkerOnce({ repository: fixture.repository, indexer, leaseId: LEASE, now: () => NOW })).acknowledged, 1);
  assert.equal(calls.filter((call) => call.url.endsWith("/indexes") && call.method === "POST").length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith("/settings")).length, 2);
});

test("new index creation queues a full resync after successful settings and retries a failed resync hook", async () => {
  const events: string[] = [];
  let created = false;
  let taskId = 0;
  let callbackCalls = 0;
  const indexer = createMeilisearchCatalogSearchIndexer({ url: "http://meili:7700", apiKey: "write-key", onIndexCreated: async () => {
    events.push("full-resync");
    if (++callbackCalls === 1) throw new Error("database temporarily unavailable");
  }, fetch: transport(({ url, method }) => {
    if (url.endsWith("/indexes/celebix_products_v1") && method === "GET") return created ? json({ uid: "celebix_products_v1", primaryKey: "id" }) : json({ code: "index_not_found" }, 404);
    if (url.endsWith("/indexes") && method === "POST") { created = true; events.push("create"); }
    if (url.includes("/tasks/")) { events.push(`task-success:${url.split("/").at(-1)}`); return json({ uid: Number(url.split("/").at(-1)), indexUid: "celebix_products_v1", status: "succeeded" }); }
    return json({ taskUid: ++taskId }, 202);
  }) });
  await assert.rejects(indexer.ensureReady(), unavailable);
  await Promise.all([indexer.ensureReady(), indexer.ensureReady()]);
  await indexer.ensureReady();
  assert.equal(callbackCalls, 2);
  assert.equal(events.filter((event) => event === "create").length, 1);
  assert.ok(events.indexOf("task-success:2") < events.indexOf("full-resync"));
});

test("a recreated index queues every product before the worker claims its next batch", async () => {
  let missing = false;
  let loseOnce = true;
  let taskId = 0;
  const events: string[] = [];
  const fixture = queue([JOB]);
  const originalClaim = fixture.repository.claim;
  fixture.repository.claim = async (input) => { events.push("claim"); return originalClaim(input); };
  const indexer = createMeilisearchCatalogSearchIndexer({ url: "http://meili:7700", apiKey: "write-key", onIndexCreated: async () => { events.push("requeue-all"); }, fetch: transport(({ url, method }) => {
    if (url.endsWith("/indexes/celebix_products_v1") && method === "GET") return missing ? json({ code: "index_not_found" }, 404) : json({ uid: "celebix_products_v1", primaryKey: "id" });
    if (url.endsWith("/documents") && loseOnce) { loseOnce = false; missing = true; return json({ code: "index_not_found" }, 404); }
    if (url.endsWith("/indexes") && method === "POST") missing = false;
    if (url.includes("/tasks/")) return json({ uid: Number(url.split("/").at(-1)), indexUid: "celebix_products_v1", status: "succeeded" });
    return json({ taskUid: ++taskId }, 202);
  }) });
  await runCatalogSearchWorkerOnce({ repository: fixture.repository, indexer, leaseId: LEASE, now: () => NOW });
  await runCatalogSearchWorkerOnce({ repository: fixture.repository, indexer, leaseId: LEASE, now: () => NOW });
  assert.deepEqual(events, ["claim", "requeue-all", "claim"]);
});

test("the indexer rejects cross-store documents and waits once for concurrent bootstrap", async () => {
  let settingsCalls = 0;
  const indexer = createMeilisearchCatalogSearchIndexer({ url: "http://meili:7700", apiKey: "write-key", fetch: transport(({ url }) => {
    if (url.endsWith("/indexes/celebix_products_v1")) return json({ uid: "celebix_products_v1", primaryKey: "id" });
    if (url.includes("/tasks/")) return json({ uid: 1, indexUid: "celebix_products_v1", status: "succeeded" });
    settingsCalls++; return json({ taskUid: 1 }, 202);
  }) });
  await Promise.all([indexer.ensureReady(), indexer.ensureReady()]);
  assert.equal(settingsCalls, 1);
  await assert.rejects(indexer.apply({ ...JOB, document: { ...DOCUMENT, productId: OTHER } }), unavailable);
});

test("worker claims are bounded and generation-safe acknowledgement outcomes are counted", async () => {
  let claimed = 0;
  const repository: CatalogSearchJobRepository = { claim: async () => { claimed++; return [JOB]; }, acknowledge: async () => "stale" };
  const indexer = { ensureReady: async () => {}, apply: async () => {} };
  await assert.rejects(runCatalogSearchWorkerOnce({ repository, indexer, leaseId: LEASE, limit: 101 }), unavailable);
  assert.equal(claimed, 0);
  assert.deepEqual(await runCatalogSearchWorkerOnce({ repository, indexer, leaseId: LEASE, now: () => NOW, limit: 1 }), { claimed: 1, acknowledged: 0, retried: 0, stale: 1 });
});

type Row = Record<string, unknown>;
class Client {
  readonly calls: { text: string; values: unknown[] }[] = [];
  readonly releases: unknown[] = [];
  constructor(private readonly responder: (text: string, values: unknown[]) => Row[]) {}
  async query(text: string, values: unknown[] = []) {
    this.calls.push({ text, values }); const rows = this.responder(text, values);
    return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] };
  }
  release(value?: unknown) { this.releases.push(value); }
}
const timeouts = { poolCheckoutMs: 100, statementMs: 500, lockMs: 300, idleTransactionMs: 700 };

test("PostgreSQL scope resolves hostname in the host role; claims and ack use explicit workflow transactions", async () => {
  const reader = new Client((text) => text.includes("public_catalog_search_scope") ? [{ outcome: "found", result_payload: { storeId: STORE, pending: false } }] : []);
  const scope = new PostgresPublicCatalogSearchScopeRepository({ pool: { connect: async () => reader }, role: "celebix_saas_host_resolver", timeouts });
  assert.deepEqual(await scope.resolve({ hostname: "shop.example.test", now: NOW }), { storeId: STORE, pending: false });
  assert.equal(reader.calls[0]?.text, "BEGIN READ ONLY");
  assert.ok(reader.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_host_resolver"));
  assert.deepEqual(reader.calls.find(({ text }) => text.includes("public_catalog_search_scope"))?.values, ["shop.example.test", NOW]);
  const writer = new Client((text) => text.includes("catalog_search_claim") ? [{ outcome: "claimed", result_payload: [JOB] }] : text.includes("catalog_search_ack") ? [{ outcome: "stale", result_payload: {} }] : []);
  const jobs = new PostgresCatalogSearchJobRepository({ pool: { connect: async () => writer }, role: "celebix_saas_workflow", timeouts });
  assert.deepEqual(await jobs.claim({ now: NOW, limit: 20, leaseId: LEASE }), [JOB]);
  assert.equal(await jobs.acknowledge({ now: NOW, leaseId: LEASE, storeId: STORE, productId: PRODUCT, generation: 3, error: null }), "stale");
  assert.ok(writer.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_workflow"));
  assert.equal(writer.calls.filter(({ text }) => text === "BEGIN ISOLATION LEVEL READ COMMITTED").length, 2);
  assert.deepEqual(writer.calls.find(({ text }) => text.includes("catalog_search_ack"))?.values, [LEASE, STORE, PRODUCT, 3, NOW, null]);
});

test("corrupt claim payload rolls back without acknowledging or exposing provider secrets", async () => {
  const client = new Client((text) => text.includes("catalog_search_claim") ? [{ outcome: "claimed", result_payload: [{ ...JOB, document: { ...DOCUMENT, storeId: OTHER } }] }] : []);
  const jobs = new PostgresCatalogSearchJobRepository({ pool: { connect: async () => client }, role: "celebix_saas_workflow", timeouts });
  await assert.rejects(jobs.claim({ now: NOW, limit: 20, leaseId: LEASE }), unavailable);
  assert.ok(client.calls.some(({ text }) => text === "ROLLBACK"));
  assert.equal(client.calls.some(({ text }) => text.includes("catalog_search_ack")), false);
});

test("full-index resync uses a committed workflow transaction and validates the queued count", async () => {
  const writer = new Client((text) => text.includes("catalog_search_requeue_all") ? [{ outcome: "requeued", result_payload: { queued: 8 } }] : []);
  const jobs = new PostgresCatalogSearchJobRepository({ pool: { connect: async () => writer }, role: "celebix_saas_workflow", timeouts });
  assert.deepEqual(await jobs.requeueAll({ now: NOW }), { queued: 8 });
  assert.deepEqual(writer.calls.find(({ text }) => text.includes("catalog_search_requeue_all"))?.values, [NOW]);
  assert.ok(writer.calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_workflow"));
  assert.ok(writer.calls.some(({ text }) => text === "COMMIT"));
});
