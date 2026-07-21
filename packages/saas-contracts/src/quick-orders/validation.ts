import {
  QUICK_ORDER_EXPIRY_HOURS,
  QUICK_ORDER_LINK_STATUSES,
  QUICK_ORDER_MAX_COMPONENT_CENTS,
  QUICK_ORDER_MAX_TOTAL_CENTS,
  QUICK_ORDER_MAX_UNIT_PRICE_CENTS,
  type QuickOrderAddress,
  type QuickOrderCreateIntent,
  type QuickOrderLinkDetail,
  type QuickOrderLinkItem,
  type QuickOrderLinkListItem,
  type QuickOrderLinkMutationResult,
  type QuickOrderLinkStatus,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const CURRENCY = /^[A-Z]{3}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CANONICAL_EMAIL = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const QUICK_ORDER_MAX_SUBTOTAL_CENTS = QUICK_ORDER_MAX_UNIT_PRICE_CENTS * 9_999 * 100;
const HOUR_MICROSECONDS = 3_600_000_000n;

type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never {
  throw new TypeError("quick_order_contract_invalid");
}

function guarded<T>(parse: () => T): T {
  try {
    return parse();
  } catch {
    return invalid();
  }
}

function record(value: unknown): object {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value;
}

function ownDescriptors(value: object): Record<string, PropertyDescriptor> {
  return Object.getOwnPropertyDescriptors(value);
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): InputRecord {
  const parsed = record(value);
  const descriptors = ownDescriptors(parsed);
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...required, ...optional]);
  if (
    keys.some((key) => typeof key !== "string" || !allowed.has(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();

  const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    output[key] = descriptor.value;
  }
  return output;
}

function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
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
  const millisecondCanonical = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== millisecondCanonical) invalid();
  return value;
}

function comparableTimestamp(value: string): string {
  return value.replace(/(\.\d{3})Z$/, "$1000Z");
}

function timestampMicroseconds(value: string): bigint {
  const fraction = value.match(/\.(\d{3})(\d{3})?Z$/);
  if (!fraction) invalid();
  return BigInt(new Date(value).getTime()) * 1_000n + BigInt(fraction[2] ?? "000");
}

function safeInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function status(value: unknown): QuickOrderLinkStatus {
  if (typeof value !== "string" || !QUICK_ORDER_LINK_STATUSES.includes(value as QuickOrderLinkStatus)) invalid();
  return value as QuickOrderLinkStatus;
}

function optionalString(value: InputRecord, key: string, minimum: number, maximum: number, pattern?: RegExp): string | undefined {
  return Object.hasOwn(value, key) ? string(value[key], minimum, maximum, pattern) : undefined;
}

function canonicalHttpsUrl(value: unknown): string {
  const raw = string(value, 1, 2_048);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return invalid();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.toString() !== raw) invalid();
  return raw;
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function parseAddress(value: unknown): Readonly<QuickOrderAddress> {
  const parsed = exact(value, ["recipientName", "phone", "line1", "city", "country"], ["line2", "district", "postalCode"]);
  return freeze({
    recipientName: string(parsed.recipientName, 1, 200),
    phone: string(parsed.phone, 3, 32),
    line1: string(parsed.line1, 1, 300),
    ...(Object.hasOwn(parsed, "line2") ? { line2: string(parsed.line2, 1, 300) } : {}),
    ...(Object.hasOwn(parsed, "district") ? { district: string(parsed.district, 1, 200) } : {}),
    city: string(parsed.city, 1, 200),
    ...(Object.hasOwn(parsed, "postalCode") ? { postalCode: string(parsed.postalCode, 1, 32) } : {}),
    country: string(parsed.country, 2, 2, /^[A-Z]{2}$/),
  } satisfies QuickOrderAddress);
}

function parseItem(value: unknown, expectedPosition: number): Readonly<QuickOrderLinkItem> {
  const parsed = exact(
    value,
    ["id", "position", "productName", "unitPriceCents", "quantity", "lineTotalCents"],
    ["variantName", "sku", "imageUrl"],
  );
  const unitPriceCents = safeInteger(parsed.unitPriceCents, 0, QUICK_ORDER_MAX_UNIT_PRICE_CENTS);
  const quantity = safeInteger(parsed.quantity, 1, 9_999);
  const lineTotalCents = safeInteger(parsed.lineTotalCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
  if (safeInteger(parsed.position, 0, 99) !== expectedPosition || lineTotalCents !== unitPriceCents * quantity) invalid();
  return freeze({
    id: uuid(parsed.id),
    position: expectedPosition,
    productName: string(parsed.productName, 1, 200),
    ...(Object.hasOwn(parsed, "variantName") ? { variantName: string(parsed.variantName, 1, 200) } : {}),
    ...(Object.hasOwn(parsed, "sku") ? { sku: string(parsed.sku, 1, 128) } : {}),
    ...(Object.hasOwn(parsed, "imageUrl") ? { imageUrl: canonicalHttpsUrl(parsed.imageUrl) } : {}),
    unitPriceCents,
    quantity,
    lineTotalCents,
  } satisfies QuickOrderLinkItem);
}

function parseItems(value: unknown): readonly QuickOrderLinkItem[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = ownDescriptors(value);
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) invalid();
  const length = safeInteger(lengthDescriptor.value, 1, 100);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== length + 1) invalid();

  const items: QuickOrderLinkItem[] = [];
  for (let position = 0; position < length; position += 1) {
    const descriptor = descriptors[String(position)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    items.push(parseItem(descriptor.value, position));
  }
  return Object.freeze(items);
}

function parseCreateItems(value: unknown): QuickOrderCreateIntent["items"] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = ownDescriptors(value);
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) invalid();
  const length = safeInteger(lengthDescriptor.value, 1, 100);
  if (Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const items: Readonly<{ variantId: string; quantity: number }>[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    const parsed = exact(descriptor.value, ["variantId", "quantity"]);
    items.push(Object.freeze({
      variantId: uuid(parsed.variantId),
      quantity: safeInteger(parsed.quantity, 1, 9_999),
    }));
  }
  return Object.freeze(items);
}

function parseList(value: InputRecord): Readonly<QuickOrderLinkListItem> {
  const createdAt = timestamp(value.createdAt);
  const expiresAt = timestamp(value.expiresAt);
  const expiryDifference = timestampMicroseconds(expiresAt) - timestampMicroseconds(createdAt);
  if (expiryDifference <= 0n || !QUICK_ORDER_EXPIRY_HOURS.some((hours) => expiryDifference === BigInt(hours) * HOUR_MICROSECONDS)) invalid();
  return freeze({
    id: uuid(value.id),
    customerName: string(value.customerName, 1, 200),
    customerEmail: string(value.customerEmail, 3, 320, EMAIL),
    firstProductName: string(value.firstProductName, 1, 200),
    itemCount: safeInteger(value.itemCount, 1, 100),
    status: status(value.status),
    currency: string(value.currency, 3, 3, CURRENCY),
    totalCents: safeInteger(value.totalCents, 0, QUICK_ORDER_MAX_TOTAL_CENTS),
    expiresAt,
    createdAt,
    version: safeInteger(value.version, 1),
  } satisfies QuickOrderLinkListItem);
}

function parseDetail(value: unknown): Readonly<QuickOrderLinkDetail> {
  const parsed = exact(value, [
    "id", "customerName", "customerEmail", "firstProductName", "itemCount", "status", "currency", "totalCents", "expiresAt",
    "createdAt", "version", "shippingAddress", "billingAddress", "providerKey", "subtotalCents", "shippingCents", "discountCents",
    "items", "updatedAt",
  ], ["customerPhone", "customerNote", "internalLabel", "openedAt", "paidAt", "cancelledAt", "orderId"]);
  const list = parseList(parsed);
  const updatedAt = timestamp(parsed.updatedAt);
  const openedAt = Object.hasOwn(parsed, "openedAt") ? timestamp(parsed.openedAt) : undefined;
  const paidAt = Object.hasOwn(parsed, "paidAt") ? timestamp(parsed.paidAt) : undefined;
  const cancelledAt = Object.hasOwn(parsed, "cancelledAt") ? timestamp(parsed.cancelledAt) : undefined;
  const orderId = Object.hasOwn(parsed, "orderId") ? uuid(parsed.orderId) : undefined;
  const subtotalCents = safeInteger(parsed.subtotalCents, 0, QUICK_ORDER_MAX_SUBTOTAL_CENTS);
  const shippingCents = safeInteger(parsed.shippingCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
  const discountCents = safeInteger(parsed.discountCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
  const items = parseItems(parsed.items);

  if (
    parsed.providerKey !== "paytr" ||
    comparableTimestamp(updatedAt) < comparableTimestamp(list.createdAt) ||
    subtotalCents !== sumItemTotals(items) ||
    discountCents > subtotalCents + shippingCents ||
    list.totalCents !== subtotalCents + shippingCents - discountCents
  ) invalid();

  const lifecycleTimes = [openedAt, paidAt, cancelledAt].filter((entry): entry is string => entry !== undefined);
  if (lifecycleTimes.some((entry) => comparableTimestamp(entry) < comparableTimestamp(list.createdAt) || comparableTimestamp(entry) > comparableTimestamp(updatedAt))) invalid();
  if (openedAt !== undefined && paidAt !== undefined && comparableTimestamp(paidAt) < comparableTimestamp(openedAt)) invalid();
  if (openedAt !== undefined && cancelledAt !== undefined && comparableTimestamp(cancelledAt) < comparableTimestamp(openedAt)) invalid();

  if (
    (list.status === "active" && (openedAt !== undefined || paidAt !== undefined || cancelledAt !== undefined || orderId !== undefined)) ||
    (list.status === "opened" && (openedAt === undefined || paidAt !== undefined || cancelledAt !== undefined || orderId !== undefined)) ||
    (list.status === "paid" && (openedAt === undefined || paidAt === undefined || cancelledAt !== undefined || orderId === undefined)) ||
    (list.status === "cancelled" && (paidAt !== undefined || cancelledAt === undefined || orderId !== undefined)) ||
    (list.status === "expired" && (paidAt !== undefined || cancelledAt !== undefined || orderId !== undefined))
  ) invalid();

  if (list.itemCount !== items.length) invalid();
  return freeze({
    ...list,
    ...(Object.hasOwn(parsed, "customerPhone") ? { customerPhone: string(parsed.customerPhone, 3, 32) } : {}),
    shippingAddress: parseAddress(parsed.shippingAddress),
    billingAddress: parseAddress(parsed.billingAddress),
    ...(Object.hasOwn(parsed, "customerNote") ? { customerNote: string(parsed.customerNote, 1, 2_000) } : {}),
    ...(Object.hasOwn(parsed, "internalLabel") ? { internalLabel: string(parsed.internalLabel, 1, 200) } : {}),
    providerKey: "paytr",
    subtotalCents,
    shippingCents,
    discountCents,
    items,
    ...(openedAt === undefined ? {} : { openedAt }),
    ...(paidAt === undefined ? {} : { paidAt }),
    ...(cancelledAt === undefined ? {} : { cancelledAt }),
    ...(orderId === undefined ? {} : { orderId }),
    updatedAt,
  } satisfies QuickOrderLinkDetail);
}

function sumItemTotals(items: readonly QuickOrderLinkItem[]): number {
  let total = 0;
  for (let position = 0; position < items.length; position += 1) {
    total += items[position]!.lineTotalCents;
  }
  return total;
}

export function parseQuickOrderLinkListItem(value: unknown): Readonly<QuickOrderLinkListItem> {
  return guarded(() => parseList(exact(value, [
    "id", "customerName", "customerEmail", "firstProductName", "itemCount", "status", "currency", "totalCents", "expiresAt", "createdAt", "version",
  ])));
}

export function parseQuickOrderLinkDetail(value: unknown): Readonly<QuickOrderLinkDetail> {
  return guarded(() => parseDetail(value));
}

export function parseQuickOrderLinkMutationResult(value: unknown): Readonly<QuickOrderLinkMutationResult> {
  return guarded(() => {
    const parsed = exact(value, ["id", "status", "version", "expiresAt", "updatedAt", "replayed"]);
    const expiresAt = timestamp(parsed.expiresAt);
    const updatedAt = timestamp(parsed.updatedAt);
    if (parsed.replayed !== true && parsed.replayed !== false) invalid();
    return freeze({
      id: uuid(parsed.id),
      status: status(parsed.status),
      version: safeInteger(parsed.version, 1),
      expiresAt,
      updatedAt,
      replayed: parsed.replayed,
    } satisfies QuickOrderLinkMutationResult);
  });
}

export function parseQuickOrderCreateIntent(value: unknown): Readonly<QuickOrderCreateIntent> {
  return guarded(() => {
    const parsed = exact(value, [
      "items", "customerName", "customerEmail", "customerPhone", "shippingAddress", "billingAddress",
      "shippingCents", "discountCents", "expiryHours",
    ], ["customerNote", "internalLabel"]);
    if (!QUICK_ORDER_EXPIRY_HOURS.includes(parsed.expiryHours as 4 | 12 | 24 | 48 | 72)) invalid();
    return freeze({
      items: parseCreateItems(parsed.items),
      customerName: string(parsed.customerName, 1, 200),
      customerEmail: string(parsed.customerEmail, 3, 320, CANONICAL_EMAIL),
      customerPhone: string(parsed.customerPhone, 3, 32),
      shippingAddress: parseAddress(parsed.shippingAddress),
      billingAddress: parseAddress(parsed.billingAddress),
      ...(Object.hasOwn(parsed, "customerNote") ? { customerNote: string(parsed.customerNote, 1, 2_000) } : {}),
      ...(Object.hasOwn(parsed, "internalLabel") ? { internalLabel: string(parsed.internalLabel, 1, 200) } : {}),
      shippingCents: safeInteger(parsed.shippingCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS),
      discountCents: safeInteger(parsed.discountCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS),
      expiryHours: parsed.expiryHours as 4 | 12 | 24 | 48 | 72,
    } satisfies QuickOrderCreateIntent);
  });
}
