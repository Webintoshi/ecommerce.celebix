import assert from "node:assert/strict";
import test from "node:test";

const USD = "30000000-0000-4000-8000-000000000001";
const GOLD = "30000000-0000-4000-8000-000000000002";
const SET = "20000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const UTC = "2026-09-20T12:00:00.000000Z";

test("reference set draft converts merchant comma input to canonical exact rates without truncation", async () => {
  const { buildReferenceSetValues } = await import("./model.ts");
  const definitions = [
    { id: USD, kind: "usd" as const, label: "USD satış", createdAt: UTC },
    { id: GOLD, kind: "gold_gram" as const, label: "Gram satış", referencePurity: "0.916", createdAt: UTC },
  ];
  assert.deepEqual(buildReferenceSetValues(definitions, [
    { referenceId: USD, rateText: "40,12345678", active: true },
    { referenceId: GOLD, rateText: "5.000,50", active: true },
  ]), [
    { referenceId: USD, rateTry: "40.12345678", active: true },
    { referenceId: GOLD, rateTry: "5000.5", active: true },
  ]);
  assert.throws(() => buildReferenceSetValues(definitions, [{ referenceId: USD, rateText: "5.000", active: true }]), /reference_pricing_draft_invalid/);
  assert.throws(() => buildReferenceSetValues(definitions, [{ referenceId: USD, rateText: "0", active: true }]), /reference_pricing_draft_invalid/);
  assert.deepEqual(buildReferenceSetValues([definitions[0]!], [{ referenceId: USD, rateText: "", active: false }]), [{ referenceId: USD, rateTry: null, active: false }]);
});

test("activation readiness requires saved, unchanged draft and matching server preview, including deliberate deactivation", async () => {
  const { canActivateReferenceSet } = await import("./model.ts");
  const preview = { setId: SET, scopeDigest: "a".repeat(64), affectedProducts: 2, affectedVariants: 2, fixedOverrideVariants: 1, unavailableVariants: 0, entries: [], nextCursor: OTHER };
  assert.equal(canActivateReferenceSet({ savedSetId: SET, preview, dirty: false }), true);
  assert.equal(canActivateReferenceSet({ savedSetId: SET, preview: { ...preview, setId: OTHER }, dirty: false }), false);
  assert.equal(canActivateReferenceSet({ savedSetId: SET, preview, dirty: true }), false);
  assert.equal(canActivateReferenceSet({ savedSetId: SET, preview: { ...preview, unavailableVariants: 1 }, dirty: false }), true);
  assert.equal(canActivateReferenceSet({ savedSetId: SET, preview: null, dirty: false }), false);
});

test("variant policy drafts preserve server fixed TRY price and canonicalize source, grams, labor, purity and uplift", async () => {
  const { buildVariantPricingPolicy } = await import("./model.ts");
  assert.deepEqual(buildVariantPricingPolicy({ method: "fixed_try", fixedPriceCents: 12_345 }), { method: "fixed_try", fixedPriceCents: 12_345 });
  assert.deepEqual(buildVariantPricingPolicy({ method: "usd", referenceId: USD, sourceText: "2,5", upliftText: "10,25", laborMode: "per_item_try", laborText: "100,50" }), {
    method: "usd", referenceId: USD, sourceAmount: "2.5", upliftPercent: "10.25", laborMode: "per_item_try", laborAmount: "100.5",
  });
  assert.deepEqual(buildVariantPricingPolicy({ method: "gold_gram", referenceId: GOLD, gramsText: "2,500000", purityMode: "ratio", productPurityText: "0,750", laborMode: "per_gram_try", laborText: "50", upliftText: "5", allowFullDiscount: false }), {
    method: "gold_gram", referenceId: GOLD, metalGrams: "2.5", purityMode: "ratio", productPurity: "0.75", laborMode: "per_gram_try", laborAmount: "50", upliftPercent: "5", allowFullDiscount: false,
  });
  assert.throws(() => buildVariantPricingPolicy({ method: "gold_gram", referenceId: GOLD, gramsText: "5.000", purityMode: "direct", laborMode: "none", upliftText: "0", allowFullDiscount: false }), /reference_pricing_draft_invalid/);
});

test("candidate policy save is gated by matching preview, exact candidate and current versions", async () => {
  const { canSaveVariantPolicy } = await import("./model.ts");
  const policy = { method: "fixed_try" as const, fixedPriceCents: 12_345 };
  const preview = { variantId: USD, oldPriceCents: 10_000, newPriceCents: 12_345, sourceKind: "base" as const, priceListId: null, activeSetId: null, activeSetVersion: null, referenceId: null, referenceRateTry: null, method: "fixed_try" as const, metalComponentTry: null, laborTry: null, policyVersion: 0, variantVersion: 4, scopeDigest: "a".repeat(64) };
  const input = { variantId: USD, expectedVariantVersion: 4, expectedPolicyVersion: 0, previewedPolicy: policy, candidatePolicy: policy, preview };
  assert.equal(canSaveVariantPolicy(input), true);
  assert.equal(canSaveVariantPolicy({ ...input, candidatePolicy: { method: "fixed_try", fixedPriceCents: 12_346 } }), false);
  assert.equal(canSaveVariantPolicy({ ...input, expectedVariantVersion: 5 }), false);
  assert.equal(canSaveVariantPolicy({ ...input, preview: { ...preview, newPriceCents: null } }), false);
  assert.equal(canSaveVariantPolicy({ ...input, preview: { ...preview, scopeDigest: "bad" } }), false);
});
