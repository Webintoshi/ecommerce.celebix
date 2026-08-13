import {
  ABANDONED_CART_STATUSES,
  type AbandonedCartDetail,
  type AbandonedCartItem,
  type AbandonedCartListItem,
  type AbandonedCartMutationResult,
  type AbandonedCartStatus,
  type AbandonedCartSummary,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const CURRENCY = /^[A-Z]{3}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new TypeError("abandoned_cart_contract_invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !allowed.has(key))) invalid();
  return parsed;
}

function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() ||
    CONTROL.test(value) || (pattern !== undefined && !pattern.test(value))
  ) invalid();
  return value;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const parsed = new Date(value);
  const canonical = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== canonical) invalid();
  return value;
}

function comparable(value: string): string {
  return value.replace(/(\.\d{3})Z$/, "$1000Z");
}

function safeInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function status(value: unknown): AbandonedCartStatus {
  if (typeof value !== "string" || !ABANDONED_CART_STATUSES.includes(value as AbandonedCartStatus)) invalid();
  return value as AbandonedCartStatus;
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function optionalString(parsed: Record<string, unknown>, key: string, minimum: number, maximum: number): string | undefined {
  return Object.hasOwn(parsed, key) ? string(parsed[key], minimum, maximum) : undefined;
}

function optionalTimestamp(parsed: Record<string, unknown>, key: string): string | undefined {
  return Object.hasOwn(parsed, key) ? timestamp(parsed[key]) : undefined;
}

function canonicalHttpsUrl(value: unknown): string {
  const raw = string(value, 1, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    invalid();
  }
  if (
    parsed.protocol !== "https:" || parsed.username !== "" || parsed.password !== "" || parsed.hash !== "" ||
    parsed.port !== "" || parsed.toString() !== raw
  ) invalid();
  return raw;
}

function assertLifecycle(
  cartStatus: AbandonedCartStatus,
  abandonedAt: string | undefined,
  recoveredAt: string | undefined,
  archivedAt: string | undefined,
): void {
  if (cartStatus === "active" && (abandonedAt !== undefined || recoveredAt !== undefined || archivedAt !== undefined)) invalid();
  if (cartStatus === "abandoned" && (abandonedAt === undefined || recoveredAt !== undefined || archivedAt !== undefined)) invalid();
  if (cartStatus === "recovered" && (abandonedAt === undefined || recoveredAt === undefined || archivedAt !== undefined)) invalid();
  if (cartStatus === "archived" && archivedAt === undefined) invalid();
  if (recoveredAt !== undefined && abandonedAt === undefined) invalid();
  if (recoveredAt !== undefined && abandonedAt !== undefined && comparable(recoveredAt) < comparable(abandonedAt)) invalid();
  const latestBeforeArchive = recoveredAt ?? abandonedAt;
  if (archivedAt !== undefined && latestBeforeArchive !== undefined && comparable(archivedAt) < comparable(latestBeforeArchive)) invalid();
}

export function parseAbandonedCartListItem(value: unknown): Readonly<AbandonedCartListItem> {
  const parsed = exact(value, [
    "id", "status", "currency", "subtotalCents", "discountCents", "totalCents", "itemCount",
    "checkoutStartedAt", "lastActivityAt", "version", "createdAt", "updatedAt",
  ], ["customerId", "customerName", "customerEmail", "customerPhone", "firstProductName", "abandonedAt", "recoveredAt", "archivedAt"]);
  const cartStatus = status(parsed.status);
  const subtotalCents = safeInteger(parsed.subtotalCents, 0);
  const discountCents = safeInteger(parsed.discountCents, 0);
  const totalCents = safeInteger(parsed.totalCents, 0);
  if (discountCents > subtotalCents || totalCents !== subtotalCents - discountCents) invalid();
  const checkoutStartedAt = timestamp(parsed.checkoutStartedAt);
  const lastActivityAt = timestamp(parsed.lastActivityAt);
  const createdAt = timestamp(parsed.createdAt);
  const updatedAt = timestamp(parsed.updatedAt);
  const abandonedAt = optionalTimestamp(parsed, "abandonedAt");
  const recoveredAt = optionalTimestamp(parsed, "recoveredAt");
  const archivedAt = optionalTimestamp(parsed, "archivedAt");
  const itemCount = safeInteger(parsed.itemCount, 0, 100);
  const firstProductName = optionalString(parsed, "firstProductName", 1, 200);
  if ((itemCount === 0) !== (firstProductName === undefined)) invalid();
  if (Object.hasOwn(parsed, "customerId") && !Object.hasOwn(parsed, "customerName") && !Object.hasOwn(parsed, "customerEmail") && !Object.hasOwn(parsed, "customerPhone")) invalid();
  if (
    comparable(lastActivityAt) < comparable(checkoutStartedAt) || comparable(createdAt) < comparable(checkoutStartedAt) ||
    comparable(updatedAt) < comparable(createdAt)
  ) invalid();
  assertLifecycle(cartStatus, abandonedAt, recoveredAt, archivedAt);
  return freeze({
    id: uuid(parsed.id),
    status: cartStatus,
    ...(Object.hasOwn(parsed, "customerId") ? { customerId: uuid(parsed.customerId) } : {}),
    ...(Object.hasOwn(parsed, "customerName") ? { customerName: optionalString(parsed, "customerName", 1, 200)! } : {}),
    ...(Object.hasOwn(parsed, "customerEmail") ? { customerEmail: optionalString(parsed, "customerEmail", 3, 320)! } : {}),
    ...(Object.hasOwn(parsed, "customerPhone") ? { customerPhone: optionalString(parsed, "customerPhone", 3, 32)! } : {}),
    currency: string(parsed.currency, 3, 3, CURRENCY),
    subtotalCents,
    discountCents,
    totalCents,
    itemCount,
    ...(firstProductName !== undefined ? { firstProductName } : {}),
    checkoutStartedAt,
    lastActivityAt,
    ...(abandonedAt !== undefined ? { abandonedAt } : {}),
    ...(recoveredAt !== undefined ? { recoveredAt } : {}),
    ...(archivedAt !== undefined ? { archivedAt } : {}),
    version: safeInteger(parsed.version, 1),
    createdAt,
    updatedAt,
  } satisfies AbandonedCartListItem);
}

function parseItem(value: unknown): Readonly<AbandonedCartItem> {
  const parsed = exact(value, [
    "id", "position", "productName", "unitPriceCents", "quantity", "discountCents", "lineTotalCents",
  ], ["variantName", "sku", "imageUrl"]);
  const unitPriceCents = safeInteger(parsed.unitPriceCents, 0);
  const quantity = safeInteger(parsed.quantity, 1, 9_999);
  const discountCents = safeInteger(parsed.discountCents, 0);
  const lineTotalCents = safeInteger(parsed.lineTotalCents, 0);
  if (discountCents > unitPriceCents * quantity || lineTotalCents !== unitPriceCents * quantity - discountCents) invalid();
  return freeze({
    id: uuid(parsed.id),
    position: safeInteger(parsed.position, 0, 99),
    productName: string(parsed.productName, 1, 200),
    ...(Object.hasOwn(parsed, "variantName") ? { variantName: optionalString(parsed, "variantName", 1, 200)! } : {}),
    ...(Object.hasOwn(parsed, "sku") ? { sku: optionalString(parsed, "sku", 1, 128)! } : {}),
    ...(Object.hasOwn(parsed, "imageUrl") ? { imageUrl: canonicalHttpsUrl(parsed.imageUrl) } : {}),
    unitPriceCents,
    quantity,
    discountCents,
    lineTotalCents,
  } satisfies AbandonedCartItem);
}

export function parseAbandonedCartDetail(value: unknown): Readonly<AbandonedCartDetail> {
  const parsed = record(value);
  const { items: rawItems, ...listProjection } = parsed;
  if (!Object.hasOwn(parsed, "items") || Object.keys(parsed).length !== Object.keys(listProjection).length + 1) invalid();
  const list = parseAbandonedCartListItem(listProjection);
  if (!Array.isArray(rawItems) || rawItems.length > 100) invalid();
  const items = rawItems.map((entry, index) => {
    const item = parseItem(entry);
    if (item.position !== index) invalid();
    return item;
  });
  if (list.itemCount !== items.length) invalid();
  return freeze({ ...list, items } satisfies AbandonedCartDetail);
}

export function parseAbandonedCartSummary(value: unknown): Readonly<AbandonedCartSummary> {
  const parsed = exact(value, ["abandoned", "recovered", "lostValueCents", "recoveredValueCents", "currency", "asOf"]);
  return freeze({
    abandoned: safeInteger(parsed.abandoned, 0),
    recovered: safeInteger(parsed.recovered, 0),
    lostValueCents: safeInteger(parsed.lostValueCents, 0),
    recoveredValueCents: safeInteger(parsed.recoveredValueCents, 0),
    currency: string(parsed.currency, 3, 3, CURRENCY),
    asOf: timestamp(parsed.asOf),
  } satisfies AbandonedCartSummary);
}

export function parseAbandonedCartMutationResult(value: unknown): Readonly<AbandonedCartMutationResult> {
  const parsed = exact(value, ["id", "status", "version", "updatedAt", "replayed"]);
  if (parsed.status !== "recovered" && parsed.status !== "archived") invalid();
  if (typeof parsed.replayed !== "boolean") invalid();
  return freeze({
    id: uuid(parsed.id),
    status: parsed.status,
    version: safeInteger(parsed.version, 1),
    updatedAt: timestamp(parsed.updatedAt),
    replayed: parsed.replayed,
  } satisfies AbandonedCartMutationResult);
}
