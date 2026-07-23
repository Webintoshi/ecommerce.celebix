import type { TenantContext } from "@celebix/saas-contracts";

import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { inventoryFailure, type InventoryErrorCode } from "./errors.ts";

export const INVENTORY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_QUANTITY = 2_147_483_647;
const MAX_MONEY = 8_000_000_000;

function fail(code: InventoryErrorCode = "invalid_input"): never { throw inventoryFailure(code); }

function authorityData(value: unknown, depth = 0): unknown {
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
      copied.push(authorityData(descriptor.value, depth + 1));
    }
    return copied;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail("durable_authority_invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copied = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== "string") fail("durable_authority_invalid");
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail("durable_authority_invalid");
    }
    copied[key] = authorityData(descriptor.value, depth + 1);
  }
  return copied;
}

export function exactInventoryInput(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const allowed = new Set([...required, ...optional]);
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
      required.some((key) => !Object.hasOwn(descriptors, key))
    ) fail();
    const result = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") fail();
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch { fail(); }
}

export function inventoryAuthority(context: TenantContext, now: Date): ValidatedOrderAuthority {
  let safeContext: TenantContext, safeNow: Date;
  try {
    safeContext = authorityData(context) as TenantContext;
    if (!(now instanceof Date) || Object.getPrototypeOf(now) !== Date.prototype) fail("durable_authority_invalid");
    const timestamp = Date.prototype.getTime.call(now);
    if (!Number.isFinite(timestamp)) fail("durable_authority_invalid");
    safeNow = new Date(timestamp);
  } catch { fail("durable_authority_invalid"); }
  try {
    return merchantAuthority(safeContext, safeNow, "catalog");
  } catch (error) {
    if (
      error instanceof OrderRepositoryError &&
      ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(error.code)
    ) fail(error.code as InventoryErrorCode);
    fail("durable_authority_invalid");
  }
}

export function inventoryUuid(value: unknown): string {
  if (typeof value !== "string" || !INVENTORY_UUID.test(value)) fail();
  return value;
}

export function inventoryVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= Number.MAX_SAFE_INTEGER) fail();
  return value as number;
}

export function inventoryQuantity(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > MAX_QUANTITY) fail();
  return value as number;
}

export function inventoryMoney(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > MAX_MONEY) fail();
  return value as number;
}

export function inventoryText(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string" || value.length < minimum || value.length > maximum ||
    value !== value.trim() || CONTROL.test(value)
  ) fail();
  return value;
}

function denseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 500) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  const result: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail();
    result.push(descriptor.value);
  }
  return result;
}

function unique<T extends Readonly<{ lineId: string; variantId?: string }>>(lines: readonly T[]): readonly T[] {
  if (new Set(lines.map((line) => line.lineId)).size !== lines.length) fail();
  const variants = lines.flatMap((line) => line.variantId === undefined ? [] : [line.variantId]);
  if (new Set(variants).size !== variants.length) fail();
  return Object.freeze(lines);
}

export function purchaseSaveLines(value: unknown) {
  let total = 0;
  const lines = denseArray(value).map((entry) => {
    const parsed = exactInventoryInput(entry, ["lineId", "variantId", "orderedQuantity", "unitCostCents"]);
    const orderedQuantity = inventoryQuantity(parsed.orderedQuantity, 1);
    const unitCostCents = inventoryMoney(parsed.unitCostCents);
    const lineTotal = orderedQuantity * unitCostCents;
    if (!Number.isSafeInteger(lineTotal) || lineTotal > MAX_MONEY) fail();
    total += lineTotal;
    if (!Number.isSafeInteger(total) || total > MAX_MONEY) fail();
    return Object.freeze({
      lineId: inventoryUuid(parsed.lineId),
      variantId: inventoryUuid(parsed.variantId),
      orderedQuantity,
      unitCostCents,
    });
  });
  return unique(lines);
}

export function purchaseReceiptLines(value: unknown) {
  const lines = denseArray(value).map((entry) => {
    const parsed = exactInventoryInput(entry, ["lineId", "quantity"]);
    return Object.freeze({ lineId: inventoryUuid(parsed.lineId), quantity: inventoryQuantity(parsed.quantity, 1) });
  });
  return unique(lines);
}

export function countSaveLines(value: unknown) {
  const lines = denseArray(value).map((entry) => {
    const parsed = exactInventoryInput(entry, ["lineId", "variantId"], ["countedQuantity"]);
    return Object.freeze({
      lineId: inventoryUuid(parsed.lineId),
      variantId: inventoryUuid(parsed.variantId),
      ...(Object.hasOwn(parsed, "countedQuantity") ? { countedQuantity: inventoryQuantity(parsed.countedQuantity) } : {}),
    });
  });
  return unique(lines);
}

export function transferSaveLines(value: unknown) {
  const lines = denseArray(value).map((entry) => {
    const parsed = exactInventoryInput(entry, ["lineId", "variantId", "quantity"]);
    return Object.freeze({
      lineId: inventoryUuid(parsed.lineId),
      variantId: inventoryUuid(parsed.variantId),
      quantity: inventoryQuantity(parsed.quantity, 1),
    });
  });
  return unique(lines);
}
