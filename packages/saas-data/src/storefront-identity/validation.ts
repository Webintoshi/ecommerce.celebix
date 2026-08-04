import type { StorefrontAccountAddress } from "@celebix/saas-contracts";

import { commerceDate, commerceHostname, commerceUuid, exactCommerceInput } from "../storefront-commerce/validation.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const KEY_ID = /^[a-z][a-z0-9_-]{2,31}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE = /^\+[1-9][0-9]{7,14}$/u;
const CORRELATION = /^[A-Za-z0-9_-]{8,80}$/u;
const ORDER_REFERENCE = /^[A-Z0-9][A-Z0-9-]{0,63}$/u;
const DEVICE = /^device_[a-f0-9]{32}$/u;

function invalid(): never { throw new TypeError("invalid_input"); }
export function identityText(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value)) invalid();
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < minimum || bytes > maximum || (pattern && !pattern.test(value))) invalid();
  return value;
}
export function identityDigest(value: unknown): string { return identityText(value, 64, 64, DIGEST); }
export function identityKeyId(value: unknown): string { return identityText(value, 3, 32, KEY_ID); }
export function identityEmail(value: unknown): string {
  const email = identityText(value, 3, 320, EMAIL);
  if (email !== email.toLowerCase()) invalid();
  return email;
}
export function identityOptionalPhone(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return identityText(value, 9, 16, PHONE);
}
export function identityCorrelation(value: unknown): string { return identityText(value, 8, 80, CORRELATION); }
export function identityFingerprint(value: unknown): string { return identityDigest(value); }
export function identityOrderReference(value: unknown): string { return identityText(value, 1, 64, ORDER_REFERENCE); }
export function identityDeviceId(value: unknown): string { return identityText(value, 39, 39, DEVICE); }
export function identityVersion(value: unknown, allowZero = false): number {
  if (!Number.isSafeInteger(value) || (value as number) < (allowZero ? 0 : 1)) invalid();
  return value as number;
}
export function identityBoolean(value: unknown): boolean { if (typeof value !== "boolean") invalid(); return value; }
export function identityBrand(value: unknown): Readonly<Record<string, unknown>> {
  const parsed = exactCommerceInput(value, ["name"], ["logoUrl", "primaryColor"]);
  const name = identityText(parsed.name, 1, 120);
  const logoUrl = Object.hasOwn(parsed, "logoUrl") ? parsed.logoUrl : undefined;
  const primaryColor = Object.hasOwn(parsed, "primaryColor") ? parsed.primaryColor : undefined;
  if (logoUrl !== undefined && logoUrl !== null && (typeof logoUrl !== "string" || logoUrl.length > 2_048)) invalid();
  if (primaryColor !== undefined && primaryColor !== null && (typeof primaryColor !== "string" || !/^#[A-Fa-f0-9]{6}$/u.test(primaryColor))) invalid();
  return Object.freeze({ name, ...(logoUrl !== undefined ? { logoUrl } : {}), ...(primaryColor !== undefined ? { primaryColor } : {}) });
}
export function identityAddress(value: unknown): StorefrontAccountAddress {
  const parsed = exactCommerceInput(value, ["id", "label", "recipientName", "line1", "city", "country", "isDefault", "version"], ["line2", "district", "postalCode"]);
  if (parsed.country !== "TR") invalid();
  const optional = (key: string, maximum: number) => Object.hasOwn(parsed, key) ? identityText(parsed[key], 1, maximum) : undefined;
  return Object.freeze({
    id: commerceUuid(parsed.id), label: identityText(parsed.label, 1, 50), recipientName: identityText(parsed.recipientName, 1, 200),
    line1: identityText(parsed.line1, 1, 300), ...(optional("line2", 300) ? { line2: optional("line2", 300) } : {}),
    city: identityText(parsed.city, 1, 100), ...(optional("district", 100) ? { district: optional("district", 100) } : {}),
    ...(optional("postalCode", 20) ? { postalCode: optional("postalCode", 20) } : {}), country: "TR", isDefault: identityBoolean(parsed.isDefault), version: identityVersion(parsed.version),
  });
}

export { commerceDate, commerceHostname, commerceUuid, exactCommerceInput };
