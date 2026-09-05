import {
  PROMOTION_AUDIENCE_MODES, PROMOTION_BENEFIT_KINDS, PROMOTION_ERROR_CODES, PROMOTION_REJECTION_REASONS, PROMOTION_STATUSES, PROMOTION_TARGET_KINDS,
  type PromotionAnalytics, type PromotionAudience, type PromotionBenefit, type PromotionCodeBatch, type PromotionCodeBatchListItem, type PromotionCodeBatchListResult, type PromotionCombinationPolicy,
  type PromotionConditions, type PromotionCsvRow, type PromotionDetail, type PromotionEffectiveStatus, type PromotionEvaluatorCartLine,
  type PromotionEvaluatorContext, type PromotionEvaluatorResult, type PromotionLegacyProjection, type PromotionLifecycleInput,
  type PromotionCapturedRange, type PromotionLimits, type PromotionListQuery, type PromotionMarginPolicy, type PromotionOrderDiscountLine,
  type PromotionOrderGiftLine, type PromotionOrderSnapshot, type PromotionRuleDocument, type PromotionSafeError,
  type PromotionSchedule, type PromotionSimulatorResponse, type PromotionTargetReference, type PromotionTargets, type PromotionTrigger,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f]/u;
const TEXT_CONTROL = /[\u0000-\u001f\u007f]/u;
const UNPAIRED_SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u;
const CANONICAL_CODE = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const CANONICAL_PREFIX = /^(?:|[A-Z0-9][A-Z0-9_-]{0,19})$/;
const MAX_MINOR = 8_000_000_000;
const UTF8 = new TextEncoder();
type Input = Readonly<Record<string, unknown>>;

function invalid(): never { throw new TypeError("promotion_contract_invalid"); }
function guarded<T>(parse: () => T): T { try { return parse(); } catch { return invalid(); } }
function record(value: unknown): object { if (typeof value !== "object" || value === null || Array.isArray(value)) invalid(); const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) invalid(); return value; }
function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Input { const descriptors = Object.getOwnPropertyDescriptors(record(value)); const allowed = new Set([...required, ...optional]); const keys = Reflect.ownKeys(descriptors); if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid(); const output = Object.create(null) as Record<string, unknown>; for (const key of keys) { if (typeof key !== "string") invalid(); const descriptor = descriptors[key]; if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid(); output[key] = descriptor.value; } return output; }
function integer(value: unknown, min: number, max: number): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(); return value as number; }
function text(value: unknown, min: number, max: number): string { if (typeof value !== "string" || value.length < min || value.length > max || value !== value.trim() || TEXT_CONTROL.test(value) || UNPAIRED_SURROGATE.test(value)) invalid(); return value; }
function uuid(value: unknown): string { const parsed = text(value, 36, 36); if (!UUID.test(parsed)) invalid(); return parsed; }
function currency(value: unknown): string { const parsed = text(value, 3, 3); if (!/^[A-Z]{3}$/.test(parsed)) invalid(); return parsed; }
function timestamp(value: unknown): string { if (typeof value !== "string" || !ISO.test(value)) invalid(); const date = new Date(value); if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) invalid(); return value; }
function timezone(value: unknown): string { const parsed = text(value, 1, 64); try { new Intl.DateTimeFormat("en-US", { timeZone: parsed }); } catch { invalid(); } return parsed; }
function freeze<T>(value: T): T { if (typeof value === "object" && value !== null && !Object.isFrozen(value)) { for (const entry of Object.values(value)) freeze(entry); Object.freeze(value); } return value; }
function array<T>(value: unknown, min: number, max: number, parse: (entry: unknown) => T): readonly T[] { if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid(); const descriptors = Object.getOwnPropertyDescriptors(value); if (value.length < min || value.length > max || Reflect.ownKeys(descriptors).length !== value.length + 1) invalid(); const output: T[] = []; for (let i = 0; i < value.length; i += 1) { const descriptor = descriptors[String(i)]; if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid(); output.push(parse(descriptor.value)); } return Object.freeze(output); }
function unique<T>(values: readonly T[], selector: (value: T) => string): readonly T[] { if (new Set(values.map(selector)).size !== values.length) invalid(); return values; }

// jsonb's text representation is deterministic but intentionally includes a
// space after each comma and colon. Settlement snapshots use the same byte
// measure as PostgreSQL so a contract-valid value cannot fail the SQL cap.
function postgresJsonbText(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") { if (!Number.isSafeInteger(value)) invalid(); return String(value); }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(", ")}]`;
  if (typeof value !== "object") invalid();
  const objectValue = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(objectValue).sort((left, right) => {
    const leftBytes = UTF8.encode(left), rightBytes = UTF8.encode(right);
    if (leftBytes.byteLength !== rightBytes.byteLength) return leftBytes.byteLength - rightBytes.byteLength;
    for (let index = 0; index < leftBytes.byteLength; index += 1) if (leftBytes[index] !== rightBytes[index]) return leftBytes[index]! - rightBytes[index]!;
    return 0;
  });
  return `{${keys.map((key) => `${JSON.stringify(key)}: ${postgresJsonbText(objectValue[key])}`).join(", ")}}`;
}

function postgresJsonbTextBytes(value: unknown): number { return UTF8.encode(postgresJsonbText(value)).byteLength; }

export function normalizePromotionCode(value: unknown): string { if (typeof value !== "string" || value.length < 1 || value.length > 64 || CONTROL_OR_SPACE.test(value) || !/^[A-Za-z0-9ıİşŞçÇğĞöÖüÜ][A-Za-z0-9_\-ıİşŞçÇğĞöÖüÜ]*$/u.test(value)) invalid(); const normalized = value.replace(/ı/g, "i").replace(/İ/g, "I").replace(/ş/gi, "s").replace(/ç/gi, "c").replace(/ğ/gi, "g").replace(/ö/gi, "o").replace(/ü/gi, "u").toUpperCase(); if (!CANONICAL_CODE.test(normalized)) invalid(); return normalized; }
function target(value: unknown): PromotionTargetReference { const parsed = exact(value, ["kind", "id"]); if (typeof parsed.kind !== "string" || !PROMOTION_TARGET_KINDS.includes(parsed.kind as never)) invalid(); return freeze({ kind: parsed.kind as PromotionTargetReference["kind"], id: uuid(parsed.id) }); }
function targets(value: unknown): PromotionTargets { const parsed = exact(value, ["mode", "include", "exclude"]); if (parsed.mode !== "all" && parsed.mode !== "selected") invalid(); const include = unique(array(parsed.include, 0, 500, target), (row) => `${row.kind}:${row.id}`); const exclude = unique(array(parsed.exclude, 0, 500, target), (row) => `${row.kind}:${row.id}`); if ((parsed.mode === "selected" && include.length === 0) || (parsed.mode === "all" && include.length !== 0)) invalid(); return freeze({ mode: parsed.mode, include, exclude }); }
function audience(value: unknown): PromotionAudience { const parsed = exact(value, ["mode"], ["referenceIds"]); if (typeof parsed.mode !== "string" || !PROMOTION_AUDIENCE_MODES.includes(parsed.mode as never)) invalid(); const needsReferences = ["customer_segments", "customer_tags", "masked_customers"].includes(parsed.mode); const hasReferences = Object.hasOwn(parsed, "referenceIds"); if (needsReferences !== hasReferences) invalid(); const referenceIds = hasReferences ? unique(array(parsed.referenceIds, 1, 500, uuid), (id) => id) : undefined; return freeze({ mode: parsed.mode as PromotionAudience["mode"], ...(referenceIds ? { referenceIds } : {}) }); }
function trigger(value: unknown): PromotionTrigger { const parsed = exact(value, ["kind"], ["codes"]); if (parsed.kind === "automatic") { if (Object.hasOwn(parsed, "codes")) invalid(); return freeze({ kind: "automatic" }); } if (parsed.kind !== "code" || !Object.hasOwn(parsed, "codes")) invalid(); const codes = unique(array(parsed.codes, 1, 10_000, normalizePromotionCode), (code) => code); return freeze({ kind: "code", codes }); }
function schedule(value: unknown): PromotionSchedule { const parsed = exact(value, ["timezone"], ["startsAt", "endsAt"]); const startsAt = Object.hasOwn(parsed, "startsAt") ? timestamp(parsed.startsAt) : undefined; const endsAt = Object.hasOwn(parsed, "endsAt") ? timestamp(parsed.endsAt) : undefined; if (endsAt !== undefined && (startsAt === undefined || Date.parse(endsAt) <= Date.parse(startsAt))) invalid(); return freeze({ timezone: timezone(parsed.timezone), ...(startsAt ? { startsAt } : {}), ...(endsAt ? { endsAt } : {}) }); }
function limits(value: unknown): PromotionLimits { const parsed = exact(value, ["totalUsage", "perCustomerUsage", "budgetMinor", "orderMaximumMinor"]); const nullable = (entry: unknown, maximum: number) => entry === null ? null : integer(entry, 0, maximum); return freeze({ totalUsage: nullable(parsed.totalUsage, 1_000_000_000), perCustomerUsage: nullable(parsed.perCustomerUsage, 1_000_000_000), budgetMinor: nullable(parsed.budgetMinor, MAX_MINOR), orderMaximumMinor: nullable(parsed.orderMaximumMinor, MAX_MINOR) }); }
function conditions(value: unknown): PromotionConditions { const parsed = exact(value, ["minimumBasketMinor", "minimumQuantity", "minimumProductQuantity"], ["paymentMethodIds", "shippingMethodIds", "salesChannels"]); const paymentMethodIds = Object.hasOwn(parsed, "paymentMethodIds") ? unique(array(parsed.paymentMethodIds, 1, 100, uuid), (id) => id) : undefined; const shippingMethodIds = Object.hasOwn(parsed, "shippingMethodIds") ? unique(array(parsed.shippingMethodIds, 1, 100, uuid), (id) => id) : undefined; const salesChannels = Object.hasOwn(parsed, "salesChannels") ? unique(array(parsed.salesChannels, 1, 20, (entry) => text(entry, 1, 64)), (channel) => channel) : undefined; return freeze({ minimumBasketMinor: integer(parsed.minimumBasketMinor, 0, MAX_MINOR), minimumQuantity: integer(parsed.minimumQuantity, 0, 1_000_000), minimumProductQuantity: integer(parsed.minimumProductQuantity, 0, 1_000_000), ...(paymentMethodIds ? { paymentMethodIds } : {}), ...(shippingMethodIds ? { shippingMethodIds } : {}), ...(salesChannels ? { salesChannels } : {}) }); }
function benefit(value: unknown): PromotionBenefit {
  const root = exact(value, ["kind"], ["percentageBps", "amountMinor", "currency", "buyQuantity", "receiveQuantity", "discountPercentageBps", "reward", "tiers", "items", "bundlePriceMinor", "giftVariantId", "quantity", "autoAdd"]);
  switch (root.kind) {
    case "percentage": { const parsed = exact(value, ["kind", "percentageBps"]); return freeze({ kind: "percentage", percentageBps: integer(parsed.percentageBps, 1, 10_000) }); }
    case "fixed_amount": { const parsed = exact(value, ["kind", "amountMinor", "currency"]); return freeze({ kind: "fixed_amount", amountMinor: integer(parsed.amountMinor, 1, MAX_MINOR), currency: currency(parsed.currency) }); }
    case "free_shipping": exact(value, ["kind"]); return freeze({ kind: "free_shipping" });
    case "buy_x_get_y": {
      const parsed = exact(value, ["kind", "buyQuantity", "receiveQuantity", "discountPercentageBps", "reward"]);
      const rewardRoot = exact(parsed.reward, ["strategy"], ["productIds", "variantId"]);
      let reward: Extract<PromotionBenefit, { readonly kind: "buy_x_get_y" }>["reward"];
      if (rewardRoot.strategy === "same_product_cheapest") { exact(parsed.reward, ["strategy"]); reward = freeze({ strategy: "same_product_cheapest" }); }
      else if (rewardRoot.strategy === "selected_products_cheapest") { const selected = exact(parsed.reward, ["strategy", "productIds"]); reward = freeze({ strategy: "selected_products_cheapest", productIds: unique(array(selected.productIds, 1, 100, uuid), (id) => id) }); }
      else if (rewardRoot.strategy === "specific_variant") { const specific = exact(parsed.reward, ["strategy", "variantId"]); reward = freeze({ strategy: "specific_variant", variantId: uuid(specific.variantId) }); }
      else invalid();
      return freeze({ kind: "buy_x_get_y", buyQuantity: integer(parsed.buyQuantity, 1, 1_000_000), receiveQuantity: integer(parsed.receiveQuantity, 1, 1_000_000), discountPercentageBps: integer(parsed.discountPercentageBps, 1, 10_000), reward });
    }
    case "quantity_tiers": {
      const parsed = exact(value, ["kind", "tiers"]);
      const tiers = array(parsed.tiers, 1, 20, (tier) => { const row = exact(tier, ["minimumQuantity", "percentageBps"]); return freeze({ minimumQuantity: integer(row.minimumQuantity, 1, 1_000_000), percentageBps: integer(row.percentageBps, 1, 10_000) }); });
      for (let i = 1; i < tiers.length; i += 1) if (tiers[i - 1]!.minimumQuantity >= tiers[i]!.minimumQuantity) invalid();
      return freeze({ kind: "quantity_tiers", tiers });
    }
    case "bundle_price": {
      const parsed = exact(value, ["kind", "items", "bundlePriceMinor", "currency"]);
      const items = unique(array(parsed.items, 2, 20, (entry) => { const row = exact(entry, ["variantId", "quantity"]); return freeze({ variantId: uuid(row.variantId), quantity: integer(row.quantity, 1, 1_000_000) }); }), (entry) => entry.variantId);
      if (items.reduce((total, entry) => total + entry.quantity, 0) > 1_000_000) invalid();
      return freeze({ kind: "bundle_price", items, bundlePriceMinor: integer(parsed.bundlePriceMinor, 0, MAX_MINOR), currency: currency(parsed.currency) });
    }
    case "gift": {
      const parsed = exact(value, ["kind", "giftVariantId", "quantity", "autoAdd"]);
      if (parsed.autoAdd !== true && parsed.autoAdd !== false) invalid();
      return freeze({ kind: "gift", giftVariantId: uuid(parsed.giftVariantId), quantity: integer(parsed.quantity, 1, 1_000_000), autoAdd: parsed.autoAdd });
    }
    default: invalid();
  }
}
function combinationPolicy(value: unknown): PromotionCombinationPolicy { const root = exact(value, ["kind"], ["benefitClasses"]); if (root.kind === "none" || root.kind === "shipping_only") { exact(value, ["kind"]); return freeze({ kind: root.kind }); } if (root.kind !== "benefit_classes") invalid(); const parsed = exact(value, ["kind", "benefitClasses"]); const benefitClasses = unique(array(parsed.benefitClasses, 1, 7, (entry) => { if (typeof entry !== "string" || !PROMOTION_BENEFIT_KINDS.includes(entry as never)) invalid(); return entry as PromotionBenefit["kind"]; }), (entry) => entry); return freeze({ kind: "benefit_classes", benefitClasses }); }
function marginPolicy(value: unknown): PromotionMarginPolicy { const root = exact(value, ["kind"], ["maximumPercentageBps"]); if (root.kind === "warn" || root.kind === "floor_at_cost") { exact(value, ["kind"]); return freeze({ kind: root.kind }); } if (root.kind !== "maximum_percentage") invalid(); const parsed = exact(value, ["kind", "maximumPercentageBps"]); return freeze({ kind: "maximum_percentage", maximumPercentageBps: integer(parsed.maximumPercentageBps, 0, 10_000) }); }

export function parsePromotionRuleDocument(value: unknown): PromotionRuleDocument {
  return guarded(() => {
    const parsed = exact(value, ["schemaVersion", "benefit", "targets", "audience", "trigger", "schedule", "limits", "conditions", "combinationPolicy", "priority", "marginPolicy", "progressMessagePolicy"]);
    const progress = exact(parsed.progressMessagePolicy, ["enabled"]);
    if (progress.enabled !== true && progress.enabled !== false) invalid();
    const parsedBenefit = benefit(parsed.benefit);
    const parsedTargets = targets(parsed.targets);
    if (parsedBenefit.kind === "bundle_price") {
      const itemIds = new Set(parsedBenefit.items.map((item) => item.variantId));
      if (parsedTargets.mode !== "selected" || parsedTargets.exclude.length !== 0 || parsedTargets.include.length !== itemIds.size || parsedTargets.include.some((entry) => entry.kind !== "variant" || !itemIds.has(entry.id))) invalid();
    }
    return freeze({ schemaVersion: integer(parsed.schemaVersion, 1, 1) as 1, benefit: parsedBenefit, targets: parsedTargets, audience: audience(parsed.audience), trigger: trigger(parsed.trigger), schedule: schedule(parsed.schedule), limits: limits(parsed.limits), conditions: conditions(parsed.conditions), combinationPolicy: combinationPolicy(parsed.combinationPolicy), priority: integer(parsed.priority, 0, 1_000), marginPolicy: marginPolicy(parsed.marginPolicy), progressMessagePolicy: freeze({ enabled: progress.enabled }) });
  });
}
export function derivePromotionLifecycle(input: PromotionLifecycleInput): PromotionEffectiveStatus { return guarded(() => { const now = timestamp(input.now); const scheduleInput = exact(input.schedule, ["timezone"], ["startsAt", "endsAt"]); const startsAt = Object.hasOwn(scheduleInput, "startsAt") ? timestamp(scheduleInput.startsAt) : undefined; const endsAt = Object.hasOwn(scheduleInput, "endsAt") ? timestamp(scheduleInput.endsAt) : undefined; if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) invalid(); timezone(scheduleInput.timezone); const currentLimits = exact(input.limits, ["totalUsage", "budgetMinor"]); const totalUsage = currentLimits.totalUsage === null ? null : integer(currentLimits.totalUsage, 0, 1_000_000_000); const budgetMinor = currentLimits.budgetMinor === null ? null : integer(currentLimits.budgetMinor, 0, MAX_MINOR); const usage = exact(input.usage, ["total", "budgetSpentMinor"]); const total = integer(usage.total, 0, 1_000_000_000); const spent = integer(usage.budgetSpentMinor, 0, MAX_MINOR); if (typeof input.status !== "string" || !PROMOTION_STATUSES.includes(input.status as never)) invalid(); if (input.status === "draft" || input.status === "paused" || input.status === "archived") return input.status; if (input.status === "scheduled" && startsAt === undefined) invalid(); if (endsAt && Date.parse(now) >= Date.parse(endsAt)) return "ended"; if (startsAt && Date.parse(now) < Date.parse(startsAt)) return "scheduled"; if ((totalUsage !== null && total >= totalUsage) || (budgetMinor !== null && spent >= budgetMinor)) return "exhausted"; return "active"; }); }
function cartLine(value: unknown): PromotionEvaluatorCartLine { const parsed = exact(value, ["lineId", "position", "productId", "variantId", "quantity", "unitPriceMinor", "unitCostMinor", "currency", "categoryIds", "brandId", "collectionIds"]); const unitCostMinor = parsed.unitCostMinor === null ? null : integer(parsed.unitCostMinor, 0, MAX_MINOR); const brandId = parsed.brandId === null ? null : uuid(parsed.brandId); return freeze({ lineId: uuid(parsed.lineId), position: integer(parsed.position, 0, 100), productId: uuid(parsed.productId), variantId: uuid(parsed.variantId), quantity: integer(parsed.quantity, 1, 1_000_000), unitPriceMinor: integer(parsed.unitPriceMinor, 0, MAX_MINOR), unitCostMinor, currency: currency(parsed.currency), categoryIds: unique(array(parsed.categoryIds, 0, 100, uuid), (id) => id), brandId, collectionIds: unique(array(parsed.collectionIds, 0, 100, uuid), (id) => id) }); }
export function parsePromotionEvaluatorContext(value: unknown): PromotionEvaluatorContext { return guarded(() => { const parsed = exact(value, ["storeId", "customerId", "paidOrderCount", "customerSegmentIds", "customerTagIds", "cartLines", "shippingMethodId", "paymentMethodId", "shippingBeforeDiscountMinor", "currency", "storeLocalTime", "salesChannel", "submittedCodes", "abandonedCart"]); const customerId = parsed.customerId === null ? null : uuid(parsed.customerId); const shippingMethodId = parsed.shippingMethodId === null ? null : uuid(parsed.shippingMethodId); const paymentMethodId = parsed.paymentMethodId === null ? null : uuid(parsed.paymentMethodId); const abandonedCart = parsed.abandonedCart === null ? null : freeze({ id: uuid(exact(parsed.abandonedCart, ["id"]).id) }); const cartLines = unique(array(parsed.cartLines, 0, 20, cartLine), (line) => line.lineId); return freeze({ storeId: uuid(parsed.storeId), customerId, paidOrderCount: integer(parsed.paidOrderCount, 0, 1_000_000_000), customerSegmentIds: unique(array(parsed.customerSegmentIds, 0, 100, uuid), (id) => id), customerTagIds: unique(array(parsed.customerTagIds, 0, 100, uuid), (id) => id), cartLines, shippingMethodId, paymentMethodId, shippingBeforeDiscountMinor: integer(parsed.shippingBeforeDiscountMinor, 0, MAX_MINOR), currency: currency(parsed.currency), storeLocalTime: timestamp(parsed.storeLocalTime), salesChannel: text(parsed.salesChannel, 1, 64), submittedCodes: unique(array(parsed.submittedCodes, 0, 5, normalizePromotionCode), (code) => code), abandonedCart }); }); }
export function parsePromotionEvaluatorResult(value: unknown): PromotionEvaluatorResult {
  return guarded(() => {
    const parsed = exact(value, ["eligiblePromotionIds", "appliedPromotions", "rejectedPromotions", "lineEffects", "shippingEffects", "gifts", "subtotalBeforeDiscountMinor", "lineDiscountTotalMinor", "shippingBeforeDiscountMinor", "shippingDiscountTotalMinor", "discountTotalMinor", "grandTotalMinor", "currency", "progressMessages", "merchantExplanation"]);
    const appliedPromotions = unique(array(parsed.appliedPromotions, 0, 100, (entry) => {
      const row = exact(entry, ["promotionId", "version", "name", "benefitKind", "lineDiscountMinor", "shippingDiscountMinor", "discountTotalMinor"], ["normalizedCode"]);
      if (typeof row.benefitKind !== "string" || !PROMOTION_BENEFIT_KINDS.includes(row.benefitKind as never)) invalid();
      const lineDiscountMinor = integer(row.lineDiscountMinor, 0, MAX_MINOR);
      const shippingDiscountMinor = integer(row.shippingDiscountMinor, 0, MAX_MINOR);
      const discountTotalMinor = integer(row.discountTotalMinor, 0, MAX_MINOR);
      if (discountTotalMinor !== lineDiscountMinor + shippingDiscountMinor) invalid();
      const normalizedCode = Object.hasOwn(row, "normalizedCode") ? normalizePromotionCode(row.normalizedCode) : undefined;
      return freeze({ promotionId: uuid(row.promotionId), version: integer(row.version, 1, Number.MAX_SAFE_INTEGER), name: text(row.name, 1, 200), benefitKind: row.benefitKind as PromotionBenefit["kind"], ...(normalizedCode ? { normalizedCode } : {}), lineDiscountMinor, shippingDiscountMinor, discountTotalMinor });
    }), (item) => item.promotionId);
    const eligiblePromotionIds = unique(array(parsed.eligiblePromotionIds, 0, 100, uuid), (id) => id);
    const appliedIds = new Set(appliedPromotions.map((item) => item.promotionId));
    if (appliedPromotions.some((item) => !eligiblePromotionIds.includes(item.promotionId))) invalid();
    const rejectedPromotions = unique(array(parsed.rejectedPromotions, 0, 100, (entry) => { const row = exact(entry, ["promotionId", "reason"]); if (typeof row.reason !== "string" || !PROMOTION_REJECTION_REASONS.includes(row.reason as never)) invalid(); return freeze({ promotionId: uuid(row.promotionId), reason: row.reason as PromotionEvaluatorResult["rejectedPromotions"][number]["reason"] }); }), (item) => item.promotionId);
    if (rejectedPromotions.some((item) => appliedIds.has(item.promotionId))) invalid();
    const lineEffects = unique(array(parsed.lineEffects, 0, 2_000, (entry) => { const row = exact(entry, ["promotionId", "lineId", "discountMinor", "giftQuantity"]); if (row.giftQuantity !== 0) invalid(); return freeze({ promotionId: uuid(row.promotionId), lineId: uuid(row.lineId), discountMinor: integer(row.discountMinor, 0, MAX_MINOR), giftQuantity: 0 as const }); }), (item) => `${item.promotionId}:${item.lineId}`);
    const shippingEffects = unique(array(parsed.shippingEffects, 0, 100, (entry) => { const row = exact(entry, ["promotionId", "discountMinor"]); return freeze({ promotionId: uuid(row.promotionId), discountMinor: integer(row.discountMinor, 0, MAX_MINOR) }); }), (item) => item.promotionId);
    const gifts = unique(array(parsed.gifts, 0, 100, (entry) => {
      const root = exact(entry, ["promotionId", "variantId", "quantity", "paidMinor", "autoAdd"], ["lineId"]);
      if (root.paidMinor !== 0 || (root.autoAdd !== true && root.autoAdd !== false)) invalid();
      if (root.autoAdd === true) {
        if (Object.hasOwn(root, "lineId")) invalid();
        return freeze({ promotionId: uuid(root.promotionId), variantId: uuid(root.variantId), quantity: integer(root.quantity, 1, 1_000_000), paidMinor: 0 as const, autoAdd: true as const });
      }
      if (!Object.hasOwn(root, "lineId")) invalid();
      return freeze({ promotionId: uuid(root.promotionId), variantId: uuid(root.variantId), quantity: integer(root.quantity, 1, 1_000_000), paidMinor: 0 as const, autoAdd: false as const, lineId: uuid(root.lineId) });
    }), (item) => item.promotionId);
    if (lineEffects.some((item) => !appliedIds.has(item.promotionId)) || shippingEffects.some((item) => !appliedIds.has(item.promotionId)) || gifts.some((item) => !appliedIds.has(item.promotionId))) invalid();
    for (const gift of gifts) {
      const promotion = appliedPromotions.find((item) => item.promotionId === gift.promotionId);
      if (promotion?.benefitKind !== "gift") invalid();
      const giftLineEffects = lineEffects.filter((item) => item.promotionId === gift.promotionId);
      const hasShippingEffect = shippingEffects.some((item) => item.promotionId === gift.promotionId);
      const exactManualLineEffect = !gift.autoAdd && giftLineEffects.length === 1 && giftLineEffects[0]?.lineId === gift.lineId && giftLineEffects[0].discountMinor > 0;
      if (promotion.shippingDiscountMinor !== 0 || hasShippingEffect || (gift.autoAdd && (promotion.lineDiscountMinor !== 0 || giftLineEffects.length !== 0)) || (!gift.autoAdd && !exactManualLineEffect)) invalid();
    }
    if (appliedPromotions.some((promotion) => promotion.benefitKind === "gift" && !gifts.some((gift) => gift.promotionId === promotion.promotionId))) invalid();
    const subtotalBeforeDiscountMinor = integer(parsed.subtotalBeforeDiscountMinor, 0, MAX_MINOR);
    const lineDiscountTotalMinor = integer(parsed.lineDiscountTotalMinor, 0, MAX_MINOR);
    const shippingBeforeDiscountMinor = integer(parsed.shippingBeforeDiscountMinor, 0, MAX_MINOR);
    const shippingDiscountTotalMinor = integer(parsed.shippingDiscountTotalMinor, 0, MAX_MINOR);
    const discountTotalMinor = integer(parsed.discountTotalMinor, 0, MAX_MINOR);
    const grandTotalMinor = integer(parsed.grandTotalMinor, 0, MAX_MINOR);
    const sum = (values: readonly number[]) => values.reduce((total, entry) => { const next = total + entry; if (!Number.isSafeInteger(next)) invalid(); return next; }, 0);
    if (lineDiscountTotalMinor > subtotalBeforeDiscountMinor || shippingDiscountTotalMinor > shippingBeforeDiscountMinor || discountTotalMinor !== lineDiscountTotalMinor + shippingDiscountTotalMinor || grandTotalMinor !== subtotalBeforeDiscountMinor - lineDiscountTotalMinor + shippingBeforeDiscountMinor - shippingDiscountTotalMinor || sum(appliedPromotions.map((item) => item.discountTotalMinor)) !== discountTotalMinor || sum(lineEffects.map((item) => item.discountMinor)) !== lineDiscountTotalMinor || sum(shippingEffects.map((item) => item.discountMinor)) !== shippingDiscountTotalMinor) invalid();
    for (const promotion of appliedPromotions) if (sum(lineEffects.filter((item) => item.promotionId === promotion.promotionId).map((item) => item.discountMinor)) !== promotion.lineDiscountMinor || sum(shippingEffects.filter((item) => item.promotionId === promotion.promotionId).map((item) => item.discountMinor)) !== promotion.shippingDiscountMinor) invalid();
    const merchantExplanation = text(parsed.merchantExplanation, 1, 500);
    if (!["evaluated", "promotion_configuration_limit_exceeded", "promotion_context_unavailable"].includes(merchantExplanation)) invalid();
    return freeze({ eligiblePromotionIds, appliedPromotions, rejectedPromotions, lineEffects, shippingEffects, gifts, subtotalBeforeDiscountMinor, lineDiscountTotalMinor, shippingBeforeDiscountMinor, shippingDiscountTotalMinor, discountTotalMinor, grandTotalMinor, currency: currency(parsed.currency), progressMessages: array(parsed.progressMessages, 0, 2, (entry) => text(entry, 1, 200)), merchantExplanation: merchantExplanation as PromotionEvaluatorResult["merchantExplanation"] });
  });
}
export function parsePromotionListQuery(value: unknown): PromotionListQuery { return guarded(() => { const parsed = exact(value, ["cursor", "limit", "statuses"], ["search"]); const cursor = parsed.cursor === null ? null : text(parsed.cursor, 1, 512); const search = Object.hasOwn(parsed, "search") ? text(parsed.search, 1, 100) : undefined; const statuses = unique(array(parsed.statuses, 0, 5, (entry) => { if (typeof entry !== "string" || !PROMOTION_STATUSES.includes(entry as never)) invalid(); return entry as PromotionListQuery["statuses"][number]; }), (entry) => entry); return freeze({ cursor, limit: integer(parsed.limit, 1, 100), ...(search ? { search } : {}), statuses }); }); }
export function parsePromotionDetail(value: unknown): PromotionDetail { return guarded(() => { const parsed = exact(value, ["id", "version", "name", "status", "ruleDocument", "createdAt", "updatedAt"]); if (typeof parsed.status !== "string" || !PROMOTION_STATUSES.includes(parsed.status as never)) invalid(); const createdAt = timestamp(parsed.createdAt); const updatedAt = timestamp(parsed.updatedAt); if (Date.parse(updatedAt) < Date.parse(createdAt)) invalid(); return freeze({ id: uuid(parsed.id), version: integer(parsed.version, 1, Number.MAX_SAFE_INTEGER), name: text(parsed.name, 1, 200), status: parsed.status as PromotionDetail["status"], ruleDocument: parsePromotionRuleDocument(parsed.ruleDocument), createdAt, updatedAt }); }); }
export function parsePromotionSimulatorResponse(value: unknown): PromotionSimulatorResponse { return guarded(() => { const parsed = exact(value, ["evaluation", "mutated"]); if (parsed.mutated !== false) invalid(); return freeze({ evaluation: parsePromotionEvaluatorResult(parsed.evaluation), mutated: false }); }); }
function capturedRange(value: unknown): PromotionCapturedRange {
  const parsed = exact(value, ["startOrdinal", "quantity", "grossUnitMinor", "discountUnitMinor", "kind"]);
  if (parsed.kind !== "sale" && parsed.kind !== "gift" && parsed.kind !== "buy_x_get_y") invalid();
  const startOrdinal = integer(parsed.startOrdinal, 0, 999_999);
  const quantity = integer(parsed.quantity, 1, 1_000_000);
  if (startOrdinal + quantity > 1_000_000) invalid();
  const grossUnitMinor = integer(parsed.grossUnitMinor, 0, MAX_MINOR);
  const discountUnitMinor = integer(parsed.discountUnitMinor, 0, MAX_MINOR);
  if (discountUnitMinor > grossUnitMinor || (parsed.kind === "gift" && discountUnitMinor !== grossUnitMinor)) invalid();
  return freeze({ startOrdinal, quantity, grossUnitMinor, discountUnitMinor, kind: parsed.kind });
}
function orderDiscountLine(value: unknown): PromotionOrderDiscountLine {
  const parsed = exact(value, ["lineId", "position", "discountMinor", "capturedRanges"]);
  const discountMinor = integer(parsed.discountMinor, 1, MAX_MINOR);
  const capturedRanges = array(parsed.capturedRanges, 0, 64, capturedRange);
  let previousEnd = 0;
  let previousRange: PromotionCapturedRange | undefined;
  let capturedQuantity = 0;
  let capturedDiscount = 0n;
  for (const range of capturedRanges) {
    if (range.startOrdinal !== previousEnd) invalid();
    if (previousRange && previousRange.kind === range.kind && previousRange.grossUnitMinor === range.grossUnitMinor && previousRange.discountUnitMinor === range.discountUnitMinor) invalid();
    previousEnd = range.startOrdinal + range.quantity;
    previousRange = range;
    capturedQuantity += range.quantity;
    if (capturedQuantity > 1_000_000) invalid();
    capturedDiscount += BigInt(range.quantity) * BigInt(range.discountUnitMinor);
    if (capturedDiscount > BigInt(MAX_MINOR)) invalid();
  }
  if (capturedRanges.length > 0 && Number(capturedDiscount) !== discountMinor) invalid();
  return freeze({ lineId: uuid(parsed.lineId), position: integer(parsed.position, 0, 99), discountMinor, capturedRanges });
}
function orderGiftLine(value: unknown): PromotionOrderGiftLine {
  const root = exact(value, ["variantId", "quantity", "paidMinor", "autoAdd"], ["lineId"]);
  const variantId = uuid(root.variantId);
  const quantity = integer(root.quantity, 1, 1_000_000);
  if (root.paidMinor !== 0) invalid();
  if (root.autoAdd === true) { exact(value, ["variantId", "quantity", "paidMinor", "autoAdd"]); return freeze({ variantId, quantity, paidMinor: 0, autoAdd: true }); }
  if (root.autoAdd !== false) invalid();
  const manual = exact(value, ["variantId", "quantity", "paidMinor", "autoAdd", "lineId"]);
  return freeze({ variantId, quantity, paidMinor: 0, autoAdd: false, lineId: uuid(manual.lineId) });
}
export function parsePromotionOrderSnapshot(value: unknown): PromotionOrderSnapshot {
  return guarded(() => {
    const parsed = exact(value, ["promotionId", "promotionVersion", "promotionName", "couponCode", "benefit", "targets", "discountLines", "shippingDiscountMinor", "giftLines", "discountTotalMinor", "currency", "evaluatedAt"]);
    const parsedBenefit = benefit(parsed.benefit);
    const parsedTargets = targets(parsed.targets);
    if (parsedBenefit.kind === "bundle_price") {
      const itemIds = new Set(parsedBenefit.items.map((item) => item.variantId));
      if (parsedTargets.mode !== "selected" || parsedTargets.exclude.length !== 0 || parsedTargets.include.length !== itemIds.size || parsedTargets.include.some((entry) => entry.kind !== "variant" || !itemIds.has(entry.id))) invalid();
    }
    const couponCode = parsed.couponCode === null ? null : (() => { const normalized = normalizePromotionCode(parsed.couponCode); if (normalized !== parsed.couponCode) invalid(); return normalized; })();
    const discountLines = unique(array(parsed.discountLines, 0, 20, orderDiscountLine), (line) => line.lineId);
    unique(discountLines, (line) => String(line.position));
    if (discountLines.some((line) => line.capturedRanges.length === 0)) invalid();
    for (let index = 1; index < discountLines.length; index += 1) {
      const previous = discountLines[index - 1]!;
      const current = discountLines[index]!;
      if (previous.position > current.position || (previous.position === current.position && previous.lineId >= current.lineId)) invalid();
    }
    const giftLines = array(parsed.giftLines, 0, 1, orderGiftLine);
    const shippingDiscountMinor = integer(parsed.shippingDiscountMinor, 0, MAX_MINOR);
    const discountTotalMinor = integer(parsed.discountTotalMinor, 0, MAX_MINOR);
    const lineDiscountTotal = discountLines.reduce((total, line) => { const next = total + line.discountMinor; if (!Number.isSafeInteger(next) || next > MAX_MINOR) invalid(); return next; }, 0);
    if (lineDiscountTotal + shippingDiscountMinor !== discountTotalMinor) invalid();
    if (parsedBenefit.kind === "free_shipping") {
      if (discountLines.length !== 0 || giftLines.length !== 0) invalid();
    } else if (parsedBenefit.kind === "gift") {
      const gift = giftLines[0];
      if (!gift || gift.variantId !== parsedBenefit.giftVariantId || gift.quantity !== parsedBenefit.quantity || gift.autoAdd !== parsedBenefit.autoAdd || shippingDiscountMinor !== 0) invalid();
      if (parsedBenefit.autoAdd) {
        if (discountLines.length !== 0 || discountTotalMinor !== 0) invalid();
      } else {
        if (gift.autoAdd || discountLines.length !== 1 || discountLines[0]!.lineId !== gift.lineId || discountLines[0]!.capturedRanges.some((range) => (range.kind !== "sale" && range.kind !== "gift") || (range.kind === "sale" && range.discountUnitMinor !== 0)) || discountLines[0]!.capturedRanges.filter((range) => range.kind === "gift").reduce((total, range) => total + range.quantity, 0) !== parsedBenefit.quantity) invalid();
      }
    } else {
      if (giftLines.length !== 0 || shippingDiscountMinor !== 0) invalid();
      if (parsedBenefit.kind === "buy_x_get_y") {
        if (discountLines.some((line) => !line.capturedRanges.some((range) => range.kind === "buy_x_get_y") || line.capturedRanges.some((range) => (range.kind !== "sale" && range.kind !== "buy_x_get_y") || (range.kind === "sale" && range.discountUnitMinor !== 0)))) invalid();
      } else if (discountLines.some((line) => line.capturedRanges.some((range) => range.kind !== "sale"))) invalid();
    }
    const parsedCurrency = currency(parsed.currency);
    if ((parsedBenefit.kind === "fixed_amount" || parsedBenefit.kind === "bundle_price") && parsedBenefit.currency !== parsedCurrency) invalid();
    if (!(parsedBenefit.kind === "gift" && parsedBenefit.autoAdd) && discountTotalMinor === 0) invalid();
    const result = freeze({ promotionId: uuid(parsed.promotionId), promotionVersion: integer(parsed.promotionVersion, 1, Number.MAX_SAFE_INTEGER), promotionName: text(parsed.promotionName, 1, 200), couponCode, benefit: parsedBenefit, targets: parsedTargets, discountLines, shippingDiscountMinor, giftLines, discountTotalMinor, currency: parsedCurrency, evaluatedAt: timestamp(parsed.evaluatedAt) });
    if (postgresJsonbTextBytes(result) > 131_072) invalid();
    return result;
  });
}
export function parsePromotionCodeBatch(value: unknown): PromotionCodeBatch {
  return guarded(() => {
    const parsed = exact(value, ["id", "promotionId", "version", "status", "count", "prefix", "codeLength", "perCustomerUsage", "expiresAt", "createdAt", "updatedAt"]);
    if (parsed.status !== "active" && parsed.status !== "paused" && parsed.status !== "revoked") invalid();
    if (typeof parsed.prefix !== "string" || !CANONICAL_PREFIX.test(parsed.prefix)) invalid();
    const codeLength = integer(parsed.codeLength, 16, 64);
    if (codeLength - parsed.prefix.length < 16) invalid();
    const createdAt = timestamp(parsed.createdAt);
    const updatedAt = timestamp(parsed.updatedAt);
    const expiresAt = parsed.expiresAt === null ? null : timestamp(parsed.expiresAt);
    if (Date.parse(updatedAt) < Date.parse(createdAt) || (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(createdAt))) invalid();
    return freeze({ id: uuid(parsed.id), promotionId: uuid(parsed.promotionId), version: integer(parsed.version, 1, Number.MAX_SAFE_INTEGER), status: parsed.status, count: integer(parsed.count, 1, 10_000), prefix: parsed.prefix, codeLength, perCustomerUsage: integer(parsed.perCustomerUsage, 1, 1_000_000), expiresAt, createdAt, updatedAt });
  });
}
export function parsePromotionCodeBatchListItem(value: unknown): PromotionCodeBatchListItem {
  return guarded(() => {
    const parsed = exact(value, ["id", "promotionId", "version", "status", "count", "prefix", "codeLength", "perCustomerUsage", "expiresAt", "createdAt", "updatedAt", "used", "held", "remaining"]);
    const batch = parsePromotionCodeBatch({ id: parsed.id, promotionId: parsed.promotionId, version: parsed.version, status: parsed.status, count: parsed.count, prefix: parsed.prefix, codeLength: parsed.codeLength, perCustomerUsage: parsed.perCustomerUsage, expiresAt: parsed.expiresAt, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt });
    const used = integer(parsed.used, 0, batch.count);
    const held = integer(parsed.held, 0, batch.count);
    const remaining = integer(parsed.remaining, 0, batch.count);
    if (used + held + remaining > batch.count) invalid();
    return freeze({ ...batch, used, held, remaining });
  });
}
export function parsePromotionCodeBatchList(value: unknown): PromotionCodeBatchListResult {
  return guarded(() => {
    const parsed = exact(value, ["items", "hasMore", "snapshotAt", "cursorAnchor"]);
    if (parsed.hasMore !== true && parsed.hasMore !== false) invalid();
    const items = unique(array(parsed.items, 0, 100, parsePromotionCodeBatchListItem), (item) => item.id);
    const snapshotAt = timestamp(parsed.snapshotAt);
    const cursorAnchor = parsed.cursorAnchor === null ? null : (() => { const cursor = exact(parsed.cursorAnchor, ["createdAt", "id"]); return freeze({ createdAt: timestamp(cursor.createdAt), id: uuid(cursor.id) }); })();
    const tupleDescending = (left: PromotionCodeBatchListItem, right: PromotionCodeBatchListItem) => left.createdAt > right.createdAt || (left.createdAt === right.createdAt && left.id > right.id);
    if (items.some((item) => item.createdAt > snapshotAt || ((item.status !== "active" || (item.expiresAt !== null && item.expiresAt <= snapshotAt)) && item.remaining !== 0))
      || items.some((item) => item.promotionId !== items[0]?.promotionId)
      || items.slice(1).some((item, index) => !tupleDescending(items[index]!, item))) invalid();
    const last = items.at(-1);
    if ((parsed.hasMore === true) !== (cursorAnchor !== null) || (parsed.hasMore && last === undefined)
      || (cursorAnchor !== null && (cursorAnchor.createdAt > snapshotAt || last?.createdAt !== cursorAnchor.createdAt || last.id !== cursorAnchor.id))) invalid();
    return freeze({ items, hasMore: parsed.hasMore, snapshotAt, cursorAnchor });
  });
}
export function parsePromotionCsvRow(value: unknown): PromotionCsvRow { return guarded(() => { const parsed = exact(value, ["code", "status"]); if (parsed.status !== "active" && parsed.status !== "paused" && parsed.status !== "revoked") invalid(); if (typeof parsed.code !== "string" || !CANONICAL_CODE.test(parsed.code) || normalizePromotionCode(parsed.code) !== parsed.code) invalid(); return freeze({ code: parsed.code, status: parsed.status }); }); }
export function parsePromotionAnalytics(value: unknown): PromotionAnalytics { return guarded(() => { const parsed = exact(value, ["currency", "redemptions", "discountMinor", "revenueMinor", "conversionBps"]); return freeze({ currency: currency(parsed.currency), redemptions: integer(parsed.redemptions, 0, 1_000_000_000), discountMinor: integer(parsed.discountMinor, 0, MAX_MINOR), revenueMinor: integer(parsed.revenueMinor, 0, MAX_MINOR), conversionBps: integer(parsed.conversionBps, 0, 10_000) }); }); }
export function parsePromotionLegacyProjection(value: unknown): PromotionLegacyProjection { return guarded(() => { const parsed = exact(value, ["legacyRecordId", "promotionId", "reason"]); const reasons = ["adopted", "unsupported_discount_type", "invalid_value", "invalid_minimum_order", "invalid_usage_limit", "invalid_code", "code_conflict", "invalid_legacy_record"] as const; if (typeof parsed.reason !== "string" || !reasons.includes(parsed.reason as never)) invalid(); const promotionId = parsed.promotionId === null ? null : uuid(parsed.promotionId); if ((parsed.reason === "adopted") !== (promotionId !== null)) invalid(); return freeze({ legacyRecordId: uuid(parsed.legacyRecordId), promotionId, reason: parsed.reason as PromotionLegacyProjection["reason"] }); }); }
export function safePromotionError(value: unknown): PromotionSafeError { return freeze({ code: typeof value === "string" && PROMOTION_ERROR_CODES.includes(value as never) ? value as PromotionSafeError["code"] : "promotion_unavailable" }); }
