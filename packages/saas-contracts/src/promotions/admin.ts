import {
  normalizePromotionCode,
  parsePromotionCodeBatch,
  parsePromotionDetail,
  parsePromotionEvaluatorContext,
  parsePromotionLegacyProjection,
  parsePromotionRuleDocument,
} from "./validation.ts";
import type {
  PromotionAudienceMode,
  PromotionBenefitKind,
  PromotionCodeBatch,
  PromotionDetail,
  PromotionEvaluatorContext,
  PromotionLegacyProjection,
  PromotionRuleDocument,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MICROSECOND_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const UNPAIRED_SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u;
const UTF8 = new TextEncoder();

export const PROMOTION_ADMIN_EFFECTIVE_STATUSES = Object.freeze([
  "draft", "scheduled", "active", "paused", "usage_exhausted", "budget_exhausted", "ended", "archived",
] as const);
export const PROMOTION_PICKER_KINDS = Object.freeze([
  "product", "variant", "category", "brand", "collection", "customer_segment", "customer_tag",
  "masked_customer", "abandoned_cart", "payment_method", "shipping_method",
] as const);
export type PromotionAdminEffectiveStatus = (typeof PROMOTION_ADMIN_EFFECTIVE_STATUSES)[number];
export type PromotionPickerKind = (typeof PROMOTION_PICKER_KINDS)[number];
export type PromotionAdminEvaluatorContext = Omit<PromotionEvaluatorContext, "storeId" | "salesChannel"> & Readonly<{ salesChannel: "storefront" | "quick_order" }>;

export interface PromotionAdminListQuery {
  readonly limit: number;
  readonly cursor?: string;
  readonly search?: string;
  readonly effectiveStatuses?: readonly PromotionAdminEffectiveStatus[];
  readonly triggerKinds?: readonly ("automatic" | "code")[];
  readonly benefitKinds?: readonly PromotionBenefitKind[];
  readonly audienceModes?: readonly PromotionAudienceMode[];
  readonly scheduleFrom?: string;
  readonly scheduleTo?: string;
}
export interface PromotionCreateRequest { readonly name: string; readonly ruleDocument: PromotionRuleDocument }
export interface PromotionUpdateRequest extends PromotionCreateRequest { readonly expectedVersion: number }
export interface PromotionVersionRequest { readonly expectedVersion: number }
export interface PromotionLifecycleTargetRequest extends PromotionVersionRequest { readonly nextStatus: "active" | "scheduled" }
export interface PromotionDuplicateRequest extends PromotionVersionRequest { readonly name: string; readonly codes: readonly string[] }
export interface PromotionSimulationRequest extends PromotionCreateRequest { readonly promotionId: string; readonly expectedVersion: number | null; readonly context: PromotionAdminEvaluatorContext }
export type PromotionCheckRequest = Readonly<{ ruleDocument: PromotionRuleDocument }> | Readonly<{ promotionId: string; expectedVersion: number; ruleDocument: PromotionRuleDocument }>;
export interface PromotionTargetListQuery { readonly kind: PromotionPickerKind; readonly limit: number; readonly cursor?: string; readonly search?: string }
export interface PromotionTargetResolveRequest { readonly kind: PromotionPickerKind; readonly ids: readonly string[] }
export interface PromotionPageQuery { readonly limit: number; readonly cursor?: string }
export interface PromotionBatchCreateRequest { readonly count: number; readonly prefix: string; readonly codeLength: number; readonly perCustomerUsage: number; readonly expiresAt: string | null }
export interface PromotionBatchStatusRequest extends PromotionVersionRequest { readonly nextStatus: "active" | "paused" | "revoked" }
export interface PromotionMutationEnvelope { readonly promotion: PromotionDetail; readonly replayed: boolean }
export interface PromotionCodeBatchMutationEnvelope { readonly batch: PromotionCodeBatch; readonly replayed: boolean }
export interface PromotionAdminListItem {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly status: PromotionDetail["status"];
  readonly effectiveStatus: PromotionAdminEffectiveStatus;
  readonly triggerKind: "automatic" | "code";
  readonly benefitKind: PromotionBenefitKind;
  readonly audienceMode: PromotionAudienceMode;
  readonly humanMechanic: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly usage: Readonly<{ used: number; budgetMinor: number }>;
  readonly financials: readonly Readonly<{ currency: string; redemptions: number; discountMinor: number; revenueMinor: number }>[];
  readonly activeCodeCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface PromotionAdminListPage {
  readonly items: readonly PromotionAdminListItem[];
  readonly hasMore: boolean;
  readonly snapshotAt: string;
  readonly cursorAnchor: Readonly<{ createdAt: string; id: string }> | null;
}
export type PromotionConflictCode =
  | "benefit_currency_mismatch" | "budget_zero" | "coupon_code_conflict" | "customer_usage_limit_zero"
  | "gift_stock_unavailable" | "margin_percentage_zero" | "no_eligible_catalog_items" | "order_maximum_zero"
  | "reference_unavailable" | "schedule_ended" | "target_include_exclude_conflict" | "usage_limit_zero"
  | "schedule_target_overlap" | "discount_may_exceed_item_price";
export interface PromotionConflictFinding { readonly code: PromotionConflictCode; readonly severity: "blocking" | "warning"; readonly relatedPromotionId: string | null; readonly relatedPromotionName: string | null }
export interface PromotionConflictCheck { readonly blocking: boolean; readonly findings: readonly PromotionConflictFinding[] }
export interface PromotionMarginFinding { readonly code: "below_cost_risk" | "cost_unknown"; readonly severity: "warning"; readonly count: number; readonly sampleVariantIds: readonly string[] }
export interface PromotionMarginCheck { readonly blocking: false; readonly status: "clear" | "warning" | "unknown"; readonly summary: Readonly<{ evaluatedVariantCount: number; knownCostVariantCount: number; unknownCostVariantCount: number; atRiskVariantCount: number }>; readonly findings: readonly PromotionMarginFinding[] }
export interface PromotionPickerItem { readonly kind: PromotionPickerKind; readonly id: string; readonly label: string; readonly status: "active" | "unavailable" }
export interface PromotionPickerList { readonly items: readonly PromotionPickerItem[]; readonly hasMore: boolean; readonly cursorAnchor: Readonly<{ sortKey: string; id: string }> | null }
export interface PromotionCsvExport { readonly rows: readonly Readonly<{ code: string; status: "active" | "paused" | "revoked" }>[] }
export interface PromotionAdminAnalyticsItem { readonly currency: string; readonly redemptions: number; readonly discountMinor: number; readonly revenueMinor: number; readonly conversionBps: number }
export interface PromotionAdminAnalyticsResult { readonly items: readonly PromotionAdminAnalyticsItem[] }
export type PromotionAnalyticsPeriodDays = 7 | 30 | 90;
export interface PromotionAnalyticsQuery { readonly days: PromotionAnalyticsPeriodDays }
export interface PromotionOverviewResult {
  readonly periodDays: PromotionAnalyticsPeriodDays;
  readonly activePromotions: number;
  readonly currencies: readonly Readonly<{ currency: string; affectedOrders: number; discountMinor: number; revenueMinor: number; recoveredOrders: number; recoveredRevenueMinor: number }>[];
}
export interface PromotionAnalyticsDetailResult {
  readonly periodDays: PromotionAnalyticsPeriodDays;
  readonly currencies: readonly Readonly<{ currency: string; usageCount: number; affectedOrders: number; discountMinor: number; grossRevenueMinor: number; netRevenueMinor: number; averageOrderMinor: number; newCustomerOrders: number; recoveredOrders: number; recoveredRevenueMinor: number }>[];
  readonly attribution: readonly Readonly<{ source: string; medium: string; campaign: string | null; currency: string; orders: number; revenueMinor: number }>[];
  readonly topProducts: readonly Readonly<{ productId: string | null; label: string; currency: string; quantity: number; revenueMinor: number }>[];
  readonly topCategories: readonly Readonly<{ categoryId: string | null; label: string; currency: string; quantity: number; revenueMinor: number }>[];
}
export interface PromotionLegacyPage { readonly items: readonly PromotionLegacyProjection[]; readonly hasMore: boolean; readonly snapshotAt: string; readonly cursorAnchor: Readonly<{ createdAt: string; id: string }> | null }

type Input = Readonly<Record<string, unknown>>;
function invalid(): never { throw new TypeError("promotion_admin_contract_invalid"); }
function guarded<T>(operation: () => T): T { try { return operation(); } catch { return invalid(); } }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Input {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output[key] = descriptor.value;
  }
  return output;
}
function array<T>(value: unknown, minimum: number, maximum: number, parser: (entry: unknown) => T): readonly T[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < minimum || value.length > maximum) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value), output: T[] = [];
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    output.push(parser(descriptor.value));
  }
  return Object.freeze(output);
}
function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}
function text(value: unknown, minimum: number, maximum: number, byteMaximum = Number.MAX_SAFE_INTEGER): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || UNPAIRED_SURROGATE.test(value) || UTF8.encode(value).byteLength > byteMaximum) invalid();
  return value;
}
function uuid(value: unknown): string { const selected = text(value, 36, 36, 36); if (!UUID.test(selected)) invalid(); return selected; }
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO.test(value)) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid();
  return value;
}
function microsecondTimestamp(value: unknown): string {
  if (typeof value !== "string" || !MICROSECOND_ISO.test(value)) invalid();
  const milliseconds = `${value.slice(0, 23)}Z`;
  const parsed = new Date(milliseconds);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== milliseconds) invalid();
  return value;
}
function cursor(value: unknown): string { const selected = text(value, 1, 2_048, 2_048); if (!CURSOR.test(selected)) invalid(); return selected; }
function interactiveRule(value: unknown): PromotionRuleDocument {
  const parsed = parsePromotionRuleDocument(value);
  if (parsed.trigger.kind === "code" && parsed.trigger.codes.length > 100) invalid();
  return parsed;
}
function name(value: unknown): string { return text(value, 1, 200, 800); }
function adminContext(value: unknown): PromotionAdminEvaluatorContext {
  const input = exact(value, [
    "customerId", "paidOrderCount", "customerSegmentIds", "customerTagIds", "cartLines", "shippingMethodId",
    "paymentMethodId", "shippingBeforeDiscountMinor", "currency", "storeLocalTime", "salesChannel", "submittedCodes",
    "abandonedCart",
  ]);
  if (input.salesChannel !== "storefront" && input.salesChannel !== "quick_order") invalid();
  const parsed = parsePromotionEvaluatorContext({ ...input, storeId: "00000000-0000-4000-8000-000000000001" });
  const { storeId: _storeId, ...publicContext } = parsed;
  return Object.freeze(publicContext as PromotionAdminEvaluatorContext);
}
function set<T extends string>(value: unknown, allowed: readonly T[], maximum: number): readonly T[] {
  const parsed = array(value, 0, maximum, (entry) => {
    if (typeof entry !== "string" || !allowed.includes(entry as T)) invalid();
    return entry as T;
  });
  if (new Set(parsed).size !== parsed.length) invalid();
  return Object.freeze([...parsed].sort());
}
function byteCompare(left: string, right: string): number {
  const a = UTF8.encode(left), b = UTF8.encode(right), length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a[index]! - b[index]!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}
function currency(value: unknown): string { const selected = text(value, 3, 3, 3); if (!/^[A-Z]{3}$/.test(selected)) invalid(); return selected; }
function boolean(value: unknown): boolean { if (value !== true && value !== false) invalid(); return value; }

export function parsePromotionAdminListQuery(value: unknown): PromotionAdminListQuery {
  return guarded(() => {
    const input = exact(value, ["limit"], ["cursor", "search", "effectiveStatuses", "triggerKinds", "benefitKinds", "audienceModes", "scheduleFrom", "scheduleTo"]);
    if (Object.hasOwn(input, "scheduleFrom") !== Object.hasOwn(input, "scheduleTo")) invalid();
    const scheduleFrom = Object.hasOwn(input, "scheduleFrom") ? timestamp(input.scheduleFrom) : undefined;
    const scheduleTo = Object.hasOwn(input, "scheduleTo") ? timestamp(input.scheduleTo) : undefined;
    if (scheduleFrom !== undefined && scheduleTo !== undefined && scheduleFrom >= scheduleTo) invalid();
    return Object.freeze({
      limit: integer(input.limit, 1, 100),
      ...(Object.hasOwn(input, "cursor") ? { cursor: cursor(input.cursor) } : {}),
      ...(Object.hasOwn(input, "search") ? { search: text(input.search, 1, 100, 400) } : {}),
      ...(Object.hasOwn(input, "effectiveStatuses") ? { effectiveStatuses: set(input.effectiveStatuses, PROMOTION_ADMIN_EFFECTIVE_STATUSES, 8) } : {}),
      ...(Object.hasOwn(input, "triggerKinds") ? { triggerKinds: set(input.triggerKinds, ["automatic", "code"] as const, 2) } : {}),
      ...(Object.hasOwn(input, "benefitKinds") ? { benefitKinds: set(input.benefitKinds, ["percentage", "fixed_amount", "free_shipping", "buy_x_get_y", "quantity_tiers", "bundle_price", "gift"] as const, 7) } : {}),
      ...(Object.hasOwn(input, "audienceModes") ? { audienceModes: set(input.audienceModes, ["everyone", "first_paid_order", "customer_segments", "customer_tags", "masked_customers", "abandoned_cart"] as const, 6) } : {}),
      ...(scheduleFrom === undefined ? {} : { scheduleFrom, scheduleTo: scheduleTo! }),
    });
  });
}

export function parsePromotionCreateRequest(value: unknown): PromotionCreateRequest { return guarded(() => { const input = exact(value, ["name", "ruleDocument"]); return Object.freeze({ name: name(input.name), ruleDocument: interactiveRule(input.ruleDocument) }); }); }
export function parsePromotionUpdateRequest(value: unknown): PromotionUpdateRequest { return guarded(() => { const input = exact(value, ["expectedVersion", "name", "ruleDocument"]); return Object.freeze({ expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER), name: name(input.name), ruleDocument: interactiveRule(input.ruleDocument) }); }); }
export function parsePromotionVersionRequest(value: unknown): PromotionVersionRequest { return guarded(() => { const input = exact(value, ["expectedVersion"]); return Object.freeze({ expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER) }); }); }
export function parsePromotionLifecycleTargetRequest(value: unknown): PromotionLifecycleTargetRequest { return guarded(() => { const input = exact(value, ["expectedVersion", "nextStatus"]); if (input.nextStatus !== "active" && input.nextStatus !== "scheduled") invalid(); return Object.freeze({ expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER), nextStatus: input.nextStatus }); }); }
export function parsePromotionDuplicateRequest(value: unknown): PromotionDuplicateRequest { return guarded(() => { const input = exact(value, ["expectedVersion", "name", "codes"]); const codes = array(input.codes, 0, 10_000, normalizePromotionCode); if (new Set(codes).size !== codes.length) invalid(); return Object.freeze({ expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER), name: name(input.name), codes: Object.freeze([...codes].sort()) }); }); }
export function parsePromotionSimulationRequest(value: unknown): PromotionSimulationRequest { return guarded(() => { const input = exact(value, ["promotionId", "expectedVersion", "name", "ruleDocument", "context"]); const expectedVersion = input.expectedVersion === null ? null : integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER); return Object.freeze({ promotionId: uuid(input.promotionId), expectedVersion, name: name(input.name), ruleDocument: interactiveRule(input.ruleDocument), context: adminContext(input.context) }); }); }
export function parsePromotionCheckRequest(value: unknown): PromotionCheckRequest { return guarded(() => { const input = exact(value, ["ruleDocument"], ["promotionId", "expectedVersion"]); if (Object.hasOwn(input, "promotionId") !== Object.hasOwn(input, "expectedVersion")) invalid(); const ruleDocument = interactiveRule(input.ruleDocument); return Object.hasOwn(input, "promotionId") ? Object.freeze({ promotionId: uuid(input.promotionId), expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER), ruleDocument }) : Object.freeze({ ruleDocument }); }); }
export function parsePromotionTargetListQuery(value: unknown): PromotionTargetListQuery { return guarded(() => { const input = exact(value, ["kind", "limit"], ["cursor", "search"]); if (typeof input.kind !== "string" || !PROMOTION_PICKER_KINDS.includes(input.kind as PromotionPickerKind)) invalid(); return Object.freeze({ kind: input.kind as PromotionPickerKind, limit: integer(input.limit, 1, 50), ...(Object.hasOwn(input, "cursor") ? { cursor: cursor(input.cursor) } : {}), ...(Object.hasOwn(input, "search") ? { search: text(input.search, 1, 100, 400) } : {}) }); }); }
export function parsePromotionTargetResolveRequest(value: unknown): PromotionTargetResolveRequest { return guarded(() => { const input = exact(value, ["kind", "ids"]); if (typeof input.kind !== "string" || !PROMOTION_PICKER_KINDS.includes(input.kind as PromotionPickerKind)) invalid(); const ids = array(input.ids, 1, 500, uuid); if (new Set(ids).size !== ids.length) invalid(); return Object.freeze({ kind: input.kind as PromotionPickerKind, ids: Object.freeze([...ids].sort()) }); }); }
export function parsePromotionPageQuery(value: unknown): PromotionPageQuery { return guarded(() => { const input = exact(value, ["limit"], ["cursor"]); return Object.freeze({ limit: integer(input.limit, 1, 100), ...(Object.hasOwn(input, "cursor") ? { cursor: cursor(input.cursor) } : {}) }); }); }
export function parsePromotionBatchCreateRequest(value: unknown): PromotionBatchCreateRequest { return guarded(() => { const input = exact(value, ["count", "prefix", "codeLength", "perCustomerUsage", "expiresAt"]); const prefix = text(input.prefix, 0, 20, 20); if (!/^(|[A-Z0-9][A-Z0-9_-]{0,19})$/.test(prefix)) invalid(); const codeLength = integer(input.codeLength, 16, 64); if (codeLength - prefix.length < 16) invalid(); const expiresAt = input.expiresAt === null ? null : timestamp(input.expiresAt); return Object.freeze({ count: integer(input.count, 1, 10_000), prefix, codeLength, perCustomerUsage: integer(input.perCustomerUsage, 1, 1_000_000), expiresAt }); }); }
export function parsePromotionBatchStatusRequest(value: unknown): PromotionBatchStatusRequest { return guarded(() => { const input = exact(value, ["expectedVersion", "nextStatus"]); if (input.nextStatus !== "active" && input.nextStatus !== "paused" && input.nextStatus !== "revoked") invalid(); return Object.freeze({ expectedVersion: integer(input.expectedVersion, 1, Number.MAX_SAFE_INTEGER), nextStatus: input.nextStatus }); }); }
export function parsePromotionMutationEnvelope(value: unknown): PromotionMutationEnvelope { return guarded(() => { const input = exact(value, ["promotion", "replayed"]); if (input.replayed !== true && input.replayed !== false) invalid(); return Object.freeze({ promotion: parsePromotionDetail(input.promotion), replayed: input.replayed }); }); }
export function parsePromotionCodeBatchMutationEnvelope(value: unknown): PromotionCodeBatchMutationEnvelope { return guarded(() => { const input = exact(value, ["batch", "replayed"]); if (input.replayed !== true && input.replayed !== false) invalid(); return Object.freeze({ batch: parsePromotionCodeBatch(input.batch), replayed: input.replayed }); }); }

function parseAdminListItem(value: unknown): PromotionAdminListItem {
  const input = exact(value, [
    "id", "version", "name", "status", "effectiveStatus", "triggerKind", "benefitKind", "audienceMode",
    "humanMechanic", "startsAt", "endsAt", "usage", "financials", "activeCodeCount", "createdAt", "updatedAt",
  ]);
  if (typeof input.status !== "string" || !["draft", "scheduled", "active", "paused", "archived"].includes(input.status)) invalid();
  if (typeof input.effectiveStatus !== "string" || !PROMOTION_ADMIN_EFFECTIVE_STATUSES.includes(input.effectiveStatus as PromotionAdminEffectiveStatus)) invalid();
  if (input.triggerKind !== "automatic" && input.triggerKind !== "code") invalid();
  if (typeof input.benefitKind !== "string" || !["percentage", "fixed_amount", "free_shipping", "buy_x_get_y", "quantity_tiers", "bundle_price", "gift"].includes(input.benefitKind)) invalid();
  if (typeof input.audienceMode !== "string" || !["everyone", "first_paid_order", "customer_segments", "customer_tags", "masked_customers", "abandoned_cart"].includes(input.audienceMode)) invalid();
  const usage = exact(input.usage, ["used", "budgetMinor"]);
  const financials = array(input.financials, 0, 256, (entry) => {
    const row = exact(entry, ["currency", "redemptions", "discountMinor", "revenueMinor"]);
    return Object.freeze({
      currency: currency(row.currency),
      redemptions: integer(row.redemptions, 0, Number.MAX_SAFE_INTEGER),
      discountMinor: integer(row.discountMinor, 0, Number.MAX_SAFE_INTEGER),
      revenueMinor: integer(row.revenueMinor, 0, Number.MAX_SAFE_INTEGER),
    });
  });
  for (let index = 1; index < financials.length; index += 1) if (byteCompare(financials[index - 1]!.currency, financials[index]!.currency) >= 0) invalid();
  const activeCodeCount = integer(input.activeCodeCount, 0, Number.MAX_SAFE_INTEGER);
  if (input.triggerKind === "automatic" && activeCodeCount !== 0) invalid();
  const createdAt = microsecondTimestamp(input.createdAt), updatedAt = microsecondTimestamp(input.updatedAt);
  if (updatedAt < createdAt) invalid();
  const startsAt = input.startsAt === null ? null : timestamp(input.startsAt);
  const endsAt = input.endsAt === null ? null : timestamp(input.endsAt);
  if (startsAt !== null && endsAt !== null && startsAt >= endsAt) invalid();
  return Object.freeze({
    id: uuid(input.id), version: integer(input.version, 1, Number.MAX_SAFE_INTEGER), name: text(input.name, 1, 200, 800),
    status: input.status as PromotionDetail["status"], effectiveStatus: input.effectiveStatus as PromotionAdminEffectiveStatus,
    triggerKind: input.triggerKind, benefitKind: input.benefitKind as PromotionBenefitKind,
    audienceMode: input.audienceMode as PromotionAudienceMode, humanMechanic: text(input.humanMechanic, 1, 500, 2_000),
    startsAt, endsAt,
    usage: Object.freeze({ used: integer(usage.used, 0, Number.MAX_SAFE_INTEGER), budgetMinor: integer(usage.budgetMinor, 0, Number.MAX_SAFE_INTEGER) }),
    financials, activeCodeCount, createdAt, updatedAt,
  });
}

export function parsePromotionAdminListItem(value: unknown): PromotionAdminListItem {
  return guarded(() => parseAdminListItem(value));
}

export function parsePromotionAdminListPage(value: unknown, limit = 100): PromotionAdminListPage {
  return guarded(() => {
    const maximum = integer(limit, 1, 100), input = exact(value, ["items", "hasMore", "snapshotAt", "cursorAnchor"]);
    const hasMore = boolean(input.hasMore), snapshotAt = microsecondTimestamp(input.snapshotAt);
    const items = array(input.items, 0, maximum, parsePromotionAdminListItem);
    if (items.some((item) => item.createdAt > snapshotAt) || new Set(items.map((item) => item.id)).size !== items.length) invalid();
    for (const item of items) {
      const startsAt = item.startsAt === null ? null : `${item.startsAt.slice(0, 23)}000Z`;
      const endsAt = item.endsAt === null ? null : `${item.endsAt.slice(0, 23)}000Z`;
      if (item.status === "draft" || item.status === "paused" || item.status === "archived") {
        if (item.effectiveStatus !== item.status) invalid();
      } else if (endsAt !== null && endsAt <= snapshotAt) {
        if (item.effectiveStatus !== "ended") invalid();
      } else if (startsAt !== null && startsAt > snapshotAt) {
        if (item.effectiveStatus !== "scheduled") invalid();
      } else if (item.effectiveStatus !== "active" && item.effectiveStatus !== "usage_exhausted" && item.effectiveStatus !== "budget_exhausted") invalid();
    }
    for (let index = 1; index < items.length; index += 1) {
      const previous = items[index - 1]!, current = items[index]!;
      if (previous.createdAt < current.createdAt || (previous.createdAt === current.createdAt && previous.id <= current.id)) invalid();
    }
    if (!hasMore) {
      if (input.cursorAnchor !== null) invalid();
      return Object.freeze({ items, hasMore, snapshotAt, cursorAnchor: null });
    }
    if (items.length !== maximum || input.cursorAnchor === null) invalid();
    const rawAnchor = exact(input.cursorAnchor, ["createdAt", "id"]);
    const cursorAnchor = Object.freeze({ createdAt: microsecondTimestamp(rawAnchor.createdAt), id: uuid(rawAnchor.id) });
    const last = items.at(-1)!;
    if (cursorAnchor.createdAt !== last.createdAt || cursorAnchor.id !== last.id || cursorAnchor.createdAt > snapshotAt) invalid();
    return Object.freeze({ items, hasMore, snapshotAt, cursorAnchor });
  });
}

const CONFLICT_CODES = Object.freeze([
  "benefit_currency_mismatch", "budget_zero", "coupon_code_conflict", "customer_usage_limit_zero",
  "gift_stock_unavailable", "margin_percentage_zero", "no_eligible_catalog_items", "order_maximum_zero",
  "reference_unavailable", "schedule_ended", "target_include_exclude_conflict", "usage_limit_zero",
  "schedule_target_overlap", "discount_may_exceed_item_price",
] as const);
export function parsePromotionConflictCheck(value: unknown): PromotionConflictCheck {
  return guarded(() => {
    const input = exact(value, ["blocking", "findings"]), blocking = boolean(input.blocking);
    const findings = array(input.findings, 0, 100, (entry): PromotionConflictFinding => {
      const row = exact(entry, ["code", "severity", "relatedPromotionId", "relatedPromotionName"]);
      if (typeof row.code !== "string" || !CONFLICT_CODES.includes(row.code as PromotionConflictCode)) invalid();
      if (row.severity !== "blocking" && row.severity !== "warning") invalid();
      const relatedPromotionId = row.relatedPromotionId === null ? null : uuid(row.relatedPromotionId);
      const relatedPromotionName = row.relatedPromotionName === null ? null : text(row.relatedPromotionName, 1, 200, 800);
      if ((relatedPromotionId === null) !== (relatedPromotionName === null)) invalid();
      if (row.code === "schedule_target_overlap") {
        if (row.severity !== "warning" || relatedPromotionId === null) invalid();
      } else if (row.code === "discount_may_exceed_item_price") {
        if (row.severity !== "warning" || relatedPromotionId !== null) invalid();
      } else if (row.severity !== "blocking" || relatedPromotionId !== null) invalid();
      return Object.freeze({ code: row.code as PromotionConflictCode, severity: row.severity, relatedPromotionId, relatedPromotionName });
    });
    if (blocking !== findings.some((finding) => finding.severity === "blocking")) invalid();
    for (let index = 1; index < findings.length; index += 1) {
      const previous = findings[index - 1]!, current = findings[index]!;
      const codeOrder = byteCompare(previous.code, current.code);
      if (codeOrder > 0 || (codeOrder === 0 && (previous.relatedPromotionId === current.relatedPromotionId || (previous.relatedPromotionId === null) || (current.relatedPromotionId !== null && previous.relatedPromotionId > current.relatedPromotionId)))) invalid();
    }
    return Object.freeze({ blocking, findings });
  });
}

export function parsePromotionMarginCheck(value: unknown): PromotionMarginCheck {
  return guarded(() => {
    const input = exact(value, ["blocking", "status", "summary", "findings"]);
    if (input.blocking !== false || (input.status !== "clear" && input.status !== "warning" && input.status !== "unknown")) invalid();
    const rawSummary = exact(input.summary, ["evaluatedVariantCount", "knownCostVariantCount", "unknownCostVariantCount", "atRiskVariantCount"]);
    const summary = Object.freeze({
      evaluatedVariantCount: integer(rawSummary.evaluatedVariantCount, 0, 1_000_000_000),
      knownCostVariantCount: integer(rawSummary.knownCostVariantCount, 0, 1_000_000_000),
      unknownCostVariantCount: integer(rawSummary.unknownCostVariantCount, 0, 1_000_000_000),
      atRiskVariantCount: integer(rawSummary.atRiskVariantCount, 0, 1_000_000_000),
    });
    if (summary.knownCostVariantCount + summary.unknownCostVariantCount !== summary.evaluatedVariantCount || summary.atRiskVariantCount > summary.knownCostVariantCount) invalid();
    const findings = array(input.findings, 0, 2, (entry): PromotionMarginFinding => {
      const row = exact(entry, ["code", "severity", "count", "sampleVariantIds"]);
      if ((row.code !== "below_cost_risk" && row.code !== "cost_unknown") || row.severity !== "warning") invalid();
      const count = integer(row.count, 1, 1_000_000_000), sampleVariantIds = array(row.sampleVariantIds, 0, 20, uuid);
      if (sampleVariantIds.length > count || new Set(sampleVariantIds).size !== sampleVariantIds.length) invalid();
      for (let index = 1; index < sampleVariantIds.length; index += 1) if (sampleVariantIds[index - 1]! >= sampleVariantIds[index]!) invalid();
      return Object.freeze({ code: row.code, severity: "warning", count, sampleVariantIds });
    });
    for (let index = 1; index < findings.length; index += 1) if (byteCompare(findings[index - 1]!.code, findings[index]!.code) >= 0) invalid();
    const risk = findings.find((finding) => finding.code === "below_cost_risk"), unknown = findings.find((finding) => finding.code === "cost_unknown");
    if ((risk?.count ?? 0) !== summary.atRiskVariantCount || (unknown?.count ?? 0) !== summary.unknownCostVariantCount) invalid();
    const expectedStatus = summary.atRiskVariantCount > 0 ? "warning" : summary.unknownCostVariantCount > 0 ? "unknown" : "clear";
    if (input.status !== expectedStatus) invalid();
    return Object.freeze({ blocking: false, status: input.status, summary, findings });
  });
}

function parsePickerItem(value: unknown, expectedKind: PromotionPickerKind, list: boolean): PromotionPickerItem {
  const input = exact(value, ["kind", "id", "label", "status"]);
  if (input.kind !== expectedKind || (input.status !== "active" && input.status !== "unavailable") || (list && input.status !== "active")) invalid();
  const id = uuid(input.id), label = text(input.label, 1, 500, 2_000);
  if (expectedKind === "masked_customer" && label !== `Maskeli müşteri ••••${id.replaceAll("-", "").slice(-4)}`) invalid();
  return Object.freeze({ kind: expectedKind, id, label, status: input.status });
}
export function parsePromotionPickerList(value: unknown, kind: PromotionPickerKind, limit = 50): PromotionPickerList {
  return guarded(() => {
    if (!PROMOTION_PICKER_KINDS.includes(kind)) invalid();
    const maximum = integer(limit, 1, 50), input = exact(value, ["items", "hasMore", "cursorAnchor"]), hasMore = boolean(input.hasMore);
    const items = array(input.items, 0, maximum, (entry) => parsePickerItem(entry, kind, true));
    if (new Set(items.map((item) => item.id)).size !== items.length) invalid();
    if (!hasMore) {
      if (input.cursorAnchor !== null) invalid();
      return Object.freeze({ items, hasMore, cursorAnchor: null });
    }
    if (items.length !== maximum || input.cursorAnchor === null) invalid();
    const rawAnchor = exact(input.cursorAnchor, ["sortKey", "id"]);
    const cursorAnchor = Object.freeze({ sortKey: text(rawAnchor.sortKey, 1, 500, 2_000), id: uuid(rawAnchor.id) });
    if (cursorAnchor.id !== items.at(-1)!.id) invalid();
    return Object.freeze({ items, hasMore, cursorAnchor });
  });
}
export function parsePromotionPickerResolve(value: unknown, kind: PromotionPickerKind, requestedIds: readonly string[]): readonly PromotionPickerItem[] {
  return guarded(() => {
    if (!PROMOTION_PICKER_KINDS.includes(kind)) invalid();
    const requested = new Set(array(requestedIds, 1, 500, uuid));
    if (requested.size !== requestedIds.length) invalid();
    const input = exact(value, ["items"]), items = array(input.items, 0, requested.size, (entry) => parsePickerItem(entry, kind, false));
    if (new Set(items.map((item) => item.id)).size !== items.length || items.some((item) => !requested.has(item.id))) invalid();
    return items;
  });
}

export function parsePromotionCsvExport(value: unknown): PromotionCsvExport {
  return guarded(() => {
    const input = exact(value, ["rows"]), rows = array(input.rows, 1, 10_000, (entry) => {
      const row = exact(entry, ["code", "status"]);
      if (row.status !== "active" && row.status !== "paused" && row.status !== "revoked") invalid();
      const normalized = normalizePromotionCode(row.code);
      if (normalized !== row.code) invalid();
      return Object.freeze({ code: normalized, status: row.status });
    });
    for (let index = 1; index < rows.length; index += 1) if (byteCompare(rows[index - 1]!.code, rows[index]!.code) >= 0) invalid();
    return Object.freeze({ rows });
  });
}
export function parsePromotionAdminAnalyticsResult(value: unknown): PromotionAdminAnalyticsResult {
  return guarded(() => {
    const input = exact(value, ["items"]), items = array(input.items, 0, 256, (entry): PromotionAdminAnalyticsItem => {
      const row = exact(entry, ["currency", "redemptions", "discountMinor", "revenueMinor", "conversionBps"]);
      return Object.freeze({ currency: currency(row.currency), redemptions: integer(row.redemptions, 0, Number.MAX_SAFE_INTEGER), discountMinor: integer(row.discountMinor, 0, Number.MAX_SAFE_INTEGER), revenueMinor: integer(row.revenueMinor, 0, Number.MAX_SAFE_INTEGER), conversionBps: integer(row.conversionBps, 0, 10_000) });
    });
    for (let index = 1; index < items.length; index += 1) if (byteCompare(items[index - 1]!.currency, items[index]!.currency) >= 0) invalid();
    return Object.freeze({ items });
  });
}
function analyticsPeriod(value: unknown): PromotionAnalyticsPeriodDays {
  const parsed = integer(value, 7, 90);
  if (parsed !== 7 && parsed !== 30 && parsed !== 90) invalid();
  return parsed;
}
function nullableUuid(value: unknown): string | null { return value === null ? null : uuid(value); }
function nullableLabel(value: unknown): string | null { return value === null ? null : text(value, 1, 100, 400); }
export function parsePromotionAnalyticsQuery(value: unknown): PromotionAnalyticsQuery {
  return guarded(() => { const input = exact(value, ["days"]); return Object.freeze({ days: analyticsPeriod(input.days) }); });
}
export function parsePromotionOverviewResult(value: unknown): PromotionOverviewResult {
  return guarded(() => {
    const input = exact(value, ["periodDays", "activePromotions", "currencies"]);
    const currencies = array(input.currencies, 0, 256, (entry) => {
      const row = exact(entry, ["currency", "affectedOrders", "discountMinor", "revenueMinor", "recoveredOrders", "recoveredRevenueMinor"]);
      return Object.freeze({ currency: currency(row.currency), affectedOrders: integer(row.affectedOrders, 0, Number.MAX_SAFE_INTEGER), discountMinor: integer(row.discountMinor, 0, Number.MAX_SAFE_INTEGER), revenueMinor: integer(row.revenueMinor, 0, Number.MAX_SAFE_INTEGER), recoveredOrders: integer(row.recoveredOrders, 0, Number.MAX_SAFE_INTEGER), recoveredRevenueMinor: integer(row.recoveredRevenueMinor, 0, Number.MAX_SAFE_INTEGER) });
    });
    for (let index = 1; index < currencies.length; index += 1) if (byteCompare(currencies[index - 1]!.currency, currencies[index]!.currency) >= 0) invalid();
    return Object.freeze({ periodDays: analyticsPeriod(input.periodDays), activePromotions: integer(input.activePromotions, 0, Number.MAX_SAFE_INTEGER), currencies });
  });
}
export function parsePromotionAnalyticsDetailResult(value: unknown): PromotionAnalyticsDetailResult {
  return guarded(() => {
    const input = exact(value, ["periodDays", "currencies", "attribution", "topProducts", "topCategories"]);
    const currencies = array(input.currencies, 0, 256, (entry) => {
      const row = exact(entry, ["currency", "usageCount", "affectedOrders", "discountMinor", "grossRevenueMinor", "netRevenueMinor", "averageOrderMinor", "newCustomerOrders", "recoveredOrders", "recoveredRevenueMinor"]);
      return Object.freeze({ currency: currency(row.currency), usageCount: integer(row.usageCount, 0, Number.MAX_SAFE_INTEGER), affectedOrders: integer(row.affectedOrders, 0, Number.MAX_SAFE_INTEGER), discountMinor: integer(row.discountMinor, 0, Number.MAX_SAFE_INTEGER), grossRevenueMinor: integer(row.grossRevenueMinor, 0, Number.MAX_SAFE_INTEGER), netRevenueMinor: integer(row.netRevenueMinor, 0, Number.MAX_SAFE_INTEGER), averageOrderMinor: integer(row.averageOrderMinor, 0, Number.MAX_SAFE_INTEGER), newCustomerOrders: integer(row.newCustomerOrders, 0, Number.MAX_SAFE_INTEGER), recoveredOrders: integer(row.recoveredOrders, 0, Number.MAX_SAFE_INTEGER), recoveredRevenueMinor: integer(row.recoveredRevenueMinor, 0, Number.MAX_SAFE_INTEGER) });
    });
    const attribution = array(input.attribution, 0, 100, (entry) => { const row = exact(entry, ["source", "medium", "campaign", "currency", "orders", "revenueMinor"]); return Object.freeze({ source: text(row.source, 1, 100, 400), medium: text(row.medium, 1, 100, 400), campaign: nullableLabel(row.campaign), currency: currency(row.currency), orders: integer(row.orders, 0, Number.MAX_SAFE_INTEGER), revenueMinor: integer(row.revenueMinor, 0, Number.MAX_SAFE_INTEGER) }); });
    const topProducts = array(input.topProducts, 0, 20, (entry) => { const row = exact(entry, ["productId", "label", "currency", "quantity", "revenueMinor"]); return Object.freeze({ productId: nullableUuid(row.productId), label: text(row.label, 1, 500, 2_000), currency: currency(row.currency), quantity: integer(row.quantity, 0, Number.MAX_SAFE_INTEGER), revenueMinor: integer(row.revenueMinor, 0, Number.MAX_SAFE_INTEGER) }); });
    const topCategories = array(input.topCategories, 0, 20, (entry) => { const row = exact(entry, ["categoryId", "label", "currency", "quantity", "revenueMinor"]); return Object.freeze({ categoryId: nullableUuid(row.categoryId), label: text(row.label, 1, 500, 2_000), currency: currency(row.currency), quantity: integer(row.quantity, 0, Number.MAX_SAFE_INTEGER), revenueMinor: integer(row.revenueMinor, 0, Number.MAX_SAFE_INTEGER) }); });
    return Object.freeze({ periodDays: analyticsPeriod(input.periodDays), currencies, attribution, topProducts, topCategories });
  });
}
export function parsePromotionLegacyPage(value: unknown, limit = 100): PromotionLegacyPage {
  return guarded(() => {
    const maximum = integer(limit, 1, 100), input = exact(value, ["items", "hasMore", "snapshotAt", "cursorAnchor"]);
    const hasMore = boolean(input.hasMore), snapshotAt = timestamp(input.snapshotAt);
    const items = array(input.items, 0, maximum, parsePromotionLegacyProjection);
    if (new Set(items.map((item) => item.legacyRecordId)).size !== items.length) invalid();
    if (!hasMore) {
      if (input.cursorAnchor !== null) invalid();
      return Object.freeze({ items, hasMore, snapshotAt, cursorAnchor: null });
    }
    if (items.length !== maximum || input.cursorAnchor === null) invalid();
    const rawAnchor = exact(input.cursorAnchor, ["createdAt", "id"]);
    const cursorAnchor = Object.freeze({ createdAt: timestamp(rawAnchor.createdAt), id: uuid(rawAnchor.id) });
    if (cursorAnchor.createdAt > snapshotAt || cursorAnchor.id !== items.at(-1)!.legacyRecordId) invalid();
    return Object.freeze({ items, hasMore, snapshotAt, cursorAnchor });
  });
}
