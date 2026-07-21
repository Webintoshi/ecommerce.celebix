import type { SealedEnvelope } from "../quick-orders/token-crypto.ts";
import { trustedCheckoutPaymentError } from "./errors.ts";

export const CHECKOUT_PAYMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[a-f0-9]{64}$/; const MERCHANT_OID = /^[a-f0-9]{32}$/; const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function invalid(): never { throw trustedCheckoutPaymentError("invalid_input"); }
export function exact(value: unknown, required: readonly string[]): Readonly<Record<string, unknown>> { if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) invalid(); const descriptors = Object.getOwnPropertyDescriptors(value); if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" || !required.includes(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid(); const result: Record<string, unknown> = Object.create(null); for (const key of required) { const descriptor = descriptors[key]; if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid(); result[key] = descriptor.value; } return Object.freeze(result); }
export function uuid(value: unknown): string { if (typeof value !== "string" || !CHECKOUT_PAYMENT_UUID.test(value)) invalid(); return value; }
export function digest(value: unknown): string { if (typeof value !== "string" || !DIGEST.test(value)) invalid(); return value; }
export function merchantOid(value: unknown): string { if (typeof value !== "string" || !MERCHANT_OID.test(value)) invalid(); return value; }
export function token(value: unknown): string { if (typeof value !== "string" || !TOKEN.test(value)) invalid(); return value; }
export function hostname(value: unknown): string { if (typeof value !== "string" || value.length > 253 || value !== value.trim() || value !== value.toLowerCase() || !HOSTNAME.test(value)) invalid(); return value; }
export function now(value: unknown): Date { if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid(); return new Date(value.getTime()); }
export function integer(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) invalid(); return value as number; }
export function envelope(value: unknown): SealedEnvelope { const v = exact(value, ["algorithm", "ciphertext", "iv", "keyId", "tag", "version"]); if (v.algorithm !== "A256GCM" || v.version !== 1 || typeof v.ciphertext !== "string" || typeof v.iv !== "string" || typeof v.keyId !== "string" || typeof v.tag !== "string") invalid(); return Object.freeze({ algorithm: "A256GCM", ciphertext: v.ciphertext, iv: v.iv, keyId: v.keyId, tag: v.tag, version: 1 }); }
