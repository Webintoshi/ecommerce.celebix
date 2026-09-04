import assert from "node:assert/strict";
import test from "node:test";

import {
  derivePromotionLifecycle,
  normalizePromotionCode,
  parsePromotionAnalytics,
  parsePromotionCodeBatch,
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

test("promotion rule accepts all seven bounded benefit families and deeply freezes normalized codes", () => {
  const benefits = [
    { kind: "percentage", percentageBps: 1500 },
    { kind: "fixed_amount", amountMinor: 500, currency: "TRY" },
    { kind: "free_shipping" },
    { kind: "buy_x_get_y", buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10000 },
    { kind: "quantity_tiers", tiers: [{ minimumQuantity: 2, percentageBps: 1000 }, { minimumQuantity: 5, percentageBps: 2000 }] },
    { kind: "bundle_price", bundleQuantity: 3, bundlePriceMinor: 1200, currency: "TRY" },
    { kind: "gift", giftVariantId: ID },
  ];
  for (const benefit of benefits) {
    const parsed = parsePromotionRuleDocument(rule(benefit));
    assert.equal(parsed.benefit.kind, benefit.kind);
    assert.equal(Object.isFrozen(parsed), true);
    assert.equal(Object.isFrozen(parsed.targets.include), true);
  }
  const parsed = parsePromotionRuleDocument(rule());
  assert.deepEqual(parsed.trigger, { kind: "code", codes: ["INDIRIM-20"] });
  assert.throws(() => (parsed.targets.include as unknown[]).push({ kind: "product", id: SECOND_ID }));
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
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), trigger: { kind: "automatic", codes: [] } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), audience: { mode: "everyone", referenceIds: [ID] } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), limits: { totalUsage: null, perCustomerUsage: null, budgetMinor: null, orderMaximumMinor: -1 } }));
  assert.throws(() => parsePromotionRuleDocument({ ...rule(), combinationPolicy: { kind: "none", benefitClasses: [] } }));
});

test("coupon normalization maps Turkish letters to ASCII uppercase and rejects whitespace or controls", () => {
  assert.equal(normalizePromotionCode("şİfre-çöğü"), "SIFRE-COGU");
  for (const code of [" TWO", "TWO ", "TWO CODE", "TWO\nCODE", "", "a".repeat(65)]) {
    assert.throws(() => normalizePromotionCode(code));
  }
});

test("lifecycle derives ended and exhausted without mutating persisted state", () => {
  assert.equal(derivePromotionLifecycle({ status: "active", schedule: { timezone: "UTC", endsAt: NOW }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: LATER }), "ended");
  assert.equal(derivePromotionLifecycle({ status: "active", schedule: { timezone: "UTC" }, usage: { total: 2, budgetSpentMinor: 0 }, limits: { totalUsage: 2, budgetMinor: null }, now: NOW }), "exhausted");
  assert.equal(derivePromotionLifecycle({ status: "scheduled", schedule: { timezone: "UTC", startsAt: LATER }, usage: { total: 0, budgetSpentMinor: 0 }, limits: { totalUsage: null, budgetMinor: null }, now: NOW }), "scheduled");
});

test("evaluator request and result are bounded, immutable server truth", () => {
  const context = parsePromotionEvaluatorContext({
    storeId: ID, customerId: SECOND_ID, paidOrderCount: 1, customerSegmentIds: [ID], customerTagIds: [],
    cartLines: [{ lineId: ID, position: 0, productId: ID, variantId: SECOND_ID, quantity: 2, unitPriceMinor: 1000, costMinor: 500, currency: "TRY", categoryIds: [], brandId: null, collectionIds: [] }],
    shippingMethodId: ID, paymentMethodId: null, currency: "TRY", storeLocalTime: NOW, salesChannel: "storefront", submittedCodes: ["indirim-20"], abandonedCart: null,
  });
  assert.deepEqual(context.submittedCodes, ["INDIRIM-20"]);
  const result = parsePromotionEvaluatorResult({
    eligiblePromotionIds: [ID], appliedPromotions: [{ promotionId: ID, version: 1, name: "September", benefitKind: "percentage", normalizedCode: "INDIRIM-20", discountMinor: 200 }], rejectedPromotions: [{ promotionId: SECOND_ID, reason: "not_eligible" }],
    lineEffects: [{ lineId: ID, discountMinor: 200, giftQuantity: 0 }], shippingDiscountMinor: 0, gifts: [], preDiscountTotalMinor: 2000, postDiscountTotalMinor: 1800, currency: "TRY", progressMessages: ["Add 500 TRY for free shipping"], merchantExplanation: "One promotion applied",
  });
  assert.equal(result.postDiscountTotalMinor, 1800);
  assert.equal(Object.isFrozen(result.appliedPromotions[0]), true);
  assert.throws(() => parsePromotionEvaluatorResult({ ...result, postDiscountTotalMinor: 2001 }));
});

test("list, detail, simulator, code batch, csv analytics and legacy projections reject authority leaks", () => {
  const list = parsePromotionListQuery({ cursor: null, limit: 25, search: "September", statuses: ["active"] });
  assert.equal(list.limit, 25);
  assert.throws(() => parsePromotionListQuery({ cursor: null, limit: 25, storeId: ID }));
  const detail = parsePromotionDetail({ id: ID, version: 1, name: "September", status: "active", ruleDocument: rule(), createdAt: NOW, updatedAt: NOW });
  assert.equal(detail.id, ID);
  const simulator = parsePromotionSimulatorResponse({ evaluation: { eligiblePromotionIds: [], appliedPromotions: [], rejectedPromotions: [], lineEffects: [], shippingDiscountMinor: 0, gifts: [], preDiscountTotalMinor: 0, postDiscountTotalMinor: 0, currency: "TRY", progressMessages: [], merchantExplanation: "No promotions" }, mutated: false });
  assert.equal(simulator.mutated, false);
  assert.throws(() => parsePromotionSimulatorResponse({ ...simulator, mutated: true }));
  assert.equal(parsePromotionCodeBatch({ id: ID, promotionId: SECOND_ID, status: "active", count: 2, createdAt: NOW }).count, 2);
  assert.equal(parsePromotionCsvRow({ code: "indirim-20", status: "active" }).code, "INDIRIM-20");
  assert.equal(parsePromotionAnalytics({ currency: "TRY", redemptions: 3, discountMinor: 200, revenueMinor: 1200, conversionBps: 2500 }).redemptions, 3);
  assert.equal(parsePromotionLegacyProjection({ legacyRecordId: ID, promotionId: null, reason: "unmappable_legacy_discount" }).promotionId, null);
});

test("safe promotion errors expose only known bounded codes", () => {
  assert.deepEqual(safePromotionError("operation_mismatch"), { code: "operation_mismatch" });
  assert.deepEqual(safePromotionError("database password leaked"), { code: "promotion_unavailable" });
});
