import assert from "node:assert/strict";
import test from "node:test";

import type { CatalogOnboardingResult, CatalogProductEditorProjection } from "@celebix/saas-contracts";

import { completeProductMedia } from "./media-completion.ts";

const PRODUCT = "71000000-0000-4000-8000-000000000001";
const STORE = "33333333-3333-4333-8333-333333333333";
const VARIANT = "72000000-0000-4000-8000-000000000001";
const NOW = "2026-07-28T12:00:00.000Z";

function result(status: "draft" | "active" = "draft", mediaCount = 0): CatalogOnboardingResult {
  return {
    product: { id: PRODUCT, storeId: STORE, slug: "kupa", title: "Kupa", status, currency: "TRY", createdAt: NOW, updatedAt: NOW, version: 1 },
    variants: [{ id: VARIANT, productId: PRODUCT, storeId: STORE, title: "Standart", priceCents: 12990, stockTracking: true, stockQuantity: 0, status: "active", attributes: {}, createdAt: NOW, updatedAt: NOW, version: 1 }],
    profile: { productType: "physical", minimumPurchaseQuantity: 1, version: 1, updatedAt: NOW },
    categoryIds: [], resourceIds: { collections: [], tags: [], attributes: [], extras: [], definitions: [] }, channelIds: [], mediaCount, replayed: false,
  };
}

function image(name: string) { return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" }); }

test("publish waits for every image in order and uses the exact draft version", async () => {
  const calls: unknown[] = [];
  const published = result("active", 2);
  const outcome = await completeProductMedia({
    result: result(), files: [{ file: image("one.png"), altText: "Bir" }, { file: image("two.png"), altText: "İki" }], publish: true,
    async upload(productId, input) { calls.push(["upload", productId, input.file.name]); },
    async complete(productId, input) { calls.push(["publish", productId, input]); return published; },
    async recover() { throw new Error("unused"); },
  });
  assert.deepEqual(calls, [
    ["upload", PRODUCT, "one.png"], ["upload", PRODUCT, "two.png"],
    ["publish", PRODUCT, { expectedProductVersion: 1, expectedMediaCount: 2 }],
  ]);
  assert.equal(outcome.kind, "published");
  assert.equal(outcome.result, published);
});

test("upload failure leaves the durable draft and never publishes or retries", async () => {
  let uploads = 0, publishes = 0, recoveries = 0;
  const draft = result();
  const outcome = await completeProductMedia({
    result: draft, files: [{ file: image("one.png"), altText: "" }, { file: image("two.png"), altText: "" }], publish: true,
    async upload() { uploads += 1; if (uploads === 2) throw new Error("expected"); },
    async complete() { publishes += 1; return result("active"); },
    async recover() { recoveries += 1; throw new Error("unused"); },
  });
  assert.deepEqual(outcome, { kind: "draft_media_failed", result: draft, uploadedCount: 1 });
  assert.equal(uploads, 2);
  assert.equal(publishes, 0);
  assert.equal(recoveries, 0);
});

test("unknown publication performs one read-only recovery and never a second write", async () => {
  let publishes = 0, recoveries = 0;
  const draft = result();
  const canonical = { ...draft, product: { ...draft.product, status: "active" }, variants: draft.variants.map((variant) => ({ variant, continueSellingWhenOutOfStock: false, inventory: [] })), mediaCount: 1 } as CatalogProductEditorProjection;
  const outcome = await completeProductMedia({
    result: draft, files: [{ file: image("one.png"), altText: "" }], publish: true,
    async upload() {},
    async complete() { publishes += 1; throw new Error("transport_unknown"); },
    async recover() { recoveries += 1; return canonical; },
  });
  assert.equal(outcome.kind, "published_recovered");
  assert.equal(publishes, 1);
  assert.equal(recoveries, 1);
});

test("unproven publication remains unknown after exactly one recovery", async () => {
  let publishes = 0, recoveries = 0;
  const draft = result();
  const outcome = await completeProductMedia({
    result: draft, files: [], publish: true,
    async upload() { throw new Error("unused"); },
    async complete() { publishes += 1; throw new Error("transport_unknown"); },
    async recover() { recoveries += 1; return { ...draft, variants: draft.variants.map((variant) => ({ variant, continueSellingWhenOutOfStock: false, inventory: [] })) } as CatalogProductEditorProjection; },
  });
  assert.deepEqual(outcome, { kind: "completion_unknown", result: draft, expectedMediaCount: 0 });
  assert.equal(publishes, 1);
  assert.equal(recoveries, 1);
});

test("media inputs are bounded to safe image types and exact alt text", async () => {
  const base = { result: result(), publish: false, upload: async () => {}, complete: async () => result(), recover: async () => { throw new Error("unused"); } };
  await assert.rejects(() => completeProductMedia({ ...base, files: [{ file: new File(["x"], "bad.svg", { type: "image/svg+xml" }), altText: "" }] }), /catalog_onboarding_media_invalid/);
  await assert.rejects(() => completeProductMedia({ ...base, files: [{ file: image("one.png"), altText: " altered " }] }), /catalog_onboarding_media_invalid/);
  await assert.rejects(() => completeProductMedia({ ...base, files: Array.from({ length: 17 }, (_, index) => ({ file: image(`${index}.png`), altText: "" })) }), /catalog_onboarding_media_invalid/);
});
