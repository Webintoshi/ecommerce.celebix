import {
  ABANDONED_CART_SORTS,
  ABANDONED_CART_STATUSES,
  type AbandonedCartSort,
  type AbandonedCartStatus,
  type TenantContext,
} from "@celebix/saas-contracts";

import { OrderRepositoryError } from "../orders/errors.ts";
import { orderAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { AbandonedCartRepositoryError, type AbandonedCartErrorCode } from "./errors.ts";

export const ABANDONED_CART_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(code: AbandonedCartErrorCode = "invalid_input"): never {
  throw new AbandonedCartRepositoryError(code);
}

export function exactAbandonedCartInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail();
  const parsed = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) fail();
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, parsed[key]])));
}

export function abandonedCartAuthority(context: TenantContext, now: Date): ValidatedOrderAuthority {
  try {
    return orderAuthority(context, now);
  } catch (error) {
    if (error instanceof OrderRepositoryError) {
      const code = error.code === "order_not_found" || error.code === "note_not_found" ? "durable_authority_invalid" : error.code;
      if (["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(code)) {
        fail(code as AbandonedCartErrorCode);
      }
    }
    fail("durable_authority_invalid");
  }
}

export function abandonedCartUuid(value: unknown): string {
  if (typeof value !== "string" || !ABANDONED_CART_UUID.test(value)) fail();
  return value;
}

export function abandonedCartVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1) fail();
  return value as number;
}

export function abandonedCartPageSize(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100) fail();
  return value as number;
}

export function abandonedCartStatus(value: unknown): AbandonedCartStatus {
  if (typeof value !== "string" || !ABANDONED_CART_STATUSES.includes(value as AbandonedCartStatus)) fail();
  return value as AbandonedCartStatus;
}

export function abandonedCartStatusFilter(value: unknown): AbandonedCartStatus | undefined {
  return value === undefined ? undefined : abandonedCartStatus(value);
}

export function abandonedCartSort(value: unknown): AbandonedCartSort {
  const selected = value === undefined ? "newest" : value;
  if (typeof selected !== "string" || !ABANDONED_CART_SORTS.includes(selected as AbandonedCartSort)) fail();
  return selected as AbandonedCartSort;
}

export function abandonedCartSearch(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value !== value.trim() || CONTROL.test(value)) fail();
  return value;
}
