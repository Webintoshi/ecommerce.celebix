export const PROMOTION_BENEFIT_KINDS = Object.freeze([
  "percentage", "fixed_amount", "free_shipping", "buy_x_get_y", "quantity_tiers", "bundle_price", "gift",
] as const);
export const PROMOTION_STATUSES = Object.freeze(["draft", "scheduled", "active", "paused", "archived"] as const);
export const PROMOTION_EFFECTIVE_STATUSES = Object.freeze(["draft", "scheduled", "active", "paused", "archived", "ended", "exhausted"] as const);
export const PROMOTION_TARGET_KINDS = Object.freeze(["product", "variant", "category", "brand", "collection"] as const);
export const PROMOTION_AUDIENCE_MODES = Object.freeze(["everyone", "first_paid_order", "customer_segments", "customer_tags", "masked_customers", "abandoned_cart"] as const);
export const PROMOTION_ERROR_CODES = Object.freeze(["operation_mismatch", "promotion_unavailable", "not_found", "version_conflict", "not_eligible", "invalid_code"] as const);
export const PROMOTION_REJECTION_REASONS = Object.freeze(["customer_identity_required", "margin_unknown_cost", "conditions_not_met", "not_combinable", "not_eligible"] as const);

export type PromotionBenefitKind = (typeof PROMOTION_BENEFIT_KINDS)[number];
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];
export type PromotionEffectiveStatus = (typeof PROMOTION_EFFECTIVE_STATUSES)[number];
export type PromotionTargetKind = (typeof PROMOTION_TARGET_KINDS)[number];
export type PromotionAudienceMode = (typeof PROMOTION_AUDIENCE_MODES)[number];
export type PromotionErrorCode = (typeof PROMOTION_ERROR_CODES)[number];
export type PromotionRejectionReason = (typeof PROMOTION_REJECTION_REASONS)[number];

export type PromotionBenefit =
  | { readonly kind: "percentage"; readonly percentageBps: number }
  | { readonly kind: "fixed_amount"; readonly amountMinor: number; readonly currency: string }
  | { readonly kind: "free_shipping" }
  | { readonly kind: "buy_x_get_y"; readonly buyQuantity: number; readonly receiveQuantity: number; readonly discountPercentageBps: number; readonly reward: { readonly strategy: "same_product_cheapest" } | { readonly strategy: "selected_products_cheapest"; readonly productIds: readonly string[] } | { readonly strategy: "specific_variant"; readonly variantId: string } }
  | { readonly kind: "quantity_tiers"; readonly tiers: readonly { readonly minimumQuantity: number; readonly percentageBps: number }[] }
  | { readonly kind: "bundle_price"; readonly items: readonly { readonly variantId: string; readonly quantity: number }[]; readonly bundlePriceMinor: number; readonly currency: string }
  | { readonly kind: "gift"; readonly giftVariantId: string; readonly quantity: number; readonly autoAdd: boolean };

export interface PromotionTargetReference { readonly kind: PromotionTargetKind; readonly id: string }
export interface PromotionTargets { readonly mode: "all" | "selected"; readonly include: readonly PromotionTargetReference[]; readonly exclude: readonly PromotionTargetReference[] }
export interface PromotionAudience { readonly mode: PromotionAudienceMode; readonly referenceIds?: readonly string[] }
export type PromotionTrigger = { readonly kind: "automatic" } | { readonly kind: "code"; readonly codes: readonly string[] };
export interface PromotionSchedule { readonly timezone: string; readonly startsAt?: string; readonly endsAt?: string }
export interface PromotionLimits { readonly totalUsage: number | null; readonly perCustomerUsage: number | null; readonly budgetMinor: number | null; readonly orderMaximumMinor: number | null }
export interface PromotionConditions { readonly minimumBasketMinor: number; readonly minimumQuantity: number; readonly minimumProductQuantity: number; readonly paymentMethodIds?: readonly string[]; readonly shippingMethodIds?: readonly string[]; readonly salesChannels?: readonly string[] }
export type PromotionCombinationPolicy = { readonly kind: "none" } | { readonly kind: "shipping_only" } | { readonly kind: "benefit_classes"; readonly benefitClasses: readonly PromotionBenefitKind[] };
export type PromotionMarginPolicy = { readonly kind: "warn" } | { readonly kind: "floor_at_cost" } | { readonly kind: "maximum_percentage"; readonly maximumPercentageBps: number };
export interface PromotionProgressMessagePolicy { readonly enabled: boolean }
export interface PromotionRuleDocument { readonly schemaVersion: 1; readonly benefit: PromotionBenefit; readonly targets: PromotionTargets; readonly audience: PromotionAudience; readonly trigger: PromotionTrigger; readonly schedule: PromotionSchedule; readonly limits: PromotionLimits; readonly conditions: PromotionConditions; readonly combinationPolicy: PromotionCombinationPolicy; readonly priority: number; readonly marginPolicy: PromotionMarginPolicy; readonly progressMessagePolicy: PromotionProgressMessagePolicy }

export interface PromotionLifecycleInput { readonly status: PromotionStatus; readonly schedule: PromotionSchedule; readonly usage: { readonly total: number; readonly budgetSpentMinor: number }; readonly limits: Pick<PromotionLimits, "totalUsage" | "budgetMinor">; readonly now: string }
export interface PromotionEvaluatorContext { readonly storeId: string; readonly customerId: string | null; readonly paidOrderCount: number; readonly customerSegmentIds: readonly string[]; readonly customerTagIds: readonly string[]; readonly cartLines: readonly PromotionEvaluatorCartLine[]; readonly shippingMethodId: string | null; readonly paymentMethodId: string | null; readonly shippingBeforeDiscountMinor: number; readonly currency: string; readonly storeLocalTime: string; readonly salesChannel: string; readonly submittedCodes: readonly string[]; readonly abandonedCart: { readonly id: string } | null }
export interface PromotionEvaluatorCartLine { readonly lineId: string; readonly position: number; readonly productId: string; readonly variantId: string; readonly quantity: number; readonly unitPriceMinor: number; readonly unitCostMinor: number | null; readonly currency: string; readonly categoryIds: readonly string[]; readonly brandId: string | null; readonly collectionIds: readonly string[] }
export type PromotionGiftEffect =
  | { readonly promotionId: string; readonly variantId: string; readonly quantity: number; readonly paidMinor: 0; readonly autoAdd: true }
  | { readonly promotionId: string; readonly variantId: string; readonly quantity: number; readonly paidMinor: 0; readonly autoAdd: false; readonly lineId: string };
export interface PromotionEvaluatorResult { readonly eligiblePromotionIds: readonly string[]; readonly appliedPromotions: readonly { readonly promotionId: string; readonly version: number; readonly name: string; readonly benefitKind: PromotionBenefitKind; readonly normalizedCode?: string; readonly lineDiscountMinor: number; readonly shippingDiscountMinor: number; readonly discountTotalMinor: number }[]; readonly rejectedPromotions: readonly { readonly promotionId: string; readonly reason: PromotionRejectionReason }[]; readonly lineEffects: readonly { readonly promotionId: string; readonly lineId: string; readonly discountMinor: number; readonly giftQuantity: 0 }[]; readonly shippingEffects: readonly { readonly promotionId: string; readonly discountMinor: number }[]; readonly gifts: readonly PromotionGiftEffect[]; readonly subtotalBeforeDiscountMinor: number; readonly lineDiscountTotalMinor: number; readonly shippingBeforeDiscountMinor: number; readonly shippingDiscountTotalMinor: number; readonly discountTotalMinor: number; readonly grandTotalMinor: number; readonly currency: string; readonly progressMessages: readonly string[]; readonly merchantExplanation: "evaluated" | "promotion_configuration_limit_exceeded" | "promotion_context_unavailable" }
export type PromotionCapturedRangeKind = "sale" | "gift" | "buy_x_get_y";
export interface PromotionCapturedRange { readonly startOrdinal: number; readonly quantity: number; readonly grossUnitMinor: number; readonly discountUnitMinor: number; readonly kind: PromotionCapturedRangeKind }
export interface PromotionOrderDiscountLine { readonly lineId: string; readonly position: number; readonly discountMinor: number; readonly capturedRanges: readonly PromotionCapturedRange[] }
export type PromotionOrderGiftLine =
  | { readonly variantId: string; readonly quantity: number; readonly paidMinor: 0; readonly autoAdd: true }
  | { readonly variantId: string; readonly quantity: number; readonly paidMinor: 0; readonly autoAdd: false; readonly lineId: string };
export interface PromotionOrderSnapshot { readonly promotionId: string; readonly promotionVersion: number; readonly promotionName: string; readonly couponCode: string | null; readonly benefit: PromotionBenefit; readonly targets: PromotionTargets; readonly discountLines: readonly PromotionOrderDiscountLine[]; readonly shippingDiscountMinor: number; readonly giftLines: readonly PromotionOrderGiftLine[]; readonly discountTotalMinor: number; readonly currency: string; readonly evaluatedAt: string }
export interface PromotionListQuery { readonly cursor: string | null; readonly limit: number; readonly search?: string; readonly statuses: readonly PromotionStatus[] }
export interface PromotionDetail { readonly id: string; readonly version: number; readonly name: string; readonly status: PromotionStatus; readonly ruleDocument: PromotionRuleDocument; readonly createdAt: string; readonly updatedAt: string }
export interface PromotionSimulatorResponse { readonly evaluation: PromotionEvaluatorResult; readonly mutated: false }
export interface PromotionCodeBatch { readonly id: string; readonly promotionId: string; readonly version: number; readonly status: "active" | "paused" | "revoked"; readonly count: number; readonly prefix: string; readonly codeLength: number; readonly perCustomerUsage: number; readonly expiresAt: string | null; readonly createdAt: string; readonly updatedAt: string }
export interface PromotionCodeBatchListItem extends PromotionCodeBatch { readonly used: number; readonly held: number; readonly remaining: number }
export interface PromotionCodeBatchListResult { readonly items: readonly PromotionCodeBatchListItem[]; readonly hasMore: boolean; readonly snapshotAt: string; readonly cursorAnchor: { readonly createdAt: string; readonly id: string } | null }
export interface PromotionCsvRow { readonly code: string; readonly status: "active" | "paused" | "revoked" }
export interface PromotionAnalytics { readonly currency: string; readonly redemptions: number; readonly discountMinor: number; readonly revenueMinor: number; readonly conversionBps: number }
export type PromotionLegacyReason = "adopted" | "unsupported_discount_type" | "invalid_value" | "invalid_minimum_order" | "invalid_usage_limit" | "invalid_code" | "code_conflict" | "invalid_legacy_record";
export interface PromotionLegacyProjection { readonly legacyRecordId: string; readonly promotionId: string | null; readonly reason: PromotionLegacyReason }
export interface PromotionSafeError { readonly code: PromotionErrorCode }
