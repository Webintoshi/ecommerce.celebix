import { ORDER_PAYMENT_STATUSES, ORDER_STATUSES, type OrderPaymentStatus, type OrderStatus } from "../orders/types.ts";
import {
  STOREFRONT_ACCOUNT_MUTATION_OUTCOMES,
  STOREFRONT_ACCOUNT_SESSION_KINDS,
  STOREFRONT_ACCOUNT_STATUSES,
  type StorefrontAccountAddress,
  type StorefrontAccountDevice,
  type StorefrontAccountFavorite,
  type StorefrontAccountMutationOutcome,
  type StorefrontAccountMutationResult,
  type StorefrontAccountOrder,
  type StorefrontAccountOrderItem,
  type StorefrontAccountProfile,
  type StorefrontAccountSession,
  type StorefrontAccountSessionKind,
  type StorefrontAccountSnapshot,
  type StorefrontAccountStatus,
  type StorefrontAuthStartResult,
  type StorefrontAuthVerifyResult,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+[1-9][0-9]{7,14}$/;
const DEVICE = /^device_[0-9A-Z]{16,40}$/;
const ORDER_REFERENCE = /^[A-Z0-9][A-Z0-9-]{0,63}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new TypeError("storefront_identity_contract_invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor.get || descriptor.set) invalid();
  }
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || Object.keys(parsed).some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function list(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  const keys = Object.keys(value);
  if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) invalid();
  return value;
}

function text(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value) || (pattern && !pattern.test(value))) invalid();
  return value;
}

function integer(value: unknown, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) invalid();
  return value as number;
}

function bool(value: unknown): boolean {
  if (typeof value !== "boolean") invalid();
  return value;
}

function timestamp(value: unknown): string {
  const parsed = text(value, 24, 24, ISO);
  if (new Date(parsed).toISOString() !== parsed) invalid();
  return parsed;
}

function uuid(value: unknown): string {
  return text(value, 36, 36, UUID);
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) invalid();
  return value as T[number];
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function optionalText(parsed: Record<string, unknown>, key: string, minimum: number, maximum: number): string | undefined {
  return Object.hasOwn(parsed, key) ? text(parsed[key], minimum, maximum) : undefined;
}

function profile(value: unknown): Readonly<StorefrontAccountProfile> {
  const parsed = exact(value, ["email", "firstName", "lastName"], ["phone"]);
  const email = text(parsed.email, 3, 320, EMAIL);
  if (email !== email.toLowerCase()) invalid();
  return freeze({
    email,
    firstName: text(parsed.firstName, 1, 100),
    lastName: text(parsed.lastName, 1, 100),
    ...(Object.hasOwn(parsed, "phone") ? { phone: text(parsed.phone, 9, 16, PHONE) } : {}),
  });
}

function address(value: unknown): Readonly<StorefrontAccountAddress> {
  const parsed = exact(value, ["id", "label", "recipientName", "line1", "city", "country", "isDefault", "version"], ["line2", "district", "postalCode"]);
  if (parsed.country !== "TR") invalid();
  return freeze({
    id: uuid(parsed.id),
    label: text(parsed.label, 1, 50),
    recipientName: text(parsed.recipientName, 1, 200),
    line1: text(parsed.line1, 1, 300),
    ...(Object.hasOwn(parsed, "line2") ? { line2: optionalText(parsed, "line2", 1, 300)! } : {}),
    city: text(parsed.city, 1, 100),
    ...(Object.hasOwn(parsed, "district") ? { district: optionalText(parsed, "district", 1, 100)! } : {}),
    ...(Object.hasOwn(parsed, "postalCode") ? { postalCode: optionalText(parsed, "postalCode", 1, 20)! } : {}),
    country: "TR",
    isDefault: bool(parsed.isDefault),
    version: integer(parsed.version, 1),
  });
}

function favorite(value: unknown): Readonly<StorefrontAccountFavorite> {
  const parsed = exact(value, ["productId", "createdAt"]);
  return freeze({ productId: uuid(parsed.productId), createdAt: timestamp(parsed.createdAt) });
}

function device(value: unknown): Readonly<StorefrontAccountDevice> {
  const parsed = exact(value, ["id", "label", "current", "lastSeenAt", "createdAt"]);
  const createdAt = timestamp(parsed.createdAt);
  const lastSeenAt = timestamp(parsed.lastSeenAt);
  if (lastSeenAt < createdAt) invalid();
  return freeze({ id: text(parsed.id, 23, 47, DEVICE), label: text(parsed.label, 1, 100), current: bool(parsed.current), lastSeenAt, createdAt });
}

function orderItem(value: unknown): Readonly<StorefrontAccountOrderItem> {
  const parsed = exact(value, ["name", "quantity", "unitPriceCents", "lineTotalCents"]);
  const quantity = integer(parsed.quantity, 1);
  const unitPriceCents = integer(parsed.unitPriceCents);
  const lineTotalCents = integer(parsed.lineTotalCents);
  if (unitPriceCents * quantity !== lineTotalCents) invalid();
  return freeze({ name: text(parsed.name, 1, 300), quantity, unitPriceCents, lineTotalCents });
}

export function parseStorefrontAuthStartResult(value: unknown): Readonly<StorefrontAuthStartResult> {
  const parsed = exact(value, ["outcome", "retryAfterSeconds"]);
  if (parsed.outcome !== "accepted") invalid();
  return freeze({ outcome: "accepted", retryAfterSeconds: integer(parsed.retryAfterSeconds) });
}

export function parseStorefrontAuthVerifyResult(value: unknown): Readonly<StorefrontAuthVerifyResult> {
  const parsed = exact(value, ["outcome", "profileRequired"]);
  if (parsed.outcome === "authenticated" && parsed.profileRequired === false) return freeze({ outcome: "authenticated", profileRequired: false });
  if (parsed.outcome === "profile_required" && parsed.profileRequired === true) return freeze({ outcome: "profile_required", profileRequired: true });
  return invalid();
}

export function parseStorefrontAccountSession(value: unknown): Readonly<StorefrontAccountSession> {
  const parsed = exact(value, ["kind", "expiresAt"]);
  return freeze({ kind: oneOf(parsed.kind, STOREFRONT_ACCOUNT_SESSION_KINDS) as StorefrontAccountSessionKind, expiresAt: timestamp(parsed.expiresAt) });
}

export function parseStorefrontAccountSnapshot(value: unknown): Readonly<StorefrontAccountSnapshot> {
  const parsed = exact(value, ["status", "version", "profile", "addresses", "favorites", "devices"]);
  const addresses = list(parsed.addresses, 20).map(address);
  const favorites = list(parsed.favorites, 500).map(favorite);
  const devices = list(parsed.devices, 50).map(device);
  if (addresses.filter((entry) => entry.isDefault).length > 1 || devices.filter((entry) => entry.current).length > 1) invalid();
  if (new Set(addresses.map((entry) => entry.id)).size !== addresses.length || new Set(favorites.map((entry) => entry.productId)).size !== favorites.length || new Set(devices.map((entry) => entry.id)).size !== devices.length) invalid();
  return freeze({
    status: oneOf(parsed.status, STOREFRONT_ACCOUNT_STATUSES) as StorefrontAccountStatus,
    version: integer(parsed.version, 1),
    profile: profile(parsed.profile),
    addresses: Object.freeze(addresses),
    favorites: Object.freeze(favorites),
    devices: Object.freeze(devices),
  });
}

export function parseStorefrontAccountOrder(value: unknown): Readonly<StorefrontAccountOrder> {
  const parsed = exact(value, ["orderReference", "status", "paymentStatus", "currency", "subtotalCents", "shippingCents", "totalCents", "createdAt", "items"]);
  if (parsed.currency !== "TRY") invalid();
  const items = list(parsed.items, 200).map(orderItem);
  const subtotalCents = integer(parsed.subtotalCents);
  const shippingCents = integer(parsed.shippingCents);
  const totalCents = integer(parsed.totalCents);
  if (items.reduce((sum, item) => sum + item.lineTotalCents, 0) !== subtotalCents || subtotalCents + shippingCents !== totalCents) invalid();
  return freeze({
    orderReference: text(parsed.orderReference, 1, 64, ORDER_REFERENCE),
    status: oneOf(parsed.status, ORDER_STATUSES) as OrderStatus,
    paymentStatus: oneOf(parsed.paymentStatus, ORDER_PAYMENT_STATUSES) as OrderPaymentStatus,
    currency: "TRY",
    subtotalCents,
    shippingCents,
    totalCents,
    createdAt: timestamp(parsed.createdAt),
    items: Object.freeze(items),
  });
}

export function parseStorefrontAccountMutationResult(value: unknown): Readonly<StorefrontAccountMutationResult> {
  const parsed = exact(value, ["outcome", "version", "replayed"]);
  return freeze({
    outcome: oneOf(parsed.outcome, STOREFRONT_ACCOUNT_MUTATION_OUTCOMES) as StorefrontAccountMutationOutcome,
    version: integer(parsed.version, 1),
    replayed: bool(parsed.replayed),
  });
}
