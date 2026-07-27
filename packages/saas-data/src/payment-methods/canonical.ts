import { createHash } from "node:crypto";

import {
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_STATES,
  parseMerchantAdminConfig,
  type MerchantAdminJson,
  type PaymentMethodKind,
  type PaymentMethodState,
  type TenantContext,
} from "@celebix/saas-contracts";

import { OrderRepositoryError } from "../orders/errors.ts";
import { merchantAuthority, type ValidatedOrderAuthority } from "../orders/validation.ts";
import { PaymentMethodRepositoryError, type PaymentMethodErrorCode } from "./errors.ts";
import type { PaymentMethodOrderItem } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PROVIDER_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const EDGE = /^[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]|[\u0020\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]$/;
const ENCODER = new TextEncoder();

function fail(code: PaymentMethodErrorCode = "invalid_input"): never {
  throw new PaymentMethodRepositoryError(code);
}

export function exactPaymentMethodInput(value: unknown, required: readonly string[]): Record<string, unknown> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) fail();
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) fail();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    const keys = Reflect.ownKeys(descriptors);
    if (
      keys.length !== required.length
      || keys.some((key) => typeof key !== "string" || !required.includes(key))
      || required.some((key) => !Object.hasOwn(descriptors, key))
    ) fail();
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") fail();
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail();
      result[key] = descriptor.value;
    }
    return result;
  } catch (error) {
    if (error instanceof PaymentMethodRepositoryError) throw error;
    fail();
  }
}

export function paymentMethodUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) fail();
  return value;
}

export function paymentMethodFingerprintValue(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) fail();
  return value;
}

export function paymentMethodVersion(value: unknown, minimum: 0 | 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail();
  return value as number;
}

export function paymentMethodKind(value: unknown): PaymentMethodKind {
  if (!PAYMENT_METHOD_KINDS.includes(value as never)) fail();
  return value as PaymentMethodKind;
}

export function paymentMethodState(value: unknown): PaymentMethodState {
  if (!PAYMENT_METHOD_STATES.includes(value as never)) fail();
  return value as PaymentMethodState;
}

export function paymentMethodProviderCode(value: unknown): string {
  if (typeof value !== "string" || !PROVIDER_CODE.test(value) || value === "dummy_payment") fail();
  return value;
}

function boundedText(value: unknown, minimum: number, maximum: number): string {
  if (
    typeof value !== "string"
    || ENCODER.encode(value).byteLength < minimum
    || ENCODER.encode(value).byteLength > maximum
    || CONTROL.test(value)
    || EDGE.test(value)
  ) fail();
  return value;
}

export function paymentMethodLabel(value: unknown): string {
  return boundedText(value, 1, 120);
}

export function paymentMethodEmergencyReason(value: unknown, state: PaymentMethodState): string | null {
  if (state === "emergency_disabled") return boundedText(value, 3, 240);
  if (value !== null) fail();
  return null;
}

function canonicalJson(value: MerchantAdminJson): MerchantAdminJson {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return Object.freeze(value.map(canonicalJson));
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return Object.freeze(Object.fromEntries(entries.map(([key, nested]) => [key, canonicalJson(nested)])));
}

export function paymentMethodConfig(value: unknown): Readonly<Record<string, MerchantAdminJson>> {
  try {
    const parsed = canonicalJson(parseMerchantAdminConfig(value));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) fail();
    if (ENCODER.encode(stable(parsed)).byteLength > 8_192) fail();
    return parsed as Readonly<Record<string, MerchantAdminJson>>;
  } catch (error) {
    if (error instanceof PaymentMethodRepositoryError) throw error;
    fail();
  }
}

export function paymentMethodOrderItems(value: unknown): readonly Readonly<PaymentMethodOrderItem>[] {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < 1 || value.length > 100) fail();
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
    if (Reflect.ownKeys(descriptors).length !== value.length + 1) fail();
    const items: PaymentMethodOrderItem[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) fail();
      const parsed = exactPaymentMethodInput(descriptor.value, ["id", "expectedVersion", "position"]);
      const position = parsed.position;
      if (!Number.isSafeInteger(position) || (position as number) < 0 || (position as number) > 9_999) fail();
      items.push(Object.freeze({
        id: paymentMethodUuid(parsed.id),
        expectedVersion: paymentMethodVersion(parsed.expectedVersion, 1),
        position: position as number,
      }));
    }
    if (new Set(items.map(({ id }) => id)).size !== items.length) fail();
    if (new Set(items.map(({ position }) => position)).size !== items.length) fail();
    if ([...items].map(({ position }) => position).sort((a, b) => a - b).some((position, index) => position !== index)) fail();
    return Object.freeze([...items].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id)));
  } catch (error) {
    if (error instanceof PaymentMethodRepositoryError) throw error;
    fail();
  }
}

export function paymentMethodAuthority(context: TenantContext, now: Date): ValidatedOrderAuthority {
  try {
    return merchantAuthority(context, now, "catalog");
  } catch (error) {
    if (error instanceof OrderRepositoryError) {
      const safe: readonly PaymentMethodErrorCode[] = [
        "invalid_input", "unauthenticated", "membership_denied", "store_inactive",
        "feature_not_enabled", "durable_authority_invalid",
      ];
      if (safe.includes(error.code as PaymentMethodErrorCode)) fail(error.code as PaymentMethodErrorCode);
    }
    fail("durable_authority_invalid");
  }
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
    .join(",")}}`;
}

export function paymentMethodFingerprint(
  kind: "save" | "set_state" | "reorder",
  storeId: string,
  payload: unknown,
): string {
  return createHash("sha256").update(stable({ kind, storeId, payload }), "utf8").digest("hex");
}
