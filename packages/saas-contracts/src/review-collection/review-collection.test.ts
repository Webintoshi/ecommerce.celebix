import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultReviewCollectionSettings, parseReviewCollectionSettings, parseReviewSubmission } from "./index.ts";

test("automatic collection starts disabled and bounded delay preserves explicit consent", () => {
  const defaults = createDefaultReviewCollectionSettings();
  assert.deepEqual(defaults, { enabled: false, delayDays: 7, version: 0 });
  assert.equal(parseReviewCollectionSettings({ enabled: true, delayDays: 3, version: 1 }).delayDays, 3);
  for (const change of [{ delayDays: -1 }, { delayDays: 61 }, { enabled: "true" }, { recipients: ["secret@example.test"] }]) assert.throws(() => parseReviewCollectionSettings({ ...defaults, ...change }));
});
test("submission never accepts purchase, customer or moderation claims", () => {
  const draft = { reviewerName: "Ada A.", rating: 5, title: "Kaliteli", body: "Ürün beklentimi karşıladı." };
  assert.equal(parseReviewSubmission(draft).rating, 5);
  for (const field of ["verifiedPurchase", "customerId", "orderId", "productId", "status", "storeId"]) assert.throws(() => parseReviewSubmission({ ...draft, [field]: "approved" }));
  assert.throws(() => parseReviewSubmission({ ...draft, body: "x".repeat(2001) }));
  assert.throws(() => parseReviewSubmission({ ...draft, rating: 0 }));
});
