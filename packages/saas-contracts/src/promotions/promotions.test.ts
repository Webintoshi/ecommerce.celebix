import assert from "node:assert/strict";
import test from "node:test";
import {
  PROMOTION_REJECTION_REASONS,
  derivePromotionLifecycle,
  normalizePromotionCode,
  parsePromotionAnalytics,
  parsePromotionCodeBatch,
  parsePromotionCodeBatchList,
  parsePromotionCodeBatchListItem,
  parsePromotionCsvRow,
  parsePromotionDetail,
  parsePromotionEvaluatorContext,
  parsePromotionEvaluatorResult,
  parsePromotionLegacyProjection,
  parsePromotionListQuery,
  parsePromotionRuleDocument,
  parsePromotionSimulatorResponse,
  safePromotionError,
} from "./index.ts";

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SECOND_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = "2026-09-05T10:00:00.000Z";
const LATER = "2026-09-05T11:00:00.000Z";

function rule(benefit: object = { kind: "percentage", percentageBps: 1500 }): object {
  return {
    schemaVersion: 1,
    benefit,
    targets: { mode: "selected", include: [{ kind: "product", id: ID }], exclude: [] },
    audience: { mode: "everyone" },
    trigger: { kind: "code", codes: ["İndirim-20"] },
    schedule: { timezone: "Europe/Istanbul", startsAt: NOW, endsAt: LATER },
    limits: { totalUsage: null, perCustomerUsage: null, budgetMinor: null, orderMaximumMinor: null },
    conditions: { minimumBasketMinor: 0, minimumQuantity: 0, minimumProductQuantity: 0 },
    combinationPolicy: { kind: "benefit_classes", benefitClasses: ["free_shipping"] },
    priority: 3,
    marginPolicy: { kind: "maximum_percentage", maximumPercentageBps: 2000 },
    progressMessagePolicy: { enabled: true },
  };
}

function bundleRule(
  benefit: object = {
    kind: "bundle_price",
    items: [{ variantId: ID, quantity: 2 }, { variantId: SECOND_ID, quantity: 1 }],
    bundlePriceMinor: 1200,
    currency: "TRY",
  },
  targets: object = {
    mode: "selected",
    include: [{ kind: "variant", id: SECOND_ID }, { kind: "variant", id: ID }],
    exclude: [],
  },
): object {
  return { ...rule(benefit), targets };
}

test("promotion rule accepts all seven bounded benefit families and deeply freezes normalized codes", () => {
  const benefits = [
    { kind: "percentage", percentageBps: 1500 },
    { kind: "fixed_amount", amountMinor: 500, currency: "TRY" },
    { kind: "free_shipping" },
    { kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10000, reward: { strategy: "same_product_cheapest" } },
    { kind: "quantity_tiers", tiers: [{ minimumQuantity: 2, percentageBps: 1000 }, { minimumQuantity: 5, percentageBps: 2000 }] },
    { kind: "bundle_price", items: [{ variantId: ID, quantity: 2 }, { variantId: SECOND_ID, quantity: 1 }], bundlePriceMinor: 1200, currency: "TRY" },
    { kind: "gift", giftVariantId: ID, quantity: 2, autoAdd: true },
  ];
  for (const benefit of benefits) {
    const parsed = parsePromotionRuleDocument(benefit.kind === "bundle_price" ? bundleRule(benefit) : rule(benefit));
    assert.equal(parsed.benefit.kind, benefit.kind);
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.targets.include), true);
  }
  const parsed = parsePromotionRuleDocument(rule());
  assert.deepEqual(parsed.trigger, { kind: "code", codes: ["INDIRIM-20"] });
  assert.throws(() => (parsed.targets.include as unknown[]).push({ kind: "product", id: SECOND_ID }));
});

test("bundle price requires an exact unique bounded variant composition", () => {
  const parsed = parsePromotionRuleDocument(bundleRule({
    kind: "bundle_price",
    items: [{ variantId: ID, quantity: 2 }, { variantId: SECOND_ID, quantity: 1 }],
    bundlePriceMinor: 1200,
    currency: "TRY",
  }));
  assert.deepEqual(parsed.benefit, {
    kind: "bundle_price",
    items: [{ variantId: ID, quantity: 2 }, { variantId: SECOND_ID, quantity: 1 }],
    bundlePriceMinor: 1200,
    currency: "TRY",
  });
  assert.equal(Object.isFrozen((parsed.benefit as { items: readonly unknown[] }).items), true);
  assert.equal(Object.isFrozen((parsed.benefit as { items: readonly object[] }).items[0]), true);
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", bundleQuantity: 3, bundlePriceMinor: 1200, currency: "TRY" })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: ID, quantity: 1 }], bundlePriceMinor: 1200, currency: "TRY" }, { mode: "selected", include: [{ kind: "variant", id: ID }], exclude: [] })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: ID, quantity: 1 }, { variantId: ID, quantity: 1 }], bundlePriceMinor: 1200, currency: "TRY" }, { mode: "selected", include: [{ kind: "variant", id: ID }], exclude: [] })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule(undefined, { mode: "selected", include: [{ kind: "variant", id: ID }], exclude: [] })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule(undefined, { mode: "selected", include: [{ kind: "variant", id: ID }, { kind: "variant", id: SECOND_ID }, { kind: "variant", id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }], exclude: [] })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule(undefined, { mode: "selected", include: [{ kind: "product", id: ID }, { kind: "variant", id: SECOND_ID }], exclude: [] })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule(undefined, { mode: "selected", include: [{ kind: "variant", id: ID }, { kind: "variant", id: SECOND_ID }], exclude: [{ kind: "variant", id: ID }] })));
  const ids = Array.from({ length: 21 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const twenty = ids.slice(0, 20).map((variantId) => ({ variantId, quantity: 1 }));
  assert.equal(parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: twenty, bundlePriceMinor: 1, currency: "TRY" }, { mode: "selected", include: twenty.map(({ variantId }) => ({ kind: "variant", id: variantId })).reverse(), exclude: [] })).benefit.kind, "bundle_price");
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: ids.map((variantId) => ({ variantId, quantity: 1 })), bundlePriceMinor: 1, currency: "TRY" }, { mode: "selected", include: ids.map((id) => ({ kind: "variant", id })), exclude: [] })));
  for (const quantity of [0, 1.5, 1_000_001]) assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: ID, quantity }, { variantId: SECOND_ID, quantity: 1 }], bundlePriceMinor: 1, currency: "TRY" })));
  assert.equal(parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: ID, quantity: 999_999 }, { variantId: SECOND_ID, quantity: 1 }], bundlePriceMinor: 1, currency: "TRY" })).benefit.kind, "bundle_price");
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: ID, quantity: 1_000_000 }, { variantId: SECOND_ID, quantity: 1 }], bundlePriceMinor: 1, currency: "TRY" })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: "not-a-uuid", quantity: 1 }, { variantId: SECOND_ID, quantity: 1 }], bundlePriceMinor: 1, currency: "TRY" })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: ID, quantity: 1, extra: true }, { variantId: SECOND_ID, quantity: 1 }], bundlePriceMinor: 1, currency: "TRY" })));
  assert.throws(() => parsePromotionRuleDocument(bundleRule({ kind: "bundle_price", items: [{ variantId: ID, quantity: 1 }, { variantId: SECOND_ID, quantity: 1 }], bundlePriceMinor: 1, currency: "TRY", extra: true })));
  assert.equal(parsePromotionRuleDocument(bundleRule(undefined, { mode: "selected", include: [{ kind: "variant", id: ID }, { kind: "variant", id: SECOND_ID }], exclude: [] })).benefit.kind, "bundle_price");
});

test("gift benefit and evaluator gift effects are exact discriminated unions", () => {
  assert.deepEqual(parsePromotionRuleDocument(rule({ kind: "gift", giftVariantId: ID, quantity: 2, autoAdd: false })).benefit, {
    kind: "gift", giftVariantId: ID, quantity: 2, autoAdd: false,
  });
  assert.throws(() => parsePromotionRuleDocument(rule({ kind: "gift", giftVariantId: ID })));
  for (const gift of [
    { kind: "gift", giftVariantId: "not-a-uuid", quantity: 1, autoAdd: true },
    { kind: "gift", giftVariantId: ID, quantity: 0, autoAdd: true },
    { kind: "gift", giftVariantId: ID, quantity: 1.5, autoAdd: true },
    { kind: "gift", giftVariantId: ID, quantity: 1_000_001, autoAdd: true },
    { kind: "gift", giftVariantId: ID, quantity: 1, autoAdd: "true" },
    { kind: "gift", giftVariantId: ID, quantity: 1, autoAdd: true, extra: true },
  ]) assert.throws(() => parsePromotionRuleDocument(rule(gift)));

  const base = {
    eligiblePromotionIds: [ID],
    appliedPromotions: [{ promotionId: ID, version: 1, name: "Gift", benefitKind: "gift", lineDiscountMinor: 0, shippingDiscountMinor: 0, discountTotalMinor: 0 }],
    rejectedPromotions: [], lineEffects: [], shippingEffects: [], subtotalBeforeDiscountMinor: 1000,
    lineDiscountTotalMinor: 0, shippingBeforeDiscountMinor: 0, shippingDiscountTotalMinor: 0,
    discountTotalMinor: 0, grandTotalMinor: 1000, currency: "TRY", progressMessages: [], merchantExplanation: "evaluated",
  };
  const automatic = parsePromotionEvaluatorResult({
    ...base,
    gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0, autoAdd: true }],
  });
  assert.equal(automatic.gifts[0]?.autoAdd, true);
  assert.throws(() => parsePromotionEvaluatorResult({ ...base, gifts: [] }));
  assert.throws(() => parsePromotionEvaluatorResult({
    ...base,
    gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0, autoAdd: true, lineId: SECOND_ID }],
  }));
  assert.throws(() => parsePromotionEvaluatorResult({
    ...base,
    lineEffects: [{ promotionId: ID, lineId: SECOND_ID, discountMinor: 0, giftQuantity: 0 }],
    gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0, autoAdd: true }],
  }));

  const manual = parsePromotionEvaluatorResult({
    ...base,
    appliedPromotions: [{ ...base.appliedPromotions[0], lineDiscountMinor: 400, discountTotalMinor: 400 }],
    lineEffects: [{ promotionId: ID, lineId: SECOND_ID, discountMinor: 400, giftQuantity: 0 }],
    gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0, autoAdd: false, lineId: SECOND_ID }],
    lineDiscountTotalMinor: 400, discountTotalMinor: 400, grandTotalMinor: 600,
  });
  assert.equal(manual.gifts[0]?.autoAdd, false);
  assert.throws(() => parsePromotionEvaluatorResult({
    ...base,
    gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0, autoAdd: false }],
  }));
  for (const gift of [
    { promotionId: ID, variantId: SECOND_ID, quantity: 0, paidMinor: 0, autoAdd: true },
    { promotionId: ID, variantId: SECOND_ID, quantity: 1.5, paidMinor: 0, autoAdd: true },
    { promotionId: ID, variantId: SECOND_ID, quantity: 1, paidMinor: 0, autoAdd: "true" },
    { promotionId: ID, variantId: SECOND_ID, quantity: 1, paidMinor: 0, autoAdd: true, unknown: true },
  ]) assert.throws(() => parsePromotionEvaluatorResult({ ...base, gifts: [gift] }));
  assert.throws(() => parsePromotionEvaluatorResult({ ...base, shippingEffects: [{ promotionId: ID, discountMinor: 0 }], gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0, autoAdd: true }] }));
  assert.throws(() => parsePromotionEvaluatorResult({
    ...base,
    appliedPromotions: [{ ...base.appliedPromotions[0], lineDiscountMinor: 400, discountTotalMinor: 400 }],
    lineEffects: [
      { promotionId: ID, lineId: SECOND_ID, discountMinor: 200, giftQuantity: 0 },
      { promotionId: ID, lineId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", discountMinor: 200, giftQuantity: 0 },
    ],
    gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0, autoAdd: false, lineId: SECOND_ID }],
    lineDiscountTotalMinor: 400, discountTotalMinor: 400, grandTotalMinor: 600,
  }));
});

test("buy X get Y encodes an exact reward strategy and bounded reward scope", () => {
  for (const benefit of [
    { kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10000, reward: { strategy: "same_product_cheapest" } },
    { kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 5000, reward: { strategy: "selected_products_cheapest", productIds: [ID, SECOND_ID] } },
    { kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10000, reward: { strategy: "specific_variant", variantId: SECOND_ID } },
  ]) assert.equal(parsePromotionRuleDocument(rule(benefit)).benefit.kind, "buy_x_get_y");
  assert.throws(() => parsePromotionRuleDocument(rule({ kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10000 })));
  assert.throws(() => parsePromotionRuleDocument(rule({ kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10000, reward: { strategy: "same_product_cheapest", variantId: ID } })));
});

test("promotion rule rejects unknown keys, unsafe values, invalid timezone and impossible schedule", () => {
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), authority: "never" }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), priority: Number.MAX_SAFE_INTEGER + 1 }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), schedule: { timezone: "Not/AZone", startsAt: NOW } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), schedule: { timezone: "Europe/Istanbul", startsAt: LATER, endsAt: NOW } }));
  assert.throws(() => parsePromotionRuleDocument(rule({ kind: "fixed_amount", amountMinor: 1, currency: "try" })));
});

test("promotion trigger, targets, audiences, nullable limits and policies are exact", () => {
  const automatic = parsePromotionRuleDocument({
    ...rule(),
    targets: { mode: "all", include: [], exclude: [{ kind: "brand", id: ID }] },
    audience: { mode: "customer_segments", referenceIds: [ID, SECOND_ID] },
    trigger: { kind: "automatic" },
    limits: { totalUsage: 10, perCustomerUsage: 2, budgetMinor: 4000, orderMaximumMinor: 800 },
    combinationPolicy: { kind: "shipping_only" },
    marginPolicy: { kind: "floor_at_cost" },
    progressMessagePolicy: { enabled: false },
  });
  assert.deepEqual(automatic.audience.referenceIds, [ID, SECOND_ID]);
  assert.equal(automatic.limits.budgetMinor, 4000);
  assert.equal(parsePromotionRuleDocument({ ...rule(), targets: { mode: "selected", include: [{ kind: "product", id: ID }], exclude: [{ kind: "product", id: ID }] } }).targets.exclude.length, 1);
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), trigger: { kind: "automatic", codes: [] } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), audience: { mode: "everyone", referenceIds: [ID] } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), limits: { totalUsage: null, perCustomerUsage: null, budgetMinor: null, orderMaximumMinor: -1 } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), combinationPolicy: { kind: "none", benefitClasses: [] } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), targets: { mode: "all", include: [{ kind: "product", id: ID }], exclude: [] } }));
});

test("promotion conditions keep exact bounded payment shipping and sales-channel allow-lists", () => {
  const parsed = parsePromotionRuleDocument({
    ...rule(),
    conditions: {
      minimumBasketMinor: 0,
      minimumQuantity: 0,
      minimumProductQuantity: 0,
      paymentMethodIds: [ID, SECOND_ID],
      shippingMethodIds: [SECOND_ID],
      salesChannels: ["storefront", "quick_order"],
    },
  });
  assert.deepEqual(parsed.conditions.paymentMethodIds, [ID, SECOND_ID]);
  assert.deepEqual(parsed.conditions.shippingMethodIds, [SECOND_ID]);
  assert.deepEqual(parsed.conditions.salesChannels, ["storefront", "quick_order"]);
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), conditions: { ...parsed.conditions, paymentMethodIds: [ID, ID] } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), conditions: { ...parsed.conditions, salesChannels: ["storefront", "storefront"] } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), conditions: { ...parsed.conditions, storeId: ID } }));
});

test("coupon normalization maps Turkish letters to ASCII uppercase and rejects whitespace or controls", () => {
  assert.equal(normalizePromotionCode("şİfre-çöğü"), "SIFRE-COGU");
  for (const code of [" TWO", "TWO ", "TWO CODE", "TWO\nCODE", "S\u00df", "KOD\u03a3", "-FORMULA", "_PRIVATE", "", "a".repeat(65)]) {
    assert.throws(() => normalizePromotionCode(code));
  }
});

test("lifecycle derives ended and exhausted without mutating persisted state", () => {
  assert.equal(derivePromotionLifecycle({ status: "active", schedule: { timezone: "UTC", endsAt: NOW }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: LATER }), "ended");
  assert.equal(derivePromotionLifecycle({ status: "active", schedule: { timezone: "UTC" }, usage: { total: 2, budgetSpentMinor: 0 }, limits: { totalUsage: 2, budgetMinor: null }, now: NOW }), "exhausted");
  assert.equal(derivePromotionLifecycle({ status: "scheduled", schedule: { timezone: "UTC", startsAt: LATER }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: NOW }), "scheduled");
});

test("lifecycle derives scheduled before start and active on or after the exact start boundary", () => {
  assert.equal(derivePromotionLifecycle({ status: "scheduled", schedule: { timezone: "UTC", startsAt: LATER }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: NOW }), "scheduled");
  assert.equal(derivePromotionLifecycle({ status: "scheduled", schedule: { timezone: "UTC", startsAt: NOW }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: NOW }), "active");
  assert.equal(derivePromotionLifecycle({ status: "active", schedule: { timezone: "UTC", startsAt: LATER }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: NOW }), "scheduled");
  assert.throws(() => derivePromotionLifecycle({ status: "scheduled", schedule: { timezone: "UTC" }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: NOW }));
});

test("promotion timestamps are canonical millisecond UTC values with epoch-based lifecycle boundaries", () => {
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), schedule: { timezone: "UTC", startsAt: "2026-02-30T10:00:00.000Z" } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), schedule: { timezone: "UTC", startsAt: "2026-09-05T10:00:00.000000Z" } }));
  assert.equal(derivePromotionLifecycle({ status: "active", schedule: { timezone: "UTC", startsAt: NOW, endsAt: LATER }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: NOW }), "active");
  assert.equal(derivePromotionLifecycle({ status: "active", schedule: { timezone: "UTC", startsAt: NOW, endsAt: LATER }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: LATER }), "ended");
});

test("evaluator request and result are bounded, immutable server truth", () => {
  const context = parsePromotionEvaluatorContext({
    storeId: ID, customerId: SECOND_ID, paidOrderCount: 1, customerSegmentIds: [ID], customerTagIds: [],
    cartLines: [{ lineId: ID, position: 0, productId: ID, variantId: SECOND_ID, quantity: 2, unitPriceMinor: 1000, unitCostMinor: 500, currency: "TRY", categoryIds: [], brandId: null, collectionIds: [] }],
    shippingMethodId: ID, paymentMethodId: null, shippingBeforeDiscountMinor: 100, currency: "TRY", storeLocalTime: NOW, salesChannel: "storefront", submittedCodes: ["indirim-20"], abandonedCart: null,
  });
  assert.deepEqual(context.submittedCodes, ["INDIRIM-20"]);
  assert.equal(context.shippingBeforeDiscountMinor, 100);
  const result = parsePromotionEvaluatorResult({
    eligiblePromotionIds: [ID], appliedPromotions: [{ promotionId: ID, version: 1, name: "September", benefitKind: "percentage", normalizedCode: "INDIRIM-20", lineDiscountMinor: 200, shippingDiscountMinor: 50, discountTotalMinor: 250 }], rejectedPromotions: [{ promotionId: SECOND_ID, reason: "not_eligible" }],
    lineEffects: [{ promotionId: ID, lineId: ID, discountMinor: 200, giftQuantity: 0 }], shippingEffects: [{ promotionId: ID, discountMinor: 50 }], gifts: [], subtotalBeforeDiscountMinor: 2000, lineDiscountTotalMinor: 200, shippingBeforeDiscountMinor: 100, shippingDiscountTotalMinor: 50, discountTotalMinor: 250, grandTotalMinor: 1850, currency: "TRY", progressMessages: ["Add 500 TRY for free shipping"], merchantExplanation: "evaluated",
  });
  assert.equal(result.grandTotalMinor, 1850);
  assert.equal(Object.isFrozen(result.appliedPromotions[0]), true);
  assert.equal(parsePromotionEvaluatorResult({ ...result, appliedPromotions: [{ ...result.appliedPromotions[0], version: Number.MAX_SAFE_INTEGER }] }).appliedPromotions[0]?.version, Number.MAX_SAFE_INTEGER);
  assert.throws(() => parsePromotionEvaluatorResult({ ...result, appliedPromotions: [{ ...result.appliedPromotions[0], version: Number.MAX_SAFE_INTEGER + 1 }] }));
  assert.equal(parsePromotionEvaluatorResult({ ...result, rejectedPromotions: [{ promotionId: SECOND_ID, reason: "order_line_limit" }] }).rejectedPromotions[0]?.reason, "order_line_limit");
  for (const reason of PROMOTION_REJECTION_REASONS) assert.equal(parsePromotionEvaluatorResult({ ...result, rejectedPromotions: [{ promotionId: SECOND_ID, reason }] }).rejectedPromotions[0]?.reason, reason);
  assert.throws(() => parsePromotionEvaluatorResult({ ...result, rejectedPromotions: [{ promotionId: SECOND_ID, reason: "internal_sql_error" }] }));
  assert.throws(() => parsePromotionEvaluatorResult({ ...result, grandTotalMinor: 1851 }));
  assert.throws(() => parsePromotionEvaluatorResult({ ...result, shippingEffects: [{ promotionId: SECOND_ID, discountMinor: 50 }] }));
  assert.throws(() => parsePromotionEvaluatorResult({ ...result, gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 1, paidMinor: 1 }] }));
  assert.throws(() => parsePromotionEvaluatorResult({ ...result, gifts: [{ promotionId: ID, variantId: SECOND_ID, quantity: 1, paidMinor: 0 }, { promotionId: ID, variantId: SECOND_ID, quantity: 2, paidMinor: 0 }] }));
});

test("evaluator accepts the complete 100 promotion by 20 line effect matrix and rejects overflow", () => {
  const promotionIds = Array.from({ length: 100 }, (_, index) => `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const lineIds = Array.from({ length: 20 }, (_, index) => `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
  const appliedPromotions = promotionIds.map((promotionId, index) => ({ promotionId, version: index === 0 ? Number.MAX_SAFE_INTEGER : 1, name: `Promotion ${index + 1}`, benefitKind: "percentage", lineDiscountMinor: 20, shippingDiscountMinor: 0, discountTotalMinor: 20 }));
  const lineEffects = promotionIds.flatMap((promotionId) => lineIds.map((lineId) => ({ promotionId, lineId, discountMinor: 1, giftQuantity: 0 })));
  const value = { eligiblePromotionIds: promotionIds, appliedPromotions, rejectedPromotions: [], lineEffects, shippingEffects: [], gifts: [], subtotalBeforeDiscountMinor: 2_000, lineDiscountTotalMinor: 2_000, shippingBeforeDiscountMinor: 0, shippingDiscountTotalMinor: 0, discountTotalMinor: 2_000, grandTotalMinor: 0, currency: "TRY", progressMessages: [], merchantExplanation: "evaluated" };
  assert.equal(parsePromotionEvaluatorResult(value).lineEffects.length, 2_000);
  assert.throws(() => parsePromotionEvaluatorResult({ ...value, lineEffects: [...lineEffects, { promotionId: promotionIds[0], lineId: "20000000-0000-4000-8000-000000000021", discountMinor: 0, giftQuantity: 0 }] }));
});

test("evaluator context keeps Task 1's dense bounded taxonomy and canonical timestamp rules", () => {
  const context = {
    storeId: ID, customerId: null, paidOrderCount: 0, customerSegmentIds: [], customerTagIds: [],
    cartLines: [{ lineId: ID, position: 0, productId: ID, variantId: SECOND_ID, quantity: 1, unitPriceMinor: 1, unitCostMinor: null, currency: "TRY", categoryIds: [], brandId: null, collectionIds: [] }],
    shippingMethodId: null, paymentMethodId: null, shippingBeforeDiscountMinor: 0, currency: "TRY", storeLocalTime: NOW, salesChannel: "storefront", submittedCodes: [], abandonedCart: null,
  };
  const ids = Array.from({ length: 101 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  assert.throws(() => parsePromotionEvaluatorContext({ ...context, customerSegmentIds: ids }));
  assert.throws(() => parsePromotionEvaluatorContext({ ...context, customerTagIds: ids }));
  assert.throws(() => parsePromotionEvaluatorContext({ ...context, cartLines: [{ ...context.cartLines[0], categoryIds: ids }] }));
  assert.throws(() => parsePromotionEvaluatorContext({ ...context, cartLines: [{ ...context.cartLines[0], collectionIds: ids }] }));
  assert.throws(() => parsePromotionEvaluatorContext({ ...context, storeLocalTime: "2026-02-30T10:00:00.000Z" }));
});

test("list, detail, simulator, code batch, csv analytics and legacy projections reject authority leaks", () => {
  const list = parsePromotionListQuery({ cursor: null, limit: 25, search: "September", statuses: ["active"] });
  assert.equal(list.limit, 25);
  assert.throws(() => parsePromotionListQuery({ cursor: null, limit: 25, storeId: ID }));
  const detail = parsePromotionDetail({ id: ID, version: 1, name: "September", status: "active", ruleDocument: rule(), createdAt: NOW, updatedAt: NOW });
  assert.equal(detail.id, ID);
  assert.equal(parsePromotionDetail({ ...detail, version: Number.MAX_SAFE_INTEGER }).version, Number.MAX_SAFE_INTEGER);
  assert.throws(() => parsePromotionDetail({ ...detail, version: Number.MAX_SAFE_INTEGER + 1 }));
  const simulator = parsePromotionSimulatorResponse({ evaluation: { eligiblePromotionIds: [], appliedPromotions: [], rejectedPromotions: [], lineEffects: [], shippingEffects: [], gifts: [], subtotalBeforeDiscountMinor: 0, lineDiscountTotalMinor: 0, shippingBeforeDiscountMinor: 0, shippingDiscountTotalMinor: 0, discountTotalMinor: 0, grandTotalMinor: 0, currency: "TRY", progressMessages: [], merchantExplanation: "evaluated" }, mutated: false });
  assert.equal(simulator.mutated, false);
  assert.throws(() => parsePromotionSimulatorResponse({ ...simulator, mutated: true }));
  const batch = parsePromotionCodeBatch({ id: ID, promotionId: SECOND_ID, version: 1, status: "active", count: 2, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: LATER, createdAt: NOW, updatedAt: NOW });
  assert.equal(batch.codeLength, 24);
  assert.deepEqual(Object.keys(batch).sort(), ["codeLength", "count", "createdAt", "expiresAt", "id", "perCustomerUsage", "prefix", "promotionId", "status", "updatedAt", "version"].sort());
  assert.equal(parsePromotionCodeBatchListItem({ ...batch, used: 1, held: 0, remaining: 1 }).remaining, 1);
  assert.throws(() => parsePromotionCodeBatchListItem({ ...batch, used: 1, held: 1, remaining: 1 }));
  assert.throws(() => parsePromotionCodeBatch({ ...batch, expiresAt: NOW }));
  const page = parsePromotionCodeBatchList({ items: [{ ...batch, used: 1, held: 0, remaining: 1 }], hasMore: true, snapshotAt: NOW, cursorAnchor: { createdAt: NOW, id: ID } });
  assert.equal(page.hasMore, true);
  assert.equal(Object.isFrozen(page.cursorAnchor), true);
  assert.throws(() => parsePromotionCodeBatchList({ ...page, cursorAnchor: null }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, hasMore: false }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, cursorAnchor: { createdAt: "2026-09-05T10:00:00.000000Z", id: ID } }));
  const pageItem = page.items[0]!;
  const laterIdBatch = { ...batch, id: SECOND_ID, used: 0, held: 0, remaining: 2 };
  assert.equal(parsePromotionCodeBatchList({ ...page, items: [laterIdBatch, pageItem], cursorAnchor: { createdAt: NOW, id: ID } }).items.length, 2);
  assert.throws(() => parsePromotionCodeBatchList({ ...page, items: [pageItem, laterIdBatch], cursorAnchor: { createdAt: NOW, id: SECOND_ID } }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, items: [], hasMore: true, cursorAnchor: { createdAt: NOW, id: ID } }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, cursorAnchor: { createdAt: NOW, id: SECOND_ID } }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, items: [{ ...pageItem, createdAt: LATER, updatedAt: LATER }], cursorAnchor: { createdAt: LATER, id: ID } }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, items: [pageItem, { ...laterIdBatch, promotionId: ID, createdAt: "2026-09-05T09:00:00.000Z", updatedAt: "2026-09-05T09:00:00.000Z" }], cursorAnchor: { createdAt: "2026-09-05T09:00:00.000Z", id: SECOND_ID } }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, items: [{ ...pageItem, status: "paused", remaining: 1 }] }));
  assert.throws(() => parsePromotionCodeBatchList({ ...page, snapshotAt: LATER, items: [{ ...pageItem, expiresAt: LATER, remaining: 1 }], cursorAnchor: { createdAt: NOW, id: ID } }));
  assert.equal(parsePromotionCsvRow({ code: "INDIRIM-20", status: "active" }).code, "INDIRIM-20");
  assert.throws(() => parsePromotionCsvRow({ code: "indirim-20", status: "active" }));
  assert.equal(parsePromotionAnalytics({ currency: "TRY", redemptions: 3, discountMinor: 200, revenueMinor: 1200, conversionBps: 2500 }).redemptions, 3);
  assert.equal(parsePromotionLegacyProjection({ legacyRecordId: ID, promotionId: SECOND_ID, reason: "adopted" }).promotionId, SECOND_ID);
  for (const reason of ["unsupported_discount_type", "invalid_value", "invalid_minimum_order", "invalid_usage_limit", "invalid_code", "code_conflict", "invalid_legacy_record"]) {
    assert.equal(parsePromotionLegacyProjection({ legacyRecordId: ID, promotionId: null, reason }).reason, reason);
  }
  assert.throws(() => parsePromotionLegacyProjection({ legacyRecordId: ID, promotionId: null, reason: "adopted" }));
  assert.throws(() => parsePromotionLegacyProjection({ legacyRecordId: ID, promotionId: SECOND_ID, reason: "invalid_code" }));
  assert.throws(() => parsePromotionLegacyProjection({ legacyRecordId: ID, promotionId: null, reason: "unmappable_legacy_discount" }));
});

test("safe promotion errors expose only known bounded codes", () => {
  assert.deepEqual(safePromotionError("operation_mismatch"), { code: "operation_mismatch" });
  assert.deepEqual(safePromotionError("database password leaked"), { code: "promotion_unavailable" });
});
