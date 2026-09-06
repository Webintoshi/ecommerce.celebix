import {
  PROMOTION_AUDIENCE_MODES,
  PROMOTION_BENEFIT_KINDS,
  normalizePromotionCode,
  parsePromotionEvaluatorContext,
  parsePromotionRuleDocument,
  type PromotionEvaluatorContext,
  isMerchantActionAllowed,
  type PromotionRuleDocument,
  type StoreMembershipRole,
  type TenantContext,
} from "@celebix/saas-contracts";
import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { promotionFailure, promotionRepositoryErrorCode, type PromotionRepositoryErrorCode } from "./errors.ts";
import { PROMOTION_PICKER_KINDS, type PromotionListEffectiveStatus, type PromotionPickerKind, type PromotionTriggerKind } from "./types.ts";

export const PROMOTION_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/u;
const ISO_MILLISECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EFFECTIVE_STATUSES = new Set<PromotionListEffectiveStatus>([
  "draft", "scheduled", "active", "paused", "usage_exhausted", "budget_exhausted", "ended", "archived",
]);

function fail(code: PromotionRepositoryErrorCode = "invalid_input"): never { throw promotionFailure(code); }

function validUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

function safeAuthority(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > 12) fail("durable_authority_invalid");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) fail("durable_authority_invalid");
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail("durable_authority_invalid");
    const copied: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("durable_authority_invalid");
      copied.push(safeAuthority(descriptor.value, depth + 1));
    }
    return copied;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("durable_authority_invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value), copied = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail("durable_authority_invalid");
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("durable_authority_invalid");
    copied[key] = safeAuthority(descriptor.value, depth + 1);
  }
  return copied;
}

export function exactPromotionInput(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail();
    const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional]);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) fail();
    const output = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") fail();
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
      output[key] = descriptor.value;
    }
    return Object.freeze(output);
  } catch (error) {
    if (promotionFailureCode(error)) throw error;
    fail();
  }
}

function promotionFailureCode(value: unknown): boolean { return promotionRepositoryErrorCode(value) !== undefined; }

export interface ValidatedPromotionAuthority extends ValidatedOrderAuthority {
  readonly role: StoreMembershipRole;
}
export type PromotionAuthorityAction = "read" | "manage" | "manage_draft" | "publish" | "export_codes" | "archive";

export function promotionAuthority(context: TenantContext, now: Date, action: PromotionAuthorityAction = "read"): ValidatedPromotionAuthority {
  try {
    const safeContext = safeAuthority(context) as TenantContext;
    if (!(now instanceof Date) || Object.getPrototypeOf(now) !== Date.prototype) fail("durable_authority_invalid");
    const milliseconds = Date.prototype.getTime.call(now);
    if (!Number.isFinite(milliseconds)) fail("durable_authority_invalid");
    const authority = merchantAuthority(safeContext, new Date(milliseconds), "promotions");
    const role = safeContext.membership.role;
    if (!isMerchantActionAllowed(role, `promotions.${action}`)) fail("membership_denied");
    return Object.freeze({ ...authority, role });
  } catch (error) {
    if (promotionFailureCode(error)) throw error;
    if (error instanceof OrderRepositoryError && [
      "invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid",
    ].includes(error.code)) fail(error.code as PromotionRepositoryErrorCode);
    fail("durable_authority_invalid");
  }
}

export function promotionUuid(value: unknown): string {
  if (typeof value !== "string" || !PROMOTION_UUID.test(value)) fail();
  return value;
}

export function promotionVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > Number.MAX_SAFE_INTEGER) fail();
  return value as number;
}

export function promotionInteger(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail();
  return value as number;
}

export function promotionName(value: unknown): string {
  if (typeof value !== "string" || !validUnicode(value) || value.length < 1 || value.length > 200 || new TextEncoder().encode(value).length > 800 || value !== value.trim() || CONTROL.test(value)) fail();
  return value;
}

export function promotionRule(value: unknown): PromotionRuleDocument {
  try {
    const parsed = parsePromotionRuleDocument(value);
    if (parsed.trigger.kind === "code" && parsed.trigger.codes.length > 100) fail();
    return parsed;
  } catch (error) {
    if (promotionFailureCode(error)) throw error;
    return fail();
  }
}

export function promotionContext(value: unknown, storeId: string): PromotionEvaluatorContext {
  try {
    const parsed = parsePromotionEvaluatorContext(value);
    if (parsed.storeId !== storeId || (parsed.salesChannel !== "storefront" && parsed.salesChannel !== "quick_order")) fail();
    return parsed;
  } catch { return fail(); }
}

export function promotionPageSize(value: unknown, maximum = 100): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) fail();
  return value as number;
}

export function promotionSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !validUnicode(value) || value.length < 1 || value.length > 100 || new TextEncoder().encode(value).length > 400 || value !== value.trim() || CONTROL.test(value)) fail();
  return value;
}

function exactSet<T extends string>(value: unknown, allowed: ReadonlySet<string>, maximum: number): readonly T[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  const output: T[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable || typeof descriptor.value !== "string" || !allowed.has(descriptor.value)) fail();
    output.push(descriptor.value as T);
  }
  if (new Set(output).size !== output.length) fail();
  output.sort();
  return Object.freeze(output);
}

export function promotionEffectiveStatuses(value: unknown): readonly PromotionListEffectiveStatus[] {
  return exactSet(value, EFFECTIVE_STATUSES, 8);
}
export function promotionTriggerKinds(value: unknown): readonly PromotionTriggerKind[] {
  return exactSet(value, new Set(["automatic", "code"]), 2);
}
export function promotionBenefitKinds(value: unknown) {
  return exactSet<(typeof PROMOTION_BENEFIT_KINDS)[number]>(value, new Set(PROMOTION_BENEFIT_KINDS), 7);
}
export function promotionAudienceModes(value: unknown) {
  return exactSet<(typeof PROMOTION_AUDIENCE_MODES)[number]>(value, new Set(PROMOTION_AUDIENCE_MODES), 6);
}
export function promotionPickerKind(value: unknown): PromotionPickerKind {
  if (typeof value !== "string" || !PROMOTION_PICKER_KINDS.includes(value as PromotionPickerKind)) fail();
  return value as PromotionPickerKind;
}

export function promotionIds(value: unknown, maximum = 500): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > maximum) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value), output: string[] = [];
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail();
    output.push(promotionUuid(descriptor.value));
  }
  output.sort();
  if (new Set(output).size !== output.length) fail();
  return Object.freeze(output);
}

export function promotionBatchPrefix(value: unknown): string {
  if (typeof value !== "string" || !/^(|[A-Z0-9][A-Z0-9_-]{0,19})$/.test(value)) fail();
  return value;
}

export function promotionBatchStatus(value: unknown): "active" | "paused" | "revoked" {
  if (value !== "active" && value !== "paused" && value !== "revoked") fail();
  return value;
}

export function promotionOptionalExpiry(value: unknown, now: Date): Date | null {
  if (value === null) return null;
  const timestamp = promotionTimestamp(value);
  const parsed = new Date(timestamp);
  if (parsed <= now) fail();
  return parsed;
}

export function promotionTimestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_MILLISECONDS.test(value)) fail();
  const selected = new Date(value);
  if (!Number.isFinite(selected.getTime()) || selected.toISOString() !== value) fail();
  return value;
}

export function promotionScheduleRange(from: unknown, to: unknown): Readonly<{ from: string | null; to: string | null }> {
  if ((from === undefined) !== (to === undefined)) fail();
  if (from === undefined) return Object.freeze({ from: null, to: null });
  const parsedFrom = promotionTimestamp(from), parsedTo = promotionTimestamp(to);
  if (parsedFrom >= parsedTo) fail();
  return Object.freeze({ from: parsedFrom, to: parsedTo });
}

export function promotionCodes(value: unknown, maximum = 10_000): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) fail();
  const output: string[] = [];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
    try { output.push(normalizePromotionCode(descriptor.value)); } catch { fail(); }
  }
  if (new Set(output).size !== output.length) fail();
  output.sort();
  return Object.freeze(output);
}
