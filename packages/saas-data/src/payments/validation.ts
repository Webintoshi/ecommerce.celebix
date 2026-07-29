import type { SealedEnvelope } from "../quick-orders/token-crypto.ts";
import { trustedCheckoutPaymentError } from "./errors.ts";

export const CHECKOUT_PAYMENT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MERCHANT_OID = /^[a-f0-9]{32}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;
const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function invalid(): never {
  throw trustedCheckoutPaymentError("invalid_input");
}
export function exact(
  value: unknown,
  required: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(descriptors).some(
      (key) => typeof key !== "string" || !required.includes(key),
    ) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  )
    invalid();
  const result: Record<string, unknown> = Object.create(null);
  for (const key of required) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      invalid();
    result[key] = descriptor.value;
  }
  return Object.freeze(result);
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !CHECKOUT_PAYMENT_UUID.test(value))
    invalid();
  return value;
}
export function digest(value: unknown): string {
  if (typeof value !== "string" || !DIGEST.test(value)) invalid();
  return value;
}
export function merchantOid(value: unknown): string {
  if (typeof value !== "string" || !MERCHANT_OID.test(value)) invalid();
  return value;
}
export function token(value: unknown): string {
  if (typeof value !== "string" || !TOKEN.test(value)) invalid();
  return value;
}
export function hostname(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 253 ||
    value !== value.trim() ||
    value !== value.toLowerCase() ||
    !HOSTNAME.test(value)
  )
    invalid();
  return value;
}
export function now(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}
export function integer(
  value: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    invalid();
  return value as number;
}
function base64url(
  value: unknown,
  minimum: number,
  maximum: number,
  exactLength?: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    !BASE64URL.test(value) ||
    (exactLength !== undefined && value.length !== exactLength)
  )
    invalid();
  try {
    if (Buffer.from(value, "base64url").toString("base64url") !== value)
      invalid();
  } catch {
    invalid();
  }
  return value;
}
export function uuidArray(
  value: unknown,
  minimum: number,
  maximum: number,
): readonly string[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    invalid();
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const length = descriptors.length;
  if (
    !length ||
    !("value" in length) ||
    length.enumerable ||
    !Number.isSafeInteger(length.value) ||
    length.value < minimum ||
    length.value > maximum ||
    Reflect.ownKeys(descriptors).length !== length.value + 1
  )
    invalid();
  const result: string[] = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable)
      invalid();
    result.push(uuid(descriptor.value));
  }
  return Object.freeze(result);
}
export function envelope(value: unknown): SealedEnvelope {
  const v = exact(value, [
    "algorithm",
    "ciphertext",
    "iv",
    "keyId",
    "tag",
    "version",
  ]);
  if (
    v.algorithm !== "A256GCM" ||
    v.version !== 1 ||
    typeof v.keyId !== "string" ||
    v.keyId.length < 1 ||
    v.keyId.length > 128 ||
    v.keyId !== v.keyId.trim() ||
    /[\0-\x1f\x7f]/.test(v.keyId)
  )
    invalid();
  return Object.freeze({
    algorithm: "A256GCM",
    ciphertext: base64url(v.ciphertext, 1, 8192),
    iv: base64url(v.iv, 16, 16, 16),
    keyId: v.keyId,
    tag: base64url(v.tag, 22, 22, 22),
    version: 1,
  });
}
