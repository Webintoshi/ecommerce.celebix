import assert from "node:assert/strict";
import test from "node:test";

import {
  PROMOTION_ERROR_CODES,
  parsePromotionAdminListQuery,
  parsePromotionBatchCreateRequest,
  parsePromotionBatchStatusRequest,
  parsePromotionCheckRequest,
  parsePromotionCreateRequest,
  parsePromotionDuplicateRequest,
  parsePromotionLifecycleTargetRequest,
  parsePromotionMutationEnvelope,
  parsePromotionCodeBatchMutationEnvelope,
  parsePromotionAdminListPage,
  parsePromotionAdminAnalyticsResult,
  parsePromotionAnalyticsDetailResult,
  parsePromotionAnalyticsQuery,
  parsePromotionConflictCheck,
  parsePromotionCsvExport,
  parsePromotionLegacyPage,
  parsePromotionMarginCheck,
  parsePromotionPickerList,
  parsePromotionPickerResolve,
  parsePromotionOverviewResult,
  parsePromotionSimulationRequest,
  parsePromotionTargetResolveRequest,
  type PromotionCodeBatch,
  type PromotionDetail,
  type PromotionAdminEvaluatorContext,
  type PromotionRuleDocument,
} from "./index.ts";

const STORE = "10000000-0000-4000-8000-000000000001";
const PROMOTION = "20000000-0000-4000-8000-000000000001";
const BATCH = "30000000-0000-4000-8000-000000000001";
const NOW = "2026-09-05T12:00:00.000Z";

function rule(codeCount = 1): PromotionRuleDocument {
  return {
    schemaVersion: 1, benefit: { kind: "percentage", percentageBps: 1_000 },
    targets: { mode: "all", include: [], exclude: [] }, audience: { mode: "everyone" },
    trigger: { kind: "code", codes: Array.from({ length: codeCount }, (_, index) => `C${String(index).padStart(3, "0")}`) },
    schedule: { timezone: "UTC" }, limits: { totalUsage: null, perCustomerUsage: null, budgetMinor: null, orderMaximumMinor: null },
    conditions: { minimumBasketMinor: 0, minimumQuantity: 0, minimumProductQuantity: 0 }, combinationPolicy: { kind: "none" },
    priority: 0, marginPolicy: { kind: "warn" }, progressMessagePolicy: { enabled: false },
  };
}
function context(): PromotionAdminEvaluatorContext {
  return { customerId: null, paidOrderCount: 0, customerSegmentIds: [], customerTagIds: [], cartLines: [], shippingMethodId: null, paymentMethodId: null, shippingBeforeDiscountMinor: 0, currency: "TRY", storeLocalTime: NOW, salesChannel: "storefront", submittedCodes: [], abandonedCart: null };
}
function detail(): PromotionDetail { return { id: PROMOTION, version: 1, name: "Atlas", status: "draft", ruleDocument: rule(), createdAt: NOW, updatedAt: NOW }; }
function batch(): PromotionCodeBatch { return { id: BATCH, promotionId: PROMOTION, version: 1, status: "active", count: 10, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null, createdAt: NOW, updatedAt: NOW }; }

test("admin list contract closes every filter and canonicalizes only set filters", () => {
  assert.deepEqual(parsePromotionAdminListQuery({
    limit: 50, cursor: "Abc_-1", search: "Atlas", effectiveStatuses: ["active", "draft"],
    triggerKinds: ["code", "automatic"], benefitKinds: ["gift", "percentage"],
    audienceModes: ["masked_customers", "everyone"], scheduleFrom: NOW, scheduleTo: "2026-09-06T12:00:00.000Z",
  }), {
    limit: 50, cursor: "Abc_-1", search: "Atlas", effectiveStatuses: ["active", "draft"],
    triggerKinds: ["automatic", "code"], benefitKinds: ["gift", "percentage"],
    audienceModes: ["everyone", "masked_customers"], scheduleFrom: NOW, scheduleTo: "2026-09-06T12:00:00.000Z",
  });
  for (const invalid of [
    { limit: 1, cursor: "a".repeat(2049) },
    { limit: 1, effectiveStatuses: ["active", "active"] },
    { limit: 1, scheduleFrom: NOW },
    { limit: 1, extra: true },
    { pageSize: 1 },
  ]) assert.throws(() => parsePromotionAdminListQuery(invalid));
});

test("admin action contracts enforce direct-code and exact envelope boundaries", () => {
  assert.equal(parsePromotionCreateRequest({ name: "Atlas", ruleDocument: rule(100) }).ruleDocument.trigger.kind, "code");
  assert.throws(() => parsePromotionCreateRequest({ name: "Atlas", ruleDocument: rule(101) }));
  assert.equal(parsePromotionDuplicateRequest({ expectedVersion: 1, name: "Kopya", codes: ["vip-1", "VIP-2"] }).codes[0], "VIP-1");
  assert.throws(() => parsePromotionDuplicateRequest({ expectedVersion: 1, name: "Kopya", codes: Array.from({ length: 10_001 }, (_, index) => `C${index}`) }));
  assert.deepEqual(parsePromotionLifecycleTargetRequest({ expectedVersion: 2, nextStatus: "scheduled" }), { expectedVersion: 2, nextStatus: "scheduled" });
  assert.throws(() => parsePromotionLifecycleTargetRequest({ expectedVersion: 2, nextStatus: "paused" }));
  assert.equal(parsePromotionSimulationRequest({ promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: rule(), context: context() }).context.salesChannel, "storefront");
  assert.throws(() => parsePromotionSimulationRequest({ promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: rule(), context: { ...context(), storeId: STORE } }));
  assert.throws(() => parsePromotionSimulationRequest({ promotionId: PROMOTION, expectedVersion: null, name: "Taslak", ruleDocument: rule(), context: { ...context(), salesChannel: "online" } }));
  assert.deepEqual(parsePromotionCheckRequest({ ruleDocument: rule() }), { ruleDocument: rule() });
  assert.deepEqual(parsePromotionCheckRequest({ promotionId: PROMOTION, expectedVersion: 2, ruleDocument: rule() }), { promotionId: PROMOTION, expectedVersion: 2, ruleDocument: rule() });
  assert.throws(() => parsePromotionCheckRequest({ promotionId: PROMOTION, ruleDocument: rule() }));
});

test("picker and code-batch request contracts are bounded and exact", () => {
  assert.deepEqual(parsePromotionTargetResolveRequest({ kind: "product", ids: [PROMOTION, STORE] }), { kind: "product", ids: [STORE, PROMOTION] });
  assert.throws(() => parsePromotionTargetResolveRequest({ kind: "product", ids: [] }));
  assert.deepEqual(parsePromotionBatchCreateRequest({ count: 10_000, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null }), { count: 10_000, prefix: "VIP_", codeLength: 24, perCustomerUsage: 1, expiresAt: null });
  assert.throws(() => parsePromotionBatchCreateRequest({ count: 1, prefix: "VIP_", codeLength: 16, perCustomerUsage: 1, expiresAt: null }));
  assert.deepEqual(parsePromotionBatchStatusRequest({ expectedVersion: 1, nextStatus: "revoked" }), { expectedVersion: 1, nextStatus: "revoked" });
});

test("mutation result envelopes preserve replay without accepting hostile shapes", () => {
  assert.deepEqual(parsePromotionMutationEnvelope({ promotion: detail(), replayed: false }), { promotion: detail(), replayed: false });
  assert.deepEqual(parsePromotionCodeBatchMutationEnvelope({ batch: batch(), replayed: true }), { batch: batch(), replayed: true });
  assert.throws(() => parsePromotionMutationEnvelope({ promotion: detail(), replayed: false, extra: true }));
  let reads = 0;
  const hostile = { replayed: false } as Record<string, unknown>;
  Object.defineProperty(hostile, "promotion", { enumerable: true, get() { reads += 1; return detail(); } });
  assert.throws(() => parsePromotionMutationEnvelope(hostile));
  assert.equal(reads, 0);
});

test("safe promotion errors include the full finite Customer Panel code set", () => {
  for (const code of ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "origin_denied", "not_found", "method_not_allowed", "version_conflict", "operation_mismatch", "invalid_reference", "code_conflict", "active_code_batches", "invalid_transition", "promotion_limit_reached", "publish_blocked", "conflict", "promotion_unavailable"]) {
    assert.equal(PROMOTION_ERROR_CODES.includes(code as never), true, code);
  }
});

test("admin SQL result parsers close list, checks, pickers and pages", () => {
  const listItem = {
    id: PROMOTION, version: 1, name: "Atlas", status: "draft", effectiveStatus: "draft", triggerKind: "code",
    benefitKind: "percentage", audienceMode: "everyone", humanMechanic: "%10 indirim", startsAt: null, endsAt: null,
    usage: { used: 0, budgetMinor: 0 }, financials: [{ currency: "TRY", redemptions: 1, discountMinor: 10, revenueMinor: 90 }],
    activeCodeCount: 1, createdAt: "2026-09-05T12:00:00.000000Z", updatedAt: "2026-09-05T12:00:00.000000Z",
  };
  assert.equal(parsePromotionAdminListPage({ items: [listItem], hasMore: true, snapshotAt: "2026-09-05T12:00:00.000000Z", cursorAnchor: { createdAt: listItem.createdAt, id: PROMOTION } }, 1).items[0]?.id, PROMOTION);
  assert.throws(() => parsePromotionAdminListPage({ items: [listItem], hasMore: false, snapshotAt: "2026-09-05T11:59:59.999999Z", cursorAnchor: null }, 1));
  assert.throws(() => parsePromotionAdminListPage({ items: [listItem, { ...listItem, createdAt: "2026-09-05T11:59:59.999999Z", updatedAt: "2026-09-05T11:59:59.999999Z" }], hasMore: false, snapshotAt: "2026-09-05T12:00:00.000000Z", cursorAnchor: null }, 2));
  for (const contradictory of [
    { ...listItem, status: "archived", effectiveStatus: "active" },
    { ...listItem, status: "active", effectiveStatus: "active", endsAt: NOW },
    { ...listItem, status: "active", effectiveStatus: "active", startsAt: "2026-09-05T12:00:00.001Z" },
  ]) assert.throws(() => parsePromotionAdminListPage({ items: [contradictory], hasMore: false, snapshotAt: "2026-09-05T12:00:00.000000Z", cursorAnchor: null }, 1));
  assert.equal(parsePromotionAdminListPage({ items: [{ ...listItem, status: "active", effectiveStatus: "usage_exhausted" }], hasMore: false, snapshotAt: "2026-09-05T12:00:00.000000Z", cursorAnchor: null }, 1).items[0]?.effectiveStatus, "usage_exhausted");

  const readiness = { blocking: true, findings: [{ code: "schedule_ended", severity: "blocking", relatedPromotionId: null, relatedPromotionName: null }] };
  assert.deepEqual(parsePromotionConflictCheck(readiness), readiness);
  assert.equal(parsePromotionConflictCheck({ blocking: true, findings: [{ code: "discount_may_exceed_item_price", severity: "warning", relatedPromotionId: null, relatedPromotionName: null }, readiness.findings[0]] }).findings.length, 2);
  assert.throws(() => parsePromotionConflictCheck({ ...readiness, findings: [{ ...readiness.findings[0], code: "private" }] }));
  assert.deepEqual(parsePromotionConflictCheck({ blocking: false, findings: [{ code: "schedule_target_overlap", severity: "warning", relatedPromotionId: PROMOTION, relatedPromotionName: "Atlas" }] }), { blocking: false, findings: [{ code: "schedule_target_overlap", severity: "warning", relatedPromotionId: PROMOTION, relatedPromotionName: "Atlas" }] });
  for (const finding of [
    { code: "budget_zero", severity: "warning", relatedPromotionId: null, relatedPromotionName: null },
    { code: "schedule_target_overlap", severity: "warning", relatedPromotionId: null, relatedPromotionName: null },
    { code: "schedule_target_overlap", severity: "blocking", relatedPromotionId: PROMOTION, relatedPromotionName: "Atlas" },
    { code: "discount_may_exceed_item_price", severity: "warning", relatedPromotionId: PROMOTION, relatedPromotionName: "Atlas" },
    { code: "schedule_ended", severity: "blocking", relatedPromotionId: PROMOTION, relatedPromotionName: "Atlas" },
  ]) assert.throws(() => parsePromotionConflictCheck({ blocking: finding.severity === "blocking", findings: [finding] }), String(finding.code));
  const margin = { blocking: false, status: "unknown", summary: { evaluatedVariantCount: 1, knownCostVariantCount: 0, unknownCostVariantCount: 1, atRiskVariantCount: 0 }, findings: [{ code: "cost_unknown", severity: "warning", count: 1, sampleVariantIds: [PROMOTION] }] };
  assert.deepEqual(parsePromotionMarginCheck(margin), margin);

  const picker = { kind: "product", id: PROMOTION, label: "İndirim", status: "active" };
  assert.equal(parsePromotionPickerList({ items: [picker], hasMore: true, cursorAnchor: { sortKey: "indirim", id: PROMOTION } }, "product", 1).items[0]?.label, "İndirim");
  assert.deepEqual(parsePromotionPickerResolve({ items: [picker] }, "product", [PROMOTION]), [picker]);
  assert.throws(() => parsePromotionPickerResolve({ items: [{ ...picker, kind: "variant" }] }, "product", [PROMOTION]));
  const masked = { kind: "masked_customer", id: PROMOTION, label: "Maskeli müşteri ••••0001", status: "active" } as const;
  assert.deepEqual(parsePromotionPickerResolve({ items: [masked] }, "masked_customer", [PROMOTION]), [masked]);
  for (const label of ["Ayşe Yılmaz", "ayse@example.com", "Maskeli müşteri ••••0002"]) {
    assert.throws(() => parsePromotionPickerResolve({ items: [{ ...masked, label }] }, "masked_customer", [PROMOTION]), label);
  }
});

test("admin SQL result parsers bound CSV, analytics and legacy envelopes", () => {
  assert.deepEqual(parsePromotionCsvExport({ rows: [{ code: "ATLAS", status: "active" }] }), { rows: [{ code: "ATLAS", status: "active" }] });
  assert.throws(() => parsePromotionCsvExport({ rows: [] }));
  assert.throws(() => parsePromotionCsvExport({ rows: [{ code: "=SUM(1)", status: "active" }] }));
  assert.deepEqual(parsePromotionAdminAnalyticsResult({ items: [{ currency: "TRY", redemptions: Number.MAX_SAFE_INTEGER, discountMinor: Number.MAX_SAFE_INTEGER, revenueMinor: Number.MAX_SAFE_INTEGER, conversionBps: 10_000 }] }).items[0]?.currency, "TRY");
  assert.throws(() => parsePromotionAdminAnalyticsResult({ items: [{ currency: "TRY", redemptions: -1, discountMinor: 0, revenueMinor: 0, conversionBps: 0 }] }));
  const legacy = { legacyRecordId: PROMOTION, promotionId: null, reason: "invalid_code" };
  assert.deepEqual(parsePromotionLegacyPage({ items: [legacy], hasMore: true, snapshotAt: NOW, cursorAnchor: { createdAt: NOW, id: PROMOTION } }, 1).items, [legacy]);
  assert.throws(() => parsePromotionLegacyPage({ items: [legacy, legacy], hasMore: false, snapshotAt: NOW, cursorAnchor: null }, 2));
});

test("promotion overview and detailed analytics remain period-bound and financial-source exact", () => {
  const overview = { periodDays: 30, activePromotions: 2, currencies: [{ currency: "TRY", affectedOrders: 3, discountMinor: 1_000, revenueMinor: 9_000, recoveredOrders: 1, recoveredRevenueMinor: 3_000 }] };
  assert.deepEqual(parsePromotionAnalyticsQuery({ days: 30 }), { days: 30 });
  for (const days of [0, 8, 365]) assert.throws(() => parsePromotionAnalyticsQuery({ days }));
  assert.deepEqual(parsePromotionOverviewResult(overview), overview);
  const detail = { periodDays: 30, currencies: [{ currency: "TRY", usageCount: 4, affectedOrders: 3, discountMinor: 1_000, grossRevenueMinor: 10_000, netRevenueMinor: 9_000, averageOrderMinor: 3_000, newCustomerOrders: 1, recoveredOrders: 1, recoveredRevenueMinor: 3_000 }], attribution: [{ source: "atlas", medium: "qa", campaign: null, currency: "TRY", orders: 3, revenueMinor: 9_000 }], topProducts: [{ productId: PROMOTION, label: "Ürün", currency: "TRY", quantity: 2, revenueMinor: 5_000 }], topCategories: [{ categoryId: null, label: "Kategorisiz", currency: "TRY", quantity: 2, revenueMinor: 5_000 }] };
  assert.deepEqual(parsePromotionAnalyticsDetailResult(detail), detail);
  assert.throws(() => parsePromotionAnalyticsDetailResult({ ...detail, currencies: [{ ...detail.currencies[0], privateRevenue: 1 }] }));
});
