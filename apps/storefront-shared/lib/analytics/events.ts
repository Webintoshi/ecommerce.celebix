import type { SafeUmamiTracker } from "./tracker-client.ts";

export const CHECKOUT_EVENTS = Object.freeze([
  "checkout_started",
  "checkout_delivery_saved",
  "checkout_submitted",
  "checkout_completed",
  "checkout_failed",
] as const);

export type CheckoutEventName = typeof CHECKOUT_EVENTS[number];
export type CheckoutMethodKind = "provider" | "cash_on_delivery" | "bank_transfer";
export type CheckoutProviderCode = "paytr_iframe" | "iyzico_iframe";
export type CheckoutResultCode =
  | "ready"
  | "processing"
  | "placed"
  | "paid"
  | "failed"
  | "invalid_input"
  | "origin_denied"
  | "cart_not_found"
  | "cart_changed"
  | "discount_invalid"
  | "stock_unavailable"
  | "payment_unavailable"
  | "unavailable";

type CheckoutCommerceEventData = Readonly<{
  methodKind?: CheckoutMethodKind;
  providerCode?: CheckoutProviderCode;
  itemCount?: number;
  currency?: "TRY";
  resultCode?: CheckoutResultCode;
}>;

export type CheckoutCommerceEvent = Readonly<{
  name: CheckoutEventName;
  data: CheckoutCommerceEventData;
}>;

export type PublicCommerceEvent =
  | Readonly<{ name: "product_view"; data: Readonly<{ product: "catalog_item" }> }>
  | Readonly<{ name: "checkout_started"; data: Readonly<{ source: "quick_order" }> }>
  | CheckoutCommerceEvent;

type EventBrowser = Readonly<{ location: Readonly<{ protocol: string; hostname: string; pathname: string }> }>;

export const PRODUCT_VIEW_EVENT: PublicCommerceEvent = Object.freeze({ name: "product_view", data: Object.freeze({ product: "catalog_item" }) });
export const CHECKOUT_STARTED_EVENT: PublicCommerceEvent = Object.freeze({ name: "checkout_started", data: Object.freeze({ source: "quick_order" }) });

const CHECKOUT_METHOD_KINDS: readonly CheckoutMethodKind[] = Object.freeze([
  "provider",
  "cash_on_delivery",
  "bank_transfer",
]);
const CHECKOUT_PROVIDER_CODES: readonly CheckoutProviderCode[] = Object.freeze([
  "paytr_iframe",
  "iyzico_iframe",
]);
const CHECKOUT_COMPLETION_CODES: readonly CheckoutResultCode[] = Object.freeze([
  "placed",
  "paid",
]);
const CHECKOUT_FAILURE_CODES: readonly CheckoutResultCode[] = Object.freeze([
  "failed",
  "invalid_input",
  "origin_denied",
  "cart_not_found",
  "cart_changed",
  "discount_invalid",
  "stock_unavailable",
  "payment_unavailable",
  "unavailable",
]);
const MAX_CHECKOUT_ITEMS = 100;

function invalid(): never {
  throw new Error("storefront_analytics_event_invalid");
}

function exactDataRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== "object"
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.getOwnPropertySymbols(value).length !== 0
  ) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort();
  const allowed = [...required, ...optional].sort();
  if (
    keys.some((key) => !allowed.includes(key))
    || required.some((key) => !Object.hasOwn(descriptors, key))
  ) invalid();
  const selected: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value")) invalid();
    selected[key] = descriptor.value;
  }
  return Object.freeze(selected);
}

function finiteString<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T {
  if (
    typeof value !== "string"
    || new TextEncoder().encode(value).byteLength > 64
    || !allowed.includes(value as T)
  ) invalid();
  return value as T;
}

function itemCount(value: unknown): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < 1
    || (value as number) > MAX_CHECKOUT_ITEMS
  ) invalid();
  return value as number;
}

function methodData(
  value: Readonly<Record<string, unknown>>,
): Readonly<{
  methodKind: CheckoutMethodKind;
  providerCode?: CheckoutProviderCode;
}> {
  const methodKind = finiteString(value.methodKind, CHECKOUT_METHOD_KINDS);
  if (methodKind === "provider") {
    if (!Object.hasOwn(value, "providerCode")) invalid();
    return Object.freeze({
      methodKind,
      providerCode: finiteString(value.providerCode, CHECKOUT_PROVIDER_CODES),
    });
  }
  if (Object.hasOwn(value, "providerCode")) invalid();
  return Object.freeze({ methodKind });
}

function parseCheckoutCommerceEvent(
  input: CheckoutCommerceEvent,
): CheckoutCommerceEvent {
  const event = exactDataRecord(input, ["name", "data"]);
  const name = finiteString(event.name, CHECKOUT_EVENTS);
  if (name === "checkout_started" || name === "checkout_delivery_saved") {
    const data = exactDataRecord(event.data, ["currency", "itemCount"]);
    return Object.freeze({
      name,
      data: Object.freeze({
        currency: finiteString(data.currency, ["TRY"] as const),
        itemCount: itemCount(data.itemCount),
      }),
    });
  }
  if (name === "checkout_submitted") {
    const data = exactDataRecord(
      event.data,
      ["currency", "itemCount", "methodKind"],
      ["providerCode"],
    );
    return Object.freeze({
      name,
      data: Object.freeze({
        ...methodData(data),
        currency: finiteString(data.currency, ["TRY"] as const),
        itemCount: itemCount(data.itemCount),
      }),
    });
  }
  const data = exactDataRecord(
    event.data,
    ["resultCode"],
    ["methodKind", "providerCode"],
  );
  const hasMethod = Object.hasOwn(data, "methodKind");
  if (!hasMethod && Object.hasOwn(data, "providerCode")) invalid();
  return Object.freeze({
    name,
    data: Object.freeze({
      ...(hasMethod ? methodData(data) : {}),
      resultCode: finiteString(
        data.resultCode,
        name === "checkout_completed"
          ? CHECKOUT_COMPLETION_CODES
          : CHECKOUT_FAILURE_CODES,
      ),
    }),
  });
}

export function createCheckoutCommerceEvent(
  input: CheckoutCommerceEvent,
): PublicCommerceEvent {
  try {
    return parseCheckoutCommerceEvent(input);
  } catch {
    return invalid();
  }
}

function parseEvent(value: PublicCommerceEvent): PublicCommerceEvent {
  const event = exactDataRecord(value, ["name", "data"]);
  if (event.name === "product_view") {
    const data = exactDataRecord(event.data, ["product"]);
    if (data.product === "catalog_item") return PRODUCT_VIEW_EVENT;
    return invalid();
  }
  if (event.name === "checkout_started") {
    try {
      const data = exactDataRecord(event.data, ["source"]);
      if (data.source === "quick_order") return CHECKOUT_STARTED_EVENT;
    } catch {}
  }
  if (CHECKOUT_EVENTS.includes(event.name as CheckoutEventName)) {
    return createCheckoutCommerceEvent(value as CheckoutCommerceEvent);
  }
  return invalid();
}

export function trackCommerceEvent(tracker: SafeUmamiTracker, event: PublicCommerceEvent, selectedBrowser?: EventBrowser): void {
  const parsed = parseEvent(event);
  try {
    const browser = selectedBrowser ?? (globalThis.window as unknown as EventBrowser);
    if (!browser || browser.location.protocol !== "https:" || browser.location.hostname !== tracker.hostname) return;
    const selected = new URL(browser.location.pathname, `https://${tracker.hostname}`);
    if (selected.hostname !== tracker.hostname || selected.protocol !== "https:") return;
    tracker.track(Object.freeze({ website: tracker.websiteId, hostname: tracker.hostname, url: selected.pathname, name: parsed.name, data: parsed.data }));
  } catch {}
}
