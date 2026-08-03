import type { PublicCheckoutReceipt } from "@celebix/saas-contracts";

import type {
  StorefrontCredentialCandidate,
  StorefrontDelivery,
  StorefrontGeneratedCredential,
} from "./types.ts";

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/u;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const KEY_ID = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const PHONE = /^\+90[1-9][0-9]{9}$/u;

export function exactCommerceInput(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const allowed = new Set([...required, ...optional]);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function invalid(): never { throw new TypeError("invalid_input"); }
function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value !== value.trim() || CONTROL.test(value)) invalid();
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes < minimum || bytes > maximum || (pattern && !pattern.test(value))) invalid();
  return value;
}
export function commerceUuid(value: unknown): string { return text(value, 36, 36, UUID); }
export function commerceHostname(value: unknown): string { return text(value, 3, 253, HOSTNAME); }
export function commerceDate(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return new Date(value.getTime());
}
export function commerceVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
  return value as number;
}
export function commerceQuantity(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 99) invalid();
  return value as number;
}
export function commerceLimit(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 50) invalid();
  return value as number;
}
export function commerceCandidates(value: unknown, allowEmpty = false): readonly StorefrontCredentialCandidate[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > 16 || (!allowEmpty && value.length < 1)) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) invalid();
  const seen = new Set<string>();
  const output: StorefrontCredentialCandidate[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    const candidate = exactCommerceInput(descriptor.value, ["keyId", "digest"]);
    const keyId = text(candidate.keyId, 1, 32, KEY_ID);
    const digest = text(candidate.digest, 64, 64, DIGEST);
    const identity = `${keyId}:${digest}`;
    if (seen.has(identity)) invalid();
    seen.add(identity);
    output.push(Object.freeze({ keyId, digest }));
  }
  return Object.freeze(output);
}
export function commerceGeneratedCredential(value: unknown, now: Date, maximumDays: number): StorefrontGeneratedCredential {
  const parsed = exactCommerceInput(value, ["id", "keyId", "digest", "expiresAt"]);
  const expiresAt = commerceDate(parsed.expiresAt);
  if (expiresAt <= now || expiresAt.getTime() > now.getTime() + maximumDays * 86_400_000) invalid();
  return Object.freeze({
    id: commerceUuid(parsed.id),
    keyId: text(parsed.keyId, 1, 32, KEY_ID),
    digest: text(parsed.digest, 64, 64, DIGEST),
    expiresAt,
  });
}
function optionalText(record: Readonly<Record<string, unknown>>, key: string, maximum: number): string | undefined {
  return Object.hasOwn(record, key) ? text(record[key], 1, maximum) : undefined;
}
export function commerceDelivery(value: unknown): StorefrontDelivery {
  const parsed = exactCommerceInput(value, ["contact", "shippingAddress"], ["note"]);
  const contact = exactCommerceInput(parsed.contact, ["firstName", "lastName", "email", "phone"]);
  const address = exactCommerceInput(parsed.shippingAddress, ["line1", "city", "country"], ["line2", "district", "postalCode"]);
  if (address.country !== "TR") invalid();
  const firstName = text(contact.firstName, 1, 100);
  const lastName = text(contact.lastName, 1, 100);
  const email = text(contact.email, 3, 254, EMAIL).toLowerCase();
  const phone = text(contact.phone, 13, 13, PHONE);
  const line2 = optionalText(address, "line2", 300);
  const district = optionalText(address, "district", 100);
  const postalCode = optionalText(address, "postalCode", 20);
  const note = optionalText(parsed, "note", 500);
  return Object.freeze({
    contact: Object.freeze({ firstName, lastName, email, phone }),
    shippingAddress: Object.freeze({
      line1: text(address.line1, 1, 300),
      ...(line2 ? { line2 } : {}),
      city: text(address.city, 1, 100),
      ...(district ? { district } : {}),
      ...(postalCode ? { postalCode } : {}),
      country: "TR" as const,
    }),
    ...(note ? { note } : {}),
  });
}
export function parseReceiptEnvelope(value: unknown, parse: (input: unknown) => PublicCheckoutReceipt) {
  const selected = exactCommerceInput(value, ["receipt", "credentialPersistence"]);
  const persistence = exactCommerceInput(selected.credentialPersistence, ["receipt", "customer", "receiptKeyId", "customerKeyId"]);
  if (persistence.receipt !== true || typeof persistence.customer !== "boolean") invalid();
  return Object.freeze({
    receipt: parse(selected.receipt),
    credentialPersistence: Object.freeze({
      receipt: true as const,
      customer: persistence.customer,
      receiptKeyId: text(persistence.receiptKeyId, 1, 32, KEY_ID),
      customerKeyId: text(persistence.customerKeyId, 1, 32, KEY_ID),
    }),
  });
}
export function parseReceiptList(value: unknown, parse: (input: unknown) => PublicCheckoutReceipt): readonly PublicCheckoutReceipt[] {
  const selected = exactCommerceInput(value, ["items"]);
  if (!Array.isArray(selected.items) || Object.getPrototypeOf(selected.items) !== Array.prototype || selected.items.length > 50) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(selected.items) as unknown as Record<PropertyKey, PropertyDescriptor>;
  if (Reflect.ownKeys(descriptors).length !== selected.items.length + 1) invalid();
  return Object.freeze(selected.items.map((item) => parse(item)));
}
