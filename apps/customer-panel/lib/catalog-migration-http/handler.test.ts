import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { TenantContext } from "@celebix/saas-contracts";
import type { CatalogMigrationRepository } from "@celebix/saas-data";
import { createCatalogMigrationHttpHandlers, type CatalogMigrationHttpRuntime } from "./handler.ts";

const ORIGIN = "https://panel.saas-staging.celebix.site";
const OPERATION = "56000000-0000-4000-8000-000000000001";
const REQUEST = "56000000-0000-4000-8000-000000000002";
const JOB = "56000000-0000-4000-8000-000000000003";
const PRODUCT = "56000000-0000-4000-8000-000000000004";
const NOW = new Date("2026-07-28T12:00:00.000Z");
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 1).toString("base64url")}`;
const DIGEST = "a".repeat(64);
const IMAGE_URL = "https://media.example.test/uploads/yuzuk.png";
const IMAGE_DIGEST = createHash("sha256").update(IMAGE_URL).digest("hex");

function tenant(): TenantContext { return { schemaVersion: 1, requestId: REQUEST, principal: { id: "56000000-0000-4000-8000-000000000011", issuer: "https://id.test/oidc", subject: "private" }, store: { id: "56000000-0000-4000-8000-000000000012", slug: "guzide", status: "active" }, membership: { id: "56000000-0000-4000-8000-000000000013", role: "store_owner", status: "active" }, entitlements: { schemaVersion: 1, planId: "56000000-0000-4000-8000-000000000014", planCode: "pilot", version: 1, status: "active", features: ["catalog"], limits: { products: 2_000, staff: 5, storageBytes: 1_000_000_000 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext; }
function job(overrides: Record<string, unknown> = {}) { return { jobId: JOB, sourceDigest: DIGEST, status: "processing" as const, totalProducts: 1, importedProducts: 0, totalMedia: 1, committedMedia: 0, failedMedia: 0, categoryCount: 1, brandCount: 1, version: 1, updatedAt: NOW.toISOString(), replayed: false, ...overrides }; }
function repository(overrides: Partial<CatalogMigrationRepository> = {}): CatalogMigrationRepository { const reject = async () => { throw new Error("unexpected"); }; return { begin: reject, importBatch: reject, get: reject, authorizeMedia: reject, recordMedia: reject, ...overrides } as CatalogMigrationRepository; }
function runtime(migration: CatalogMigrationRepository): CatalogMigrationHttpRuntime { return { migration, upload: { async inspectOperation() { throw new Error("unexpected"); }, async upload() { throw new Error("unexpected"); } }, access: { readiness: { mode: "approved_staging" }, panelOrigin: ORIGIN, async resolveCredential() { return { kind: "authenticated", session: {}, tenantContext: tenant() } as never; }, async rotateCredential() { return { kind: "unavailable" }; }, async revokeCredential() { return { kind: "unavailable" }; } } } as CatalogMigrationHttpRuntime; }
function request(path: string, method = "POST", value?: unknown, origin = ORIGIN, headers: HeadersInit = {}) { const selected = new Headers(headers); selected.set("cookie", `__Host-celebix_panel=${CREDENTIAL}`); if (method === "POST") { selected.set("origin", origin); selected.set("content-type", "application/json"); selected.set("idempotency-key", OPERATION); } const serialized = value === undefined ? undefined : JSON.stringify(value); if (serialized) selected.set("content-length", String(Buffer.byteLength(serialized))); return new Request(`http://customer-panel:3400${path}`, { method, headers: selected, body: serialized }); }
function handlers(migration: CatalogMigrationRepository, ingest?: (...args: any[]) => Promise<any>) { return createCatalogMigrationHttpHandlers({ async resolveRuntime() { return runtime(migration); }, now: () => new Date(NOW), requestId: () => REQUEST, ...(ingest ? { ingestMedia: ingest } : {}) }); }

test("begin derives TenantContext from the genuine session and returns only durable progress", async () => {
  const calls: any[] = [];
  const response = await handlers(repository({ async begin(input) { calls.push(input); return job(); } })).begin(request("/api/catalog/admin/migrations/woocommerce", "POST", { sourceDigest: DIGEST, totalProducts: 1, totalMedia: 1, categories: [{ name: "Yüzükler", slug: "yuzukler" }], brands: [{ name: "Güzide", slug: "guzide" }] }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0].tenantContext, tenant());
  assert.equal(calls[0].operationId, OPERATION);
  assert.equal(JSON.stringify(await response.json()).includes(CREDENTIAL), false);
});

test("batch imports at most 25 compiled products without browser store authority", async () => {
  const calls: any[] = [];
  const product = { sourceProductId: "30794", title: "Altın yüzük", slug: "altin-yuzuk", status: "active", categorySlugs: ["yuzukler"], brandSlugs: ["guzide"], variant: { title: "Varsayılan", priceCents: 100, stockQuantity: 1, attributes: { "Ağırlık (g)": "2.35" } }, sourceImageDigests: [IMAGE_DIGEST] };
  const response = await handlers(repository({ async importBatch(input) { calls.push(input); return { ...job({ status: "media_processing", importedProducts: 1, version: 2 }), mappings: [{ sourceProductId: "30794", productId: PRODUCT }] } as never; } })).batch(request(`/api/catalog/admin/migrations/woocommerce/${JOB}/batch`, "POST", { sourceDigest: DIGEST, products: [product] }), { params: Promise.resolve({ jobId: JOB }) });
  assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.deepEqual(calls[0].tenantContext, tenant());
  assert.equal((await handlers(repository()).batch(request(`/api/catalog/admin/migrations/woocommerce/${JOB}/batch`, "POST", { sourceDigest: DIGEST, products: Array(26).fill(product) }), { params: Promise.resolve({ jobId: JOB }) })).status, 400);
  assert.equal((await handlers(repository()).batch(request(`/api/catalog/admin/migrations/woocommerce/${JOB}/batch`, "POST", { sourceDigest: DIGEST, products: [product], storeId: tenant().store.id }), { params: Promise.resolve({ jobId: JOB }) })).status, 400);
});

test("media ingestion receives the raw URL only after session and exact path authority and never reflects it", async () => {
  const calls: any[] = [];
  const h = handlers(repository(), async (input: any) => { calls.push(input); return { kind: "committed", productId: PRODUCT, mediaId: "56000000-0000-4000-8000-000000000005", replayed: false }; });
  const response = await h.media(request(`/api/catalog/admin/migrations/woocommerce/${JOB}/media`, "POST", { sourceProductId: "30794", ordinal: 0, sourceUrl: IMAGE_URL, altText: "Altın yüzük" }), { params: Promise.resolve({ jobId: JOB }) });
  assert.equal(response.status, 200); assert.equal(calls.length, 1); assert.deepEqual(calls[0].tenantContext, tenant());
  assert.equal(JSON.stringify(await response.json()).includes(IMAGE_URL), false);
  assert.equal((await h.media(request(`/api/catalog/admin/migrations/woocommerce/${JOB}/media`, "POST", { sourceProductId: "30794", ordinal: 0, sourceUrl: IMAGE_URL, altText: "Altın yüzük" }, "https://attacker.test"), { params: Promise.resolve({ jobId: JOB }) })).status, 403);
  assert.equal(calls.length, 1);
});

test("status reads are exact and missing session or private authority fails before repositories", async () => {
  let reads = 0; const h = handlers(repository({ async get() { reads += 1; return job(); } }));
  assert.equal((await h.status(request(`/api/catalog/admin/migrations/woocommerce/${JOB}`, "GET"), { params: Promise.resolve({ jobId: JOB }) })).status, 200);
  assert.equal((await h.status(new Request(`http://internal:3400/api/catalog/admin/migrations/woocommerce/${JOB}`), { params: Promise.resolve({ jobId: JOB }) })).status, 401);
  assert.equal((await h.status(request(`/api/catalog/admin/migrations/woocommerce/${JOB}?storeId=${tenant().store.id}`, "GET"), { params: Promise.resolve({ jobId: JOB }) })).status, 400);
  assert.equal((await h.status(request(`/api/catalog/admin/migrations/woocommerce/${JOB}`, "GET", undefined, ORIGIN, { "x-store-id": tenant().store.id }), { params: Promise.resolve({ jobId: JOB }) })).status, 400);
  assert.equal(reads, 1);
});
