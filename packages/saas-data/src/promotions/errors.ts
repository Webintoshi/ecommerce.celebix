import type { PromotionCodeBatch, PromotionDetail } from "@celebix/saas-contracts";
import type { PromotionConflictCheck } from "./types.ts";

export const PROMOTION_REPOSITORY_ERROR_CODES = Object.freeze([
  "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled",
  "durable_authority_invalid",
  "resource_not_found", "invalid_transition", "version_conflict", "idempotency_mismatch",
  "invalid_reference", "code_conflict", "active_code_batches", "promotion_limit_reached", "publish_blocked",
  "projection_unavailable", "operation_result_invalid", "conflict", "unavailable",
] as const);
export type PromotionRepositoryErrorCode = (typeof PROMOTION_REPOSITORY_ERROR_CODES)[number];

const TRUSTED = new WeakSet<object>();
type Detail =
  | Readonly<{ code: "version_conflict"; current: PromotionDetail | PromotionCodeBatch }>
  | Readonly<{ code: "publish_blocked"; readiness: PromotionConflictCheck }>
  | Readonly<{ code: Exclude<PromotionRepositoryErrorCode, "version_conflict" | "publish_blocked"> }>;
class PromotionRepositoryFailure extends Error {
  readonly code: PromotionRepositoryErrorCode;
  readonly detail: Detail;
  constructor(detail: Detail) {
    const code = detail.code;
    super(code);
    this.name = "PromotionRepositoryError";
    this.code = code;
    this.detail = detail;
    TRUSTED.add(this);
    Object.freeze(this);
  }
}

export function promotionFailure(code: PromotionRepositoryErrorCode, payload?: Readonly<{ current?: PromotionDetail | PromotionCodeBatch; readiness?: PromotionConflictCheck }>): Error {
  if (code === "version_conflict" && payload?.current) return new PromotionRepositoryFailure(Object.freeze({ code, current: payload.current }));
  if (code === "publish_blocked" && payload?.readiness) return new PromotionRepositoryFailure(Object.freeze({ code, readiness: payload.readiness }));
  if (code === "version_conflict" || code === "publish_blocked") return new PromotionRepositoryFailure(Object.freeze({ code: "unavailable" }));
  return new PromotionRepositoryFailure(Object.freeze({ code }) as Detail);
}

export function promotionRepositoryErrorCode(value: unknown): PromotionRepositoryErrorCode | undefined {
  try {
    return ((typeof value === "object" || typeof value === "function") && value !== null && TRUSTED.has(value))
      ? (value as PromotionRepositoryFailure).code
      : undefined;
  } catch { return undefined; }
}

export function promotionRepositoryError(value: unknown): Detail | undefined {
  try {
    return ((typeof value === "object" || typeof value === "function") && value !== null && TRUSTED.has(value))
      ? (value as PromotionRepositoryFailure).detail
      : undefined;
  } catch { return undefined; }
}
