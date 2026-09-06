import type {
  PromotionAnalytics,
  PromotionAnalyticsDetailResult,
  PromotionAnalyticsPeriodDays,
  PromotionAudienceMode,
  PromotionBenefitKind,
  PromotionCodeBatch,
  PromotionCodeBatchListItem,
  PromotionDetail,
  PromotionEvaluatorContext,
  PromotionLegacyProjection,
  PromotionOverviewResult,
  PromotionRuleDocument,
  PromotionSimulatorResponse,
  TenantContext,
} from "@celebix/saas-contracts";
import type { PostgresPoolLike, PostgresTimeoutOptions } from "../postgres/pool.ts";

export interface PromotionAuthorityInput {
  readonly tenantContext: TenantContext;
  readonly now: Date;
}

export type PromotionListEffectiveStatus =
  | "draft" | "scheduled" | "active" | "paused"
  | "usage_exhausted" | "budget_exhausted" | "ended" | "archived";
export type PromotionTriggerKind = "automatic" | "code";

export interface PromotionListItem {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly status: PromotionDetail["status"];
  readonly effectiveStatus: PromotionListEffectiveStatus;
  readonly triggerKind: PromotionTriggerKind;
  readonly benefitKind: PromotionBenefitKind;
  readonly audienceMode: PromotionAudienceMode;
  readonly humanMechanic: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly usage: Readonly<{ used: number; budgetMinor: number }>;
  readonly financials: readonly Readonly<{
    currency: string;
    redemptions: number;
    discountMinor: number;
    revenueMinor: number;
  }>[];
  readonly activeCodeCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ListPromotionsInput extends PromotionAuthorityInput {
  readonly pageSize: number;
  readonly cursor?: string;
  readonly search?: string;
  readonly effectiveStatuses?: readonly PromotionListEffectiveStatus[];
  readonly triggerKinds?: readonly PromotionTriggerKind[];
  readonly benefitKinds?: readonly PromotionBenefitKind[];
  readonly audienceModes?: readonly PromotionAudienceMode[];
  readonly scheduleFrom?: string;
  readonly scheduleTo?: string;
}

export interface PromotionListResult {
  readonly items: readonly PromotionListItem[];
  readonly nextCursor: string | null;
}

export interface PromotionMutationResult {
  readonly promotion: PromotionDetail;
  readonly replayed: boolean;
}
export interface PromotionCodeBatchMutationResult {
  readonly batch: PromotionCodeBatch;
  readonly replayed: boolean;
}

export interface GetPromotionInput extends PromotionAuthorityInput { readonly promotionId: string }
export interface CreatePromotionInput extends PromotionAuthorityInput {
  readonly operationId: string;
  readonly name: string;
  readonly ruleDocument: PromotionRuleDocument;
}
export interface UpdatePromotionInput extends GetPromotionInput {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly name: string;
  readonly ruleDocument: PromotionRuleDocument;
}
export interface PromotionOperationInput extends GetPromotionInput {
  readonly operationId: string;
  readonly expectedVersion: number;
}
export interface PublishPromotionInput extends PromotionOperationInput { readonly nextStatus: "active" | "scheduled" }
export type PausePromotionInput = PromotionOperationInput;
export interface ResumePromotionInput extends PromotionOperationInput { readonly nextStatus: "active" | "scheduled" }
export type ArchivePromotionInput = PromotionOperationInput;
export interface DuplicatePromotionInput extends GetPromotionInput {
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly name: string;
  readonly codes: readonly string[];
}

export interface SimulatePromotionInput extends PromotionAuthorityInput {
  readonly promotionId: string;
  readonly expectedVersion: number | null;
  readonly name: string;
  readonly ruleDocument: PromotionRuleDocument;
  readonly context: PromotionEvaluatorContext;
}
export interface CheckPromotionInput extends PromotionAuthorityInput {
  readonly promotionId?: string;
  readonly expectedVersion?: number;
  readonly ruleDocument: PromotionRuleDocument;
}

export const PROMOTION_PICKER_KINDS = Object.freeze([
  "product", "variant", "category", "brand", "collection",
  "customer_segment", "customer_tag", "masked_customer", "abandoned_cart", "payment_method", "shipping_method",
] as const);
export type PromotionPickerKind = (typeof PROMOTION_PICKER_KINDS)[number];
export interface PromotionPickerItem {
  readonly kind: PromotionPickerKind;
  readonly id: string;
  readonly label: string;
  readonly status: "active" | "unavailable";
}
export interface ListPromotionPickerInput extends PromotionAuthorityInput {
  readonly kind: PromotionPickerKind;
  readonly pageSize: number;
  readonly cursor?: string;
  readonly search?: string;
}
export interface PromotionPickerListResult { readonly items: readonly PromotionPickerItem[]; readonly nextCursor: string | null }
export interface ResolvePromotionPickerInput extends PromotionAuthorityInput { readonly kind: PromotionPickerKind; readonly ids: readonly string[] }

export interface PromotionConflictFinding {
  readonly code:
    | "benefit_currency_mismatch" | "budget_zero" | "coupon_code_conflict"
    | "customer_usage_limit_zero" | "gift_stock_unavailable" | "margin_percentage_zero"
    | "no_eligible_catalog_items" | "order_maximum_zero" | "reference_unavailable"
    | "schedule_ended" | "target_include_exclude_conflict" | "usage_limit_zero"
    | "schedule_target_overlap" | "discount_may_exceed_item_price";
  readonly severity: "blocking" | "warning";
  readonly relatedPromotionId: string | null;
  readonly relatedPromotionName: string | null;
}
export interface PromotionConflictCheck { readonly blocking: boolean; readonly findings: readonly PromotionConflictFinding[] }
export interface PromotionMarginFinding {
  readonly code: "below_cost_risk" | "cost_unknown";
  readonly severity: "warning";
  readonly count: number;
  readonly sampleVariantIds: readonly string[];
}
export interface PromotionMarginCheck {
  readonly blocking: false;
  readonly status: "clear" | "warning" | "unknown";
  readonly summary: Readonly<{
    evaluatedVariantCount: number;
    knownCostVariantCount: number;
    unknownCostVariantCount: number;
    atRiskVariantCount: number;
  }>;
  readonly findings: readonly PromotionMarginFinding[];
}

export interface CreatePromotionCodeBatchInput extends GetPromotionInput {
  readonly operationId: string;
  readonly count: number;
  readonly prefix: string;
  readonly codeLength: number;
  readonly perCustomerUsage: number;
  readonly expiresAt: string | null;
}
export interface UpdatePromotionCodeBatchStatusInput extends PromotionAuthorityInput {
  readonly operationId: string;
  readonly batchId: string;
  readonly expectedVersion: number;
  readonly nextStatus: "active" | "paused" | "revoked";
}
export interface ListPromotionCodeBatchesInput extends GetPromotionInput { readonly pageSize: number; readonly cursor?: string }
export interface PromotionCodeBatchPage { readonly items: readonly PromotionCodeBatchListItem[]; readonly nextCursor: string | null }
export interface ExportPromotionCodesInput extends PromotionAuthorityInput { readonly batchId: string }
export interface PromotionCodeCsvExport { readonly rows: readonly Readonly<{ code: string; status: "active" | "paused" | "revoked" }>[] }
export interface PromotionAnalyticsResult { readonly items: readonly PromotionAnalytics[] }
export interface GetPromotionAnalyticsInput extends GetPromotionInput { readonly days: PromotionAnalyticsPeriodDays }
export interface GetPromotionOverviewInput extends PromotionAuthorityInput { readonly days: PromotionAnalyticsPeriodDays }

export interface ListPromotionLegacyInput extends PromotionAuthorityInput { readonly pageSize: number; readonly cursor?: string }
export interface PromotionLegacyPage { readonly items: readonly PromotionLegacyProjection[]; readonly nextCursor: string | null }
export interface ResolvePromotionLegacyInput extends PromotionAuthorityInput { readonly legacyRecordId: string }

export interface PromotionRepository {
  timezone(input: PromotionAuthorityInput): Promise<string>;
  storefrontOrigin(input: PromotionAuthorityInput): Promise<string | null>;
  list(input: ListPromotionsInput): Promise<PromotionListResult>;
  detail(input: GetPromotionInput): Promise<PromotionDetail>;
  create(input: CreatePromotionInput): Promise<PromotionMutationResult>;
  update(input: UpdatePromotionInput): Promise<PromotionMutationResult>;
  publish(input: PublishPromotionInput): Promise<PromotionMutationResult>;
  pause(input: PausePromotionInput): Promise<PromotionMutationResult>;
  resume(input: ResumePromotionInput): Promise<PromotionMutationResult>;
  duplicate(input: DuplicatePromotionInput): Promise<PromotionMutationResult>;
  archive(input: ArchivePromotionInput): Promise<PromotionMutationResult>;
  simulate(input: SimulatePromotionInput): Promise<PromotionSimulatorResponse>;
  conflicts(input: CheckPromotionInput): Promise<PromotionConflictCheck>;
  margin(input: CheckPromotionInput): Promise<PromotionMarginCheck>;
  listTargets(input: ListPromotionPickerInput): Promise<PromotionPickerListResult>;
  resolveTargets(input: ResolvePromotionPickerInput): Promise<readonly PromotionPickerItem[]>;
  createCodeBatch(input: CreatePromotionCodeBatchInput): Promise<PromotionCodeBatchMutationResult>;
  updateCodeBatchStatus(input: UpdatePromotionCodeBatchStatusInput): Promise<PromotionCodeBatchMutationResult>;
  listCodeBatches(input: ListPromotionCodeBatchesInput): Promise<PromotionCodeBatchPage>;
  exportCodes(input: ExportPromotionCodesInput): Promise<PromotionCodeCsvExport>;
  analytics(input: GetPromotionInput): Promise<PromotionAnalyticsResult>;
  analyticsDetail(input: GetPromotionAnalyticsInput): Promise<PromotionAnalyticsDetailResult>;
  overview(input: GetPromotionOverviewInput): Promise<PromotionOverviewResult>;
  listLegacy(input: ListPromotionLegacyInput): Promise<PromotionLegacyPage>;
  resolveLegacy(input: ResolvePromotionLegacyInput): Promise<PromotionLegacyProjection>;
}

export type PromotionAuditEvent = Readonly<{ type: "promotion_commit_unknown" }>;
export interface PostgresPromotionRepositoryOptions {
  readonly pool: PostgresPoolLike;
  readonly role: "celebix_saas_app";
  readonly timeouts: PostgresTimeoutOptions;
  readonly uuid: () => string;
  readonly audit: (event: PromotionAuditEvent) => void | Promise<void>;
}
