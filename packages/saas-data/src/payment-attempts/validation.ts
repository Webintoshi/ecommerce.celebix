import { types as nodeTypes } from "node:util";

import {
  providerPublicConfig,
  providerSealedCredential,
} from "../provider-execution/canonical.ts";
import type { SealedMerchantProviderCredential } from "../provider-execution/credential-crypto.ts";
import {
  isTrustedPaymentAttemptError,
  trustedPaymentAttemptError,
} from "./errors.ts";
import type {
  PaymentAttemptEnvironment,
  PaymentAttemptStatus,
  StoreAuthority,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const ORDER_REFERENCE = /^[A-Za-z0-9._:-]{1,128}$/;
const CURRENCY = /^[A-Z]{3}$/;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const WORKER = /^[A-Za-z0-9._-]{1,128}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const SURROGATE = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/;
const MAXIMUM_SAFE_INTEGER = 9_007_199_254_740_991;

function invalid(): never {
  throw trustedPaymentAttemptError("invalid_input");
}

function contained<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (isTrustedPaymentAttemptError(error)) throw error;
    return invalid();
  }
}

export function exactPaymentAttemptInput(
  value: unknown,
  required: readonly string[],
): Readonly<Record<string, unknown>> {
  return contained(() => {
    if (
      typeof value !== "object"
      || value === null
      || Array.isArray(value)
      || nodeTypes.isProxy(value)
    ) invalid();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<PropertyKey, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== required.length
      || keys.some((key) => typeof key !== "string" || !required.includes(key))
      || required.some((key) => !Object.hasOwn(descriptors, key))
    ) invalid();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of required) {
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  });
}

export function paymentAttemptUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

export function paymentAttemptDigest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}

export function paymentAttemptProviderCode(value: unknown): string {
  if (
    typeof value !== "string"
    || !PROVIDER_CODE.test(value)
    || value === "dummy_payment"
  ) invalid();
  return value;
}

export function paymentAttemptOrderReference(value: unknown): string {
  if (typeof value !== "string" || !ORDER_REFERENCE.test(value)) invalid();
  return value;
}

export function paymentAttemptCurrency(value: unknown): string {
  if (typeof value !== "string" || !CURRENCY.test(value)) invalid();
  return value;
}

export function paymentAttemptInteger(value: unknown, minimum = 1): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > MAXIMUM_SAFE_INTEGER
  ) invalid();
  return value as number;
}

export function paymentAttemptDate(value: unknown): Date {
  return contained(() => {
    if (!(value instanceof Date) || nodeTypes.isProxy(value)) invalid();
    const milliseconds = Date.prototype.getTime.call(value);
    if (!Number.isFinite(milliseconds)) invalid();
    return new Date(milliseconds);
  });
}

export function paymentAttemptSafeCode(value: unknown): string {
  if (typeof value !== "string" || !SAFE_CODE.test(value)) invalid();
  return value;
}

export function paymentAttemptWorker(value: unknown): string {
  if (typeof value !== "string" || !WORKER.test(value)) invalid();
  return value;
}

export function paymentAttemptProviderReference(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 256
    || value !== value.trim()
    || CONTROL.test(value)
    || SURROGATE.test(value)
  ) invalid();
  return value;
}

export function paymentAttemptEnvironment(value: unknown): PaymentAttemptEnvironment {
  if (value !== "test" && value !== "live") invalid();
  return value;
}

export function paymentAttemptStatus(value: unknown): PaymentAttemptStatus {
  const statuses: readonly PaymentAttemptStatus[] = [
    "created",
    "awaiting_customer",
    "submitted",
    "provider_outcome_unknown",
    "authorized",
    "captured",
    "failed",
    "cancelled",
    "partially_refunded",
    "refunded",
    "expired",
    "reconciliation_required",
  ];
  if (!statuses.includes(value as PaymentAttemptStatus)) invalid();
  return value as PaymentAttemptStatus;
}

export function paymentAttemptTimestamp(value: unknown): string {
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  ) invalid();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) invalid();
  return value;
}

export function paymentAttemptStoreAuthority(value: unknown): StoreAuthority {
  const parsed = exactPaymentAttemptInput(value, ["storeId", "now"]);
  return Object.freeze({
    storeId: paymentAttemptUuid(parsed.storeId),
    now: paymentAttemptDate(parsed.now),
  });
}

export function paymentAttemptLeaseWindow(
  nowValue: unknown,
  leaseExpiresAtValue: unknown,
): Readonly<{ now: Date; leaseExpiresAt: Date }> {
  const now = paymentAttemptDate(nowValue);
  const leaseExpiresAt = paymentAttemptDate(leaseExpiresAtValue);
  if (
    leaseExpiresAt.getTime() <= now.getTime()
    || leaseExpiresAt.getTime() > now.getTime() + 15 * 60_000
  ) invalid();
  return Object.freeze({ now, leaseExpiresAt });
}

function assertSafeJsonTree(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== "object") return;
  if (depth > 6 || nodeTypes.isProxy(value) || seen.has(value)) invalid();
  seen.add(value);
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 100) invalid();
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
      assertSafeJsonTree(descriptor.value, depth + 1, seen);
    }
    return;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) invalid();
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length > 64 || keys.some((key) => typeof key !== "string")) invalid();
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) invalid();
    assertSafeJsonTree(descriptor.value, depth + 1, seen);
  }
}

export function paymentAttemptPublicConfig(value: unknown) {
  return contained(() => {
    assertSafeJsonTree(value);
    return providerPublicConfig(value);
  });
}

export function paymentAttemptSealedCredentials(
  value: unknown,
): SealedMerchantProviderCredential {
  return contained(() => {
    if (typeof value === "object" && value !== null && nodeTypes.isProxy(value)) invalid();
    return providerSealedCredential(value);
  });
}
