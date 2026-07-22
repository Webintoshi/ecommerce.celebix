import {
  ANALYTICS_PERIODS,
  type AnalyticsDashboard,
  type AnalyticsPeriod,
  type AnalyticsSeriesPoint,
  type AnalyticsTopProduct,
} from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const CURRENCY = /^[A-Z]{3}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new TypeError("analytics_contract_invalid");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, required: readonly string[]): Record<string, unknown> {
  const parsed = record(value);
  const keys = Object.keys(parsed);
  if (required.some((key) => !Object.hasOwn(parsed, key)) || keys.some((key) => !required.includes(key))) invalid();
  return parsed;
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

function timestamp(value: unknown): string {
  const parsed = string(value, 24, 27, ISO_UTC);
  const date = new Date(parsed);
  const millisecondCanonical = parsed.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== millisecondCanonical) invalid();
  return parsed;
}

function timestampValue(value: string): number {
  return new Date(value).getTime();
}

function safeInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) invalid();
  return value as number;
}

function uuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) invalid();
  return value;
}

function period(value: unknown): AnalyticsPeriod {
  if (typeof value !== "string" || !ANALYTICS_PERIODS.includes(value as AnalyticsPeriod)) invalid();
  return value as AnalyticsPeriod;
}

function freeze<T>(value: T): Readonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}

function parseSeriesPoint(value: unknown): Readonly<AnalyticsSeriesPoint> {
  const parsed = exact(value, ["startsAt", "orders", "revenueCents"]);
  return freeze({
    startsAt: timestamp(parsed.startsAt),
    orders: safeInteger(parsed.orders),
    revenueCents: safeInteger(parsed.revenueCents),
  } satisfies AnalyticsSeriesPoint);
}

function parseTopProduct(value: unknown): Readonly<AnalyticsTopProduct> {
  const parsed = exact(value, ["productId", "title", "quantity", "revenueCents"]);
  return freeze({
    productId: uuid(parsed.productId),
    title: string(parsed.title, 1, 200),
    quantity: safeInteger(parsed.quantity),
    revenueCents: safeInteger(parsed.revenueCents),
  } satisfies AnalyticsTopProduct);
}

function parseArray<T>(value: unknown, maximum: number, parser: (entry: unknown) => Readonly<T>): readonly T[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  return freeze(value.map((entry) => parser(entry)) as T[]) as readonly T[];
}

export function parseAnalyticsDashboard(value: unknown): Readonly<AnalyticsDashboard> {
  const parsed = exact(value, [
    "period", "rangeStart", "rangeEnd", "generatedAt", "currency", "revenueCents", "orders", "customers", "catalog", "series", "topProducts",
  ]);
  const rangeStart = timestamp(parsed.rangeStart);
  const rangeEnd = timestamp(parsed.rangeEnd);
  const generatedAt = timestamp(parsed.generatedAt);
  if (timestampValue(rangeStart) > timestampValue(rangeEnd) || timestampValue(generatedAt) < timestampValue(rangeEnd)) invalid();

  const ordersValue = exact(parsed.orders, ["total", "paid", "cancelled", "refunded"]);
  const orders = {
    total: safeInteger(ordersValue.total),
    paid: safeInteger(ordersValue.paid),
    cancelled: safeInteger(ordersValue.cancelled),
    refunded: safeInteger(ordersValue.refunded),
  };
  if (orders.paid > orders.total || orders.cancelled > orders.total || orders.refunded > orders.total) invalid();

  const customersValue = exact(parsed.customers, ["total", "newInPeriod"]);
  const customers = {
    total: safeInteger(customersValue.total),
    newInPeriod: safeInteger(customersValue.newInPeriod),
  };
  if (customers.newInPeriod > customers.total) invalid();

  const catalogValue = exact(parsed.catalog, ["activeProducts", "lowStockVariants"]);
  const series = parseArray(parsed.series, 366, parseSeriesPoint);
  const topProducts = parseArray(parsed.topProducts, 20, parseTopProduct);
  return freeze({
    period: period(parsed.period),
    rangeStart,
    rangeEnd,
    generatedAt,
    currency: string(parsed.currency, 3, 3, CURRENCY),
    revenueCents: safeInteger(parsed.revenueCents),
    orders: freeze(orders),
    customers: freeze(customers),
    catalog: freeze({
      activeProducts: safeInteger(catalogValue.activeProducts),
      lowStockVariants: safeInteger(catalogValue.lowStockVariants),
    }),
    series,
    topProducts,
  } satisfies AnalyticsDashboard);
}
