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

test("full migration retains native variants, measurements and source metadata in the durable batch", async () => {
  const metadata = { provider: "qukasoft", rawXml: "<product id=\"30794\"/>", fields: { id: "30794" }, attributes: [], variants: [], weightCandidates: [], issues: [] };
  const variants = [
    { title: "12", priceCents: 100, stockQuantity: 2, attributes: { Ölçü: "12" }, measurements: { weight: { valueMilli: 2350, unit: "g" } } },
    { title: "14", priceCents: 120, stockQuantity: 3, attributes: { Ölçü: "14" } },
  ];
  let submitted: unknown;
  const api: WooCommerceMigrationApi = {
    async begin() { return job(); },
    async batch(_id, value) { submitted = value.products[0]; return { ...job({ importedProducts: 1, status: "media_processing" }), mappings: [{ sourceProductId: "30794", productId: "57000000-0000-4000-8000-000000000002" }] }; },
    async media() {},
    async status() { return job({ importedProducts: 1, status: "completed", committedMedia: 2 }); },
  };
  await runWooCommerceMigration({ ...manifest, products: [{ ...manifest.products[0]!, variants, sourceMetadata: metadata }] } as never, api, () => crypto.randomUUID());
  assert.deepEqual(submitted, {
    sourceProductId: "30794", title: "Yüzük", slug: "yuzuk", status: "active", categorySlugs: ["yuzukler"], brandSlugs: [],
    variant: variants[0], additionalVariants: [variants[1]], sourceMetadata: metadata,
    sourceImageDigests: ["292bc0095ddca43beabb6ca5cdcddae9a3d369925b1f57a9e8c847c661811829", "a034c187aefb9963d1faba0e903a36d10e5e618f4387ceb0146a910b977a0742"],
  });
});

test("parallel media workers keep each product's source image order", async () => {
  const selected = { ...manifest, products: [manifest.products[0]!, { ...manifest.products[0]!, sourceProductId: "30795", slug: "yuzuk-2" }], batches: [["30794", "30795"]], mediaCount: 4 };
  const calls: string[] = [];
  let releaseFirst!: () => void;
  const first = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const api: WooCommerceMigrationApi = {
    async begin() { return job({ totalProducts: 2, totalMedia: 4, importedProducts: 2, status: "media_processing" }); },
    async batch() { throw new Error("already imported"); },
    async media(_job, item) {
      calls.push(`${item.sourceProductId}:${item.ordinal}`);
      if (item.sourceProductId === "30794" && item.ordinal === 0) await first;
      if (item.sourceProductId === "30795" && item.ordinal === 0) releaseFirst();
    },
    async status() { return job({ totalProducts: 2, totalMedia: 4, importedProducts: 2, committedMedia: 4, status: "completed" }); },
  };
  await runWooCommerceMigration(selected, api, () => crypto.randomUUID());
  assert.deepEqual(calls.slice(0, 2), ["30794:0", "30795:0"]);
  assert.equal(calls.indexOf("30794:1") > calls.indexOf("30795:0"), true);
});
