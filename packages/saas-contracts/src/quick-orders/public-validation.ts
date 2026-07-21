import {
  QUICK_ORDER_MAX_COMPONENT_CENTS,
  QUICK_ORDER_MAX_TOTAL_CENTS,
  QUICK_ORDER_MAX_UNIT_PRICE_CENTS,
} from "./types.ts";
import type { CheckoutState, QuickOrderMerchantUrl, QuickOrderPublicQuote } from "./public-types.ts";

const CONTROL = /[\u0000-\u001f\u007f]/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const TOKEN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

type InputRecord = Readonly<Record<string, unknown>>;

function invalid(): never {
  throw new TypeError("quick_order_contract_invalid");
}

function guarded<T>(operation: () => T): T {
  try {
    return operation();
  } catch {
    return invalid();
  }
}

function exact(value: unknown, required: readonly string[], optional: readonly string[] = []): InputRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const keys = Reflect.ownKeys(descriptors);
  const allowed = new Set([...required, ...optional]);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || required.some((key) => !Object.hasOwn(descriptors, key))) invalid();
  const copy: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== "string") invalid();
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    copy[key] = descriptor.value;
  }
  return copy;
}

function string(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum || value !== value.trim() || CONTROL.test(value)) invalid();
  return value;
}

function integer(value: unknown, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const parsed = new Date(value);
  const milliseconds = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== milliseconds) invalid();
  return value;
}

function httpsUrl(value: unknown): string {
  const raw = string(value, 1, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return invalid();
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.hash || parsed.hostname !== parsed.hostname.toLowerCase() || parsed.toString() !== raw) invalid();
  return raw;
}

function quoteItems(value: unknown): QuickOrderPublicQuote["items"] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<PropertyKey, PropertyDescriptor>;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !("value" in lengthDescriptor) || lengthDescriptor.enumerable) invalid();
  const length = integer(lengthDescriptor.value, 1, 100);
  if (Reflect.ownKeys(descriptors).length !== length + 1) invalid();
  const items: QuickOrderPublicQuote["items"][number][] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) invalid();
    const parsed = exact(descriptor.value, ["productName", "unitPriceCents", "quantity", "lineTotalCents"], ["variantName", "imageUrl"]);
    const unitPriceCents = integer(parsed.unitPriceCents, 0, QUICK_ORDER_MAX_UNIT_PRICE_CENTS);
    const quantity = integer(parsed.quantity, 1, 9_999);
    const lineTotalCents = integer(parsed.lineTotalCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
    if (lineTotalCents !== unitPriceCents * quantity) invalid();
    items.push(Object.freeze({
      productName: string(parsed.productName, 1, 200),
      ...(Object.hasOwn(parsed, "variantName") ? { variantName: string(parsed.variantName, 1, 200) } : {}),
      ...(Object.hasOwn(parsed, "imageUrl") ? { imageUrl: httpsUrl(parsed.imageUrl) } : {}),
      unitPriceCents,
      quantity,
      lineTotalCents,
    }));
  }
  return Object.freeze(items);
}

function parseQuote(value: unknown): Readonly<QuickOrderPublicQuote> {
  const parsed = exact(value, [
    "schemaVersion", "status", "merchantName", "currency", "subtotalCents", "shippingCents", "discountCents", "totalCents", "expiresAt", "items",
  ]);
  if (parsed.schemaVersion !== 1 || (parsed.status !== "active" && parsed.status !== "opened") || parsed.currency !== "TRY") invalid();
  const items = quoteItems(parsed.items);
  const subtotalCents = integer(parsed.subtotalCents, 0, QUICK_ORDER_MAX_TOTAL_CENTS);
  const shippingCents = integer(parsed.shippingCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
  const discountCents = integer(parsed.discountCents, 0, QUICK_ORDER_MAX_COMPONENT_CENTS);
  const totalCents = integer(parsed.totalCents, 0, QUICK_ORDER_MAX_TOTAL_CENTS);
  const itemSubtotal = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  if (!Number.isSafeInteger(itemSubtotal) || subtotalCents !== itemSubtotal || discountCents > subtotalCents + shippingCents || totalCents !== subtotalCents + shippingCents - discountCents) invalid();
  return Object.freeze({
    schemaVersion: 1,
    status: parsed.status,
    merchantName: string(parsed.merchantName, 1, 200),
    currency: "TRY",
    subtotalCents,
    shippingCents,
    discountCents,
    totalCents,
    expiresAt: timestamp(parsed.expiresAt),
    items,
  });
}

export function parseQuickOrderPublicQuote(value: unknown): Readonly<QuickOrderPublicQuote> {
  return guarded(() => parseQuote(value));
}

export function parseQuickOrderMerchantUrl(value: unknown): Readonly<QuickOrderMerchantUrl> {
  return guarded(() => {
    const parsed = exact(value, ["url", "expiresAt"]);
    const raw = httpsUrl(parsed.url);
    const url = new URL(raw);
    const parts = url.pathname.split("/");
    const token = parts[3];
    if (
      parts.length !== 4 || parts[1] !== "odeme" || parts[2] !== "hizli" || token === undefined || !TOKEN.test(token) ||
      raw.includes("?") || raw.includes("#")
    ) invalid();
    return Object.freeze({ url: raw, expiresAt: timestamp(parsed.expiresAt) });
  });
}

export function parseCheckoutState(value: unknown): CheckoutState {
  return guarded(() => {
    const candidate = exact(value, ["kind"], ["quote", "orderNumber"]);
    if (candidate.kind === "ready") {
      const parsed = exact(value, ["kind", "quote"]);
      return Object.freeze({ kind: "ready", quote: parseQuote(parsed.quote) });
    }
    if (candidate.kind === "paid") {
      const parsed = exact(value, ["kind", "orderNumber"]);
      return Object.freeze({ kind: "paid", orderNumber: string(parsed.orderNumber, 1, 128) });
    }
    if (candidate.kind === "processing" || candidate.kind === "failed" || candidate.kind === "unavailable") {
      exact(value, ["kind"]);
      return Object.freeze({ kind: candidate.kind });
    }
    return invalid();
  });
}
