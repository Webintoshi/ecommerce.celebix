import {
  ANALYTICS_CONNECTION_STATUSES,
  ANALYTICS_METRIC_TYPES,
  ANALYTICS_RANGES,
  ANALYTICS_PERIODS,
  type AnalyticsConnectionMutationResult,
  type AnalyticsConnectionStatus,
  type AnalyticsConnectionView,
  type AnalyticsMetricResult,
  type AnalyticsMetricRow,
  type AnalyticsMetricType,
  type AnalyticsPoint,
  type AnalyticsRange,
  type AnalyticsSummary,
  type AnalyticsDashboard,
  type AnalyticsPeriod,
  type AnalyticsSeriesPoint,
  type AnalyticsTopProduct,
} from "./types.ts";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const HOSTNAME = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DEVICE_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ._()/+-]{0,79}$/u;
const COUNTRY_LABEL = /^(?:[A-Z]{2}|unknown)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURRENCY = /^[A-Z]{3}$/;

function invalid(): never { throw new TypeError("analytics_contract_invalid"); }

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const parsed = record(value);
  const actual = Object.keys(parsed);
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(parsed, key))) invalid();
  return parsed;
}

function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  if (Object.keys(value).length !== value.length) invalid();
  return value;
}

function string(value: unknown, minimum: number, maximum: number, pattern?: RegExp): string {
  if (
    typeof value !== "string" || value.length < minimum || value.length > maximum ||
    value !== value.trim() || CONTROL.test(value) || (pattern !== undefined && !pattern.test(value))
  ) invalid();
  return value;
}

function analyticsPeriod(value: unknown): AnalyticsPeriod {
  if (typeof value !== "string" || !ANALYTICS_PERIODS.includes(value as AnalyticsPeriod)) invalid();
  return value as AnalyticsPeriod;
}

function count(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) invalid();
  return value as number;
}

function positiveVersion(value: unknown): number {
  const parsed = count(value);
  if (parsed < 1) invalid();
  return parsed;
}

function timestamp(value: unknown): string {
  if (typeof value !== "string" || !ISO_UTC.test(value)) invalid();
  const date = new Date(value);
  const canonical = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical) invalid();
  return value;
}

function range(value: unknown): AnalyticsRange {
  if (typeof value !== "string" || !ANALYTICS_RANGES.includes(value as AnalyticsRange)) invalid();
  return value as AnalyticsRange;
}

function metricType(value: unknown): AnalyticsMetricType {
  if (typeof value !== "string" || !ANALYTICS_METRIC_TYPES.includes(value as AnalyticsMetricType)) invalid();
  return value as AnalyticsMetricType;
}

function connectionStatus(value: unknown): AnalyticsConnectionStatus {
  if (typeof value !== "string" || !ANALYTICS_CONNECTION_STATUSES.includes(value as AnalyticsConnectionStatus)) invalid();
  return value as AnalyticsConnectionStatus;
}

function hostname(value: unknown): string {
  const parsed = string(value, 3, 253);
  if (!HOSTNAME.test(parsed)) invalid();
  return parsed;
}

function nullable<T>(value: unknown, parser: (input: unknown) => T): T | null {
  return value === null ? null : parser(value);
}

function comparison(value: unknown): AnalyticsSummary["comparison"] {
  if (value === null) return null;
  const parsed = exact(value, ["pageviews", "visitors", "visits", "bounces"]);
  const visits = count(parsed.visits);
  const bounces = count(parsed.bounces);
  if (bounces > visits) invalid();
  return Object.freeze({
    pageviews: count(parsed.pageviews),
    visitors: count(parsed.visitors),
    visits,
    bounces,
  });
}

function points(value: unknown): readonly AnalyticsPoint[] {
  const parsed = denseArray(value, 366);
  const output = parsed.map((entry) => {
    const point = exact(entry, ["at", "value"]);
    return Object.freeze({ at: timestamp(point.at), value: count(point.value) });
  });
  for (let index = 1; index < output.length; index += 1) {
    if (output[index - 1]!.at >= output[index]!.at) invalid();
  }
  return Object.freeze(output);
}

function metricLabel(value: unknown, type: AnalyticsMetricType): string {
  const label = string(value, 1, 2_048);
  if (type === "path") {
    if (!label.startsWith("/") || label.startsWith("//") || /[?#\\\s]/.test(label)) invalid();
    return label;
  }
  if (type === "referrer") {
    if (label === "direct" || label === "unknown") return label;
    let url: URL;
    try { url = new URL(label); } catch { return invalid(); }
    if (
      url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "" ||
      url.pathname !== "/" || url.search !== "" || url.hash !== "" || url.origin !== label
    ) invalid();
    return label;
  }
  if (type === "country" && !COUNTRY_LABEL.test(label)) invalid();
  if (type === "device" && !DEVICE_LABEL.test(label)) invalid();
  return label;
}

export function parseAnalyticsConnectionView(value: unknown): AnalyticsConnectionView {
  const parsed = exact(value, ["schemaVersion", "provider", "status", "configured", "hostname", "version", "lastVerifiedAt"]);
  if (parsed.schemaVersion !== 1 || parsed.provider !== "umami" || typeof parsed.configured !== "boolean") invalid();
  const selectedHostname = nullable(parsed.hostname, hostname);
  const version = nullable(parsed.version, positiveVersion);
  const lastVerifiedAt = nullable(parsed.lastVerifiedAt, timestamp);
  if (parsed.configured !== (selectedHostname !== null && version !== null)) invalid();
  if (!parsed.configured && lastVerifiedAt !== null) invalid();
  return Object.freeze({
    schemaVersion: 1,
    provider: "umami",
    status: connectionStatus(parsed.status),
    configured: parsed.configured,
    hostname: selectedHostname,
    version,
    lastVerifiedAt,
  });
}

export function parseAnalyticsSummary(value: unknown): AnalyticsSummary {
  const parsed = exact(value, [
    "schemaVersion", "range", "asOf", "pageviews", "visitors", "visits", "bounces",
    "totalTimeSeconds", "activeVisitors", "bounceRateBasisPoints", "averageVisitSeconds",
    "comparison", "pageviewsSeries", "visitsSeries",
  ]);
  if (parsed.schemaVersion !== 1) invalid();
  const visits = count(parsed.visits);
  const bounces = count(parsed.bounces);
  const totalTimeSeconds = count(parsed.totalTimeSeconds);
  if (bounces > visits) invalid();
  const bounceRateBasisPoints = visits === 0 ? 0 : Math.round((bounces * 10_000) / visits);
  const averageVisitSeconds = visits === 0 ? 0 : Math.round(totalTimeSeconds / visits);
  if (count(parsed.bounceRateBasisPoints) !== bounceRateBasisPoints || count(parsed.averageVisitSeconds) !== averageVisitSeconds) invalid();
  return Object.freeze({
    schemaVersion: 1,
    range: range(parsed.range),
    asOf: timestamp(parsed.asOf),
    pageviews: count(parsed.pageviews),
    visitors: count(parsed.visitors),
    visits,
    bounces,
    totalTimeSeconds,
    activeVisitors: count(parsed.activeVisitors),
    bounceRateBasisPoints,
    averageVisitSeconds,
    comparison: comparison(parsed.comparison),
    pageviewsSeries: points(parsed.pageviewsSeries),
    visitsSeries: points(parsed.visitsSeries),
  });
}

export function parseAnalyticsMetricResult(value: unknown): AnalyticsMetricResult {
  const parsed = exact(value, ["schemaVersion", "range", "type", "asOf", "items"]);
  if (parsed.schemaVersion !== 1) invalid();
  const type = metricType(parsed.type);
  const items = denseArray(parsed.items, 100).map((entry): AnalyticsMetricRow => {
    const row = exact(entry, ["label", "value"]);
    return Object.freeze({ label: metricLabel(row.label, type), value: count(row.value) });
  });
  return Object.freeze({
    schemaVersion: 1,
    range: range(parsed.range),
    type,
    asOf: timestamp(parsed.asOf),
    items: Object.freeze(items),
  });
}

export function parseAnalyticsConnectionMutationResult(value: unknown): AnalyticsConnectionMutationResult {
  const parsed = exact(value, ["status", "version", "updatedAt", "replayed"]);
  if (typeof parsed.replayed !== "boolean") invalid();
  return Object.freeze({
    status: connectionStatus(parsed.status),
    version: positiveVersion(parsed.version),
    updatedAt: timestamp(parsed.updatedAt),
    replayed: parsed.replayed,
  });
}

export function parseAnalyticsDashboard(value: unknown): Readonly<AnalyticsDashboard> {
  const parsed = exact(value, ["period", "rangeStart", "rangeEnd", "generatedAt", "currency", "revenueCents", "orders", "customers", "catalog", "series", "topProducts"]);
  const rangeStart = timestamp(parsed.rangeStart);
  const rangeEnd = timestamp(parsed.rangeEnd);
  const generatedAt = timestamp(parsed.generatedAt);
  if (new Date(rangeStart).getTime() > new Date(rangeEnd).getTime() || new Date(generatedAt).getTime() < new Date(rangeEnd).getTime()) invalid();
  const orderValues = exact(parsed.orders, ["total", "paid", "cancelled", "refunded"]);
  const orders = Object.freeze({ total: count(orderValues.total), paid: count(orderValues.paid), cancelled: count(orderValues.cancelled), refunded: count(orderValues.refunded) });
  if (orders.paid > orders.total || orders.cancelled > orders.total || orders.refunded > orders.total) invalid();
  const customerValues = exact(parsed.customers, ["total", "newInPeriod"]);
  const customers = Object.freeze({ total: count(customerValues.total), newInPeriod: count(customerValues.newInPeriod) });
  if (customers.newInPeriod > customers.total) invalid();
  const catalogValues = exact(parsed.catalog, ["activeProducts", "lowStockVariants"]);
  const series = Object.freeze(denseArray(parsed.series, 366).map((entry): Readonly<AnalyticsSeriesPoint> => {
    const point = exact(entry, ["startsAt", "orders", "revenueCents"]);
    return Object.freeze({ startsAt: timestamp(point.startsAt), orders: count(point.orders), revenueCents: count(point.revenueCents) });
  }));
  const topProducts = Object.freeze(denseArray(parsed.topProducts, 20).map((entry): Readonly<AnalyticsTopProduct> => {
    const product = exact(entry, ["productId", "title", "quantity", "revenueCents"]);
    return Object.freeze({ productId: string(product.productId, 36, 36, UUID), title: string(product.title, 1, 200), quantity: count(product.quantity), revenueCents: count(product.revenueCents) });
  }));
  if (new Set(topProducts.map(({ productId }) => productId)).size !== topProducts.length) invalid();
  return Object.freeze({
    period: analyticsPeriod(parsed.period), rangeStart, rangeEnd, generatedAt,
    currency: string(parsed.currency, 3, 3, CURRENCY), revenueCents: count(parsed.revenueCents),
    orders, customers,
    catalog: Object.freeze({ activeProducts: count(catalogValues.activeProducts), lowStockVariants: count(catalogValues.lowStockVariants) }),
    series, topProducts,
  });
}
