import { parsePriceListItem, parsePriceListRule, type PriceListItem, type PriceListRule, type TenantContext } from "@celebix/saas-contracts";
import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { pricingFailure, type PricingErrorCode } from "./errors.ts";

export const PRICING_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
function fail(code: PricingErrorCode = "invalid_input"): never { throw pricingFailure(code); }
function safeAuthority(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object") return value;
  if (depth > 12) fail("durable_authority_invalid");
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) fail("durable_authority_invalid");
    const descriptors = Object.getOwnPropertyDescriptors(value); if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail("durable_authority_invalid");
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) { const descriptor = descriptors[String(index)]; if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("durable_authority_invalid"); output.push(safeAuthority(descriptor.value, depth + 1)); }
    return output;
  }
  const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) fail("durable_authority_invalid");
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(Object.getOwnPropertyDescriptors(value))) { if (typeof key !== "string") fail("durable_authority_invalid"); const descriptor = Object.getOwnPropertyDescriptor(value, key); if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail("durable_authority_invalid"); output[key] = safeAuthority(descriptor.value, depth + 1); }
  return output;
}
export function exactPricingInput(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
    const prototype = Object.getPrototypeOf(value); if (prototype !== Object.prototype && prototype !== null) fail();
    const descriptors = Object.getOwnPropertyDescriptors(value), allowed = new Set([...required, ...optional]), keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) fail();
    const output = Object.create(null) as Record<string, unknown>;
    for (const key of keys) { if (typeof key !== "string") fail(); const descriptor = descriptors[key]; if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(); output[key] = descriptor.value; }
    return Object.freeze(output);
  } catch { fail(); }
}
export function pricingAuthority(context: TenantContext, now: Date): ValidatedOrderAuthority {
  let safeContext: TenantContext, safeNow: Date;
  try { safeContext = safeAuthority(context) as TenantContext; if (!(now instanceof Date) || Object.getPrototypeOf(now) !== Date.prototype) fail("durable_authority_invalid"); const timestamp = Date.prototype.getTime.call(now); if (!Number.isFinite(timestamp)) fail("durable_authority_invalid"); safeNow = new Date(timestamp); }
  catch { fail("durable_authority_invalid"); }
  try { return merchantAuthority(safeContext, safeNow, "catalog"); }
  catch (error) { if (error instanceof OrderRepositoryError && ["invalid_input", "unauthenticated", "membership_denied", "store_inactive", "feature_not_enabled", "durable_authority_invalid"].includes(error.code)) fail(error.code as PricingErrorCode); fail("durable_authority_invalid"); }
}
export function pricingUuid(value: unknown): string { if (typeof value !== "string" || !PRICING_UUID.test(value)) fail(); return value; }
export function pricingVersion(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) >= Number.MAX_SAFE_INTEGER) fail(); return value as number; }
export function pricingText(value: unknown): string { if (typeof value !== "string" || value.length < 1 || value.length > 200 || value !== value.trim() || CONTROL.test(value)) fail(); return value; }
function dense(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > maximum) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value); if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
  const output: unknown[] = []; for (let index = 0; index < value.length; index += 1) { const descriptor = descriptors[String(index)]; if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) fail(); output.push(descriptor.value); } return output;
}
export function pricingItems(value: unknown): readonly PriceListItem[] {
  try { const items = dense(value, 500).map(parsePriceListItem); if (new Set(items.map(({ variantId }) => variantId)).size !== items.length) fail(); return Object.freeze(items); } catch { fail(); }
}
export function pricingRules(value: unknown): readonly PriceListRule[] { try { return Object.freeze(dense(value, 100).map(parsePriceListRule)); } catch { fail(); } }
