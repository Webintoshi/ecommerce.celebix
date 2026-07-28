import assert from "node:assert/strict";
import test from "node:test";
import { runWooCommerceMigration, type WooCommerceMigrationApi } from "./workflow.ts";

const JOB = "57000000-0000-4000-8000-000000000001";
const manifest = Object.freeze({
  sourceDigest: "a".repeat(64), categories: Object.freeze([{ name: "Yüzükler", slug: "yuzukler" }]), brands: Object.freeze([]), mediaCount: 2,
  warningCounts: Object.freeze({ availabilityStockMapped: 1, descriptionSanitized: 0, duplicateImagesRemoved: 0, missingImage: 0, missingPriceDrafted: 0 }),
  batches: Object.freeze([Object.freeze(["30794"])]),
  products: Object.freeze([{ sourceProductId: "30794", title: "Yüzük", slug: "yuzuk", status: "active" as const, categorySlugs: Object.freeze(["yuzukler"]), brandSlugs: Object.freeze([]), variants: Object.freeze([{ title: "Varsayılan" as const, priceCents: 100, stockQuantity: 1, attributes: Object.freeze({}) }]), sourceImages: Object.freeze(["https://media.example.test/a.png", "https://media.example.test/b.png"]) }]),
});
function job(overrides: Record<string, unknown> = {}) { return { jobId: JOB, sourceDigest: manifest.sourceDigest, status: "processing" as const, totalProducts: 1, importedProducts: 0, totalMedia: 2, committedMedia: 0, failedMedia: 0, categoryCount: 1, brandCount: 0, version: 1, updatedAt: "2026-07-28T12:00:00.000Z", replayed: false, ...overrides }; }

test("imports product batches before two-worker media ingestion and reports durable progress", async () => {
  const calls: string[] = []; let media = 0;
  const api: WooCommerceMigrationApi = {
    async begin() { calls.push("begin"); return job(); },
    async batch(_jobId, value) { calls.push(`batch:${value.products.length}`); return { ...job({ status: "media_processing", importedProducts: 1, version: 2 }), mappings: [{ sourceProductId: "30794", productId: "57000000-0000-4000-8000-000000000002" }] }; },
    async media(_jobId, value) { calls.push(`media:${value.ordinal}`); media += 1; return { kind: "committed", productId: "57000000-0000-4000-8000-000000000002", mediaId: `57000000-0000-4000-8000-00000000000${media + 2}`, replayed: false }; },
    async status() { calls.push("status"); return job({ status: "completed", importedProducts: 1, committedMedia: 2, version: 4 }); },
  };
  const result = await runWooCommerceMigration(manifest, api, () => crypto.randomUUID());
  assert.deepEqual(calls, ["begin", "batch:1", "media:0", "media:1", "status"]);
  assert.equal(result.status, "completed"); assert.equal(result.committedMedia, 2);
});

test("resume skips already imported products and retries only through idempotent media authority", async () => {
  const calls: string[] = [];
  const api: WooCommerceMigrationApi = {
    async begin() { calls.push("begin"); return job({ status: "media_processing", importedProducts: 1, committedMedia: 1, version: 3 }); },
    async batch() { calls.push("batch"); throw new Error("unused"); },
    async media(_jobId, value) { calls.push(`media:${value.ordinal}`); if (value.ordinal === 1) throw new Error("failed safely"); return { kind: "committed", productId: "57000000-0000-4000-8000-000000000002", mediaId: "57000000-0000-4000-8000-000000000003", replayed: true }; },
    async status() { calls.push("status"); return job({ status: "completed_with_failures", importedProducts: 1, committedMedia: 1, failedMedia: 1, version: 4 }); },
  };
  const result = await runWooCommerceMigration(manifest, api, () => crypto.randomUUID());
  assert.deepEqual(calls, ["begin", "media:0", "media:1", "status"]);
  assert.equal(result.status, "completed_with_failures");
});
