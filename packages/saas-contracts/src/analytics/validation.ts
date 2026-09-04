import {
  ANALYTICS_CONNECTION_STATUSES,
  ANALYTICS_METRIC_TYPES,
  ANALYTICS_RANGES,
  ANALYTICS_PERIODS,
  BROWSER_COMMERCE_EVENT_NAMES,
  SERVER_COMMERCE_EVENT_NAMES,
  type AnalyticsConnectionMutationResult,
  type AnalyticsConnectionStatus,
  type AnalyticsConnectionView,
  type AnalyticsMetricResult,
  type AnalyticsMetricRow,
  type AnalyticsMetricType,
  type AnalyticsPoint,
  type AnalyticsRange,
  type AnalyticsSummary,
  type AnalyticsActiveVisitors,
  type AnalyticsDashboard,
  type AnalyticsPeriod,
  type AnalyticsSeriesPoint,
  type AnalyticsTopProduct,
  type BrowserCommerceEvent,
  type CommerceAnalyticsEvent,
  type CommerceEventName,
  type ServerCommerceEvent,
  type CommerceAnalyticsCurrencyBucket,
  type CommerceAnalyticsSeriesPoint,
  type CommerceAnalyticsCartRow,
  type CommerceAnalyticsSnapshot,
  type CommerceAnalyticsSettings,
} from "./types.ts";

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.(?:\d{3}|\d{6})Z$/;
const HOSTNAME =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DEVICE_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} ._()/+-]{0,79}$/u;
const COUNTRY_LABEL = /^(?:[A-Z]{2}|unknown)$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CURRENCY = /^[A-Z]{3}$/;
const OPAQUE_REF = /^h[1-9][0-9]*_[0-9a-f]{64}$/;
const SAFE_DIMENSION = /^[\p{L}\p{N}][\p{L}\p{N} ._+:/-]{0,127}$/u;
const SAFE_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const SEARCH_SAFE = /^[\p{L}\p{N}][\p{L}\p{N} .,'’()/_+-]{0,63}$/u;
const EMAIL_LIKE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u;
const URL_LIKE =
  /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|tr)\b)/i;
const PHONE_LIKE = /(?:\+?\d[\d ()-]{8,}\d)/;
const CARD_LIKE = /(?:\d[ -]?){13,19}/;
const TOKEN_LIKE =
  /(?:token\s*=|[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,})/i;
const COMMERCE_KEYS = Object.freeze([
  "schemaVersion",
  "eventName",
  "occurredAt",
  "anonymousSessionRef",
  "cartRef",
  "checkoutRef",
  "orderRef",
  "productId",
  "variantId",
  "categoryId",
  "quantity",
  "currency",
  "valueMinor",
  "paymentMethod",
  "shippingMethod",
  "campaign",
  "source",
  "medium",
  "safeErrorCode",
] as const);

function invalid(): never {
  throw new TypeError("analytics_contract_invalid");
}

export function parseAnalyticsSafeDimension(value: unknown): string {
  const dimension = string(value, 1, 128, SAFE_DIMENSION);
  if (
    EMAIL_LIKE.test(dimension) ||
    URL_LIKE.test(dimension) ||
    PHONE_LIKE.test(dimension) ||
    CARD_LIKE.test(dimension) ||
    TOKEN_LIKE.test(dimension)
  )
    invalid();
  return dimension;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  return value as Record<string, unknown>;
}

function exact(
  value: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const parsed = record(value);
  const allowed = new Set([...keys, ...optional]);
  if (
    keys.some((key) => !Object.hasOwn(parsed, key)) ||
    Object.keys(parsed).some((key) => !allowed.has(key))
  )
    invalid();
  return parsed;
}

function denseArray(value: unknown, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) invalid();
  if (Object.keys(value).length !== value.length) invalid();
  return value;
}

function string(
  value: unknown,
  minimum: number,
  maximum: number,
  pattern?: RegExp,
): string {
  if (
    typeof value !== "string" ||
    value.length < minimum ||
    value.length > maximum ||
    value !== value.trim() ||
    CONTROL.test(value) ||
    (pattern !== undefined && !pattern.test(value))
  )
    invalid();
  return value;
}

function analyticsPeriod(value: unknown): AnalyticsPeriod {
  if (
    typeof value !== "string" ||
    !ANALYTICS_PERIODS.includes(value as AnalyticsPeriod)
  )
    invalid();
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
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical)
    invalid();
  return value;
}

function range(value: unknown): AnalyticsRange {
  if (
    typeof value !== "string" ||
    !ANALYTICS_RANGES.includes(value as AnalyticsRange)
  )
    invalid();
  return value as AnalyticsRange;
}

function metricType(value: unknown): AnalyticsMetricType {
  if (
    typeof value !== "string" ||
    !ANALYTICS_METRIC_TYPES.includes(value as AnalyticsMetricType)
  )
    invalid();
  return value as AnalyticsMetricType;
}

function connectionStatus(value: unknown): AnalyticsConnectionStatus {
  if (
    typeof value !== "string" ||
    !ANALYTICS_CONNECTION_STATUSES.includes(value as AnalyticsConnectionStatus)
  )
    invalid();
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
    return Object.freeze({
      at: timestamp(point.at),
      value: count(point.value),
    });
  });
  for (let index = 1; index < output.length; index += 1) {
    if (output[index - 1]!.at >= output[index]!.at) invalid();
  }
  return Object.freeze(output);
}

function metricLabel(value: unknown, type: AnalyticsMetricType): string {
  const label = string(value, 1, 2_048);
  if (type === "path") {
    if (
      !label.startsWith("/") ||
      label.startsWith("//") ||
      /[?#\\\s]/.test(label)
    )
      invalid();
    return label;
  }
  if (type === "referrer") {
    if (label === "direct" || label === "unknown") return label;
    let url: URL;
    try {
      url = new URL(label);
    } catch {
      return invalid();
    }
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.origin !== label
    )
      invalid();
    return label;
  }
  if (type === "country" && !COUNTRY_LABEL.test(label)) invalid();
  if (type === "device" && !DEVICE_LABEL.test(label)) invalid();
  if (
    type === "event" &&
    ![...BROWSER_COMMERCE_EVENT_NAMES, ...SERVER_COMMERCE_EVENT_NAMES].includes(
      label as CommerceEventName,
    )
  )
    invalid();
  return label;
}

export function parseAnalyticsConnectionView(
  value: unknown,
): AnalyticsConnectionView {
  const parsed = exact(value, [
    "schemaVersion",
    "provider",
    "status",
    "configured",
    "hostname",
    "version",
    "lastVerifiedAt",
  ]);
  if (
    parsed.schemaVersion !== 1 ||
    parsed.provider !== "umami" ||
    typeof parsed.configured !== "boolean"
  )
    invalid();
  const selectedHostname = nullable(parsed.hostname, hostname);
  const version = nullable(parsed.version, positiveVersion);
  const lastVerifiedAt = nullable(parsed.lastVerifiedAt, timestamp);
  if (parsed.configured !== (selectedHostname !== null && version !== null))
    invalid();
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
    "schemaVersion",
    "range",
    "asOf",
    "pageviews",
    "visitors",
    "visits",
    "bounces",
    "totalTimeSeconds",
    "activeVisitors",
    "bounceRateBasisPoints",
    "averageVisitSeconds",
    "comparison",
    "pageviewsSeries",
    "visitsSeries",
  ]);
  if (parsed.schemaVersion !== 1) invalid();
  const visits = count(parsed.visits);
  const bounces = count(parsed.bounces);
  const totalTimeSeconds = count(parsed.totalTimeSeconds);
  if (bounces > visits) invalid();
  const bounceRateBasisPoints =
    visits === 0 ? 0 : Math.round((bounces * 10_000) / visits);
  const averageVisitSeconds =
    visits === 0 ? 0 : Math.round(totalTimeSeconds / visits);
  if (
    count(parsed.bounceRateBasisPoints) !== bounceRateBasisPoints ||
    count(parsed.averageVisitSeconds) !== averageVisitSeconds
  )
    invalid();
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

export function parseAnalyticsActiveVisitors(
  value: unknown,
): AnalyticsActiveVisitors {
  const parsed = exact(value, [
    "schemaVersion",
    "status",
    "activeVisitors",
    "asOf",
  ]);
  if (
    parsed.schemaVersion !== 1 ||
    (parsed.status !== "ready" && parsed.status !== "unavailable")
  )
    invalid();
  const activeVisitors =
    parsed.activeVisitors === null ? null : count(parsed.activeVisitors);
  if (
    (parsed.status === "ready" && activeVisitors === null) ||
    (parsed.status === "unavailable" && activeVisitors !== null)
  )
    invalid();
  return Object.freeze({
    schemaVersion: 1,
    status: parsed.status,
    activeVisitors,
    asOf: timestamp(parsed.asOf),
  });
}

export function parseAnalyticsMetricResult(
  value: unknown,
): AnalyticsMetricResult {
  const parsed = exact(value, [
    "schemaVersion",
    "range",
    "type",
    "asOf",
    "items",
  ]);
  if (parsed.schemaVersion !== 1) invalid();
  const type = metricType(parsed.type);
  const items = denseArray(parsed.items, 100).map(
    (entry): AnalyticsMetricRow => {
      const row = exact(entry, ["label", "value"]);
      return Object.freeze({
        label: metricLabel(row.label, type),
        value: count(row.value),
      });
    },
  );
  return Object.freeze({
    schemaVersion: 1,
    range: range(parsed.range),
    type,
    asOf: timestamp(parsed.asOf),
    items: Object.freeze(items),
  });
}

export function parseAnalyticsConnectionMutationResult(
  value: unknown,
): AnalyticsConnectionMutationResult {
  const parsed = exact(value, ["status", "version", "updatedAt", "replayed"]);
  if (typeof parsed.replayed !== "boolean") invalid();
  return Object.freeze({
    status: connectionStatus(parsed.status),
    version: positiveVersion(parsed.version),
    updatedAt: timestamp(parsed.updatedAt),
    replayed: parsed.replayed,
  });
}

export function parseAnalyticsDashboard(
  value: unknown,
): Readonly<AnalyticsDashboard> {
  const parsed = exact(value, [
    "period",
    "rangeStart",
    "rangeEnd",
    "generatedAt",
    "currency",
    "revenueCents",
    "orders",
    "customers",
    "catalog",
    "series",
    "topProducts",
  ]);
  const rangeStart = timestamp(parsed.rangeStart);
  const rangeEnd = timestamp(parsed.rangeEnd);
  const generatedAt = timestamp(parsed.generatedAt);
  if (
    new Date(rangeStart).getTime() > new Date(rangeEnd).getTime() ||
    new Date(generatedAt).getTime() < new Date(rangeEnd).getTime()
  )
    invalid();
  const orderValues = exact(parsed.orders, [
    "total",
    "paid",
    "cancelled",
    "refunded",
  ]);
  const orders = Object.freeze({
    total: count(orderValues.total),
    paid: count(orderValues.paid),
    cancelled: count(orderValues.cancelled),
    refunded: count(orderValues.refunded),
  });
  if (
    orders.paid > orders.total ||
    orders.cancelled > orders.total ||
    orders.refunded > orders.total
  )
    invalid();
  const customerValues = exact(parsed.customers, ["total", "newInPeriod"]);
  const customers = Object.freeze({
    total: count(customerValues.total),
    newInPeriod: count(customerValues.newInPeriod),
  });
  if (customers.newInPeriod > customers.total) invalid();
  const catalogValues = exact(parsed.catalog, [
    "activeProducts",
    "lowStockVariants",
  ]);
  const series = Object.freeze(
    denseArray(parsed.series, 366).map(
      (entry): Readonly<AnalyticsSeriesPoint> => {
        const point = exact(entry, ["startsAt", "orders", "revenueCents"]);
        return Object.freeze({
          startsAt: timestamp(point.startsAt),
          orders: count(point.orders),
          revenueCents: count(point.revenueCents),
        });
      },
    ),
  );
  const topProducts = Object.freeze(
    denseArray(parsed.topProducts, 20).map(
      (entry): Readonly<AnalyticsTopProduct> => {
        const product = exact(entry, [
          "productId",
          "title",
          "quantity",
          "revenueCents",
        ]);
        return Object.freeze({
          productId: string(product.productId, 36, 36, UUID),
          title: string(product.title, 1, 200),
          quantity: count(product.quantity),
          revenueCents: count(product.revenueCents),
        });
      },
    ),
  );
  if (
    new Set(topProducts.map(({ productId }) => productId)).size !==
    topProducts.length
  )
    invalid();
  return Object.freeze({
    period: analyticsPeriod(parsed.period),
    rangeStart,
    rangeEnd,
    generatedAt,
    currency: string(parsed.currency, 3, 3, CURRENCY),
    revenueCents: count(parsed.revenueCents),
    orders,
    customers,
    catalog: Object.freeze({
      activeProducts: count(catalogValues.activeProducts),
      lowStockVariants: count(catalogValues.lowStockVariants),
    }),
    series,
    topProducts,
  });
}

function commerceEvent(
  value: unknown,
  allowedNames: readonly CommerceEventName[],
): CommerceAnalyticsEvent {
  const parsed = record(value);
  const keys = Object.keys(parsed);
  if (
    keys.length < 3 ||
    keys.some((key) => !(COMMERCE_KEYS as readonly string[]).includes(key)) ||
    !Object.hasOwn(parsed, "schemaVersion") ||
    !Object.hasOwn(parsed, "eventName") ||
    !Object.hasOwn(parsed, "occurredAt") ||
    parsed.schemaVersion !== 1 ||
    typeof parsed.eventName !== "string" ||
    !allowedNames.includes(parsed.eventName as CommerceEventName)
  )
    invalid();
  if (new TextEncoder().encode(JSON.stringify(parsed)).byteLength > 2_048)
    invalid();
  const output: Record<string, unknown> = {
    schemaVersion: 1,
    eventName: parsed.eventName,
    occurredAt: timestamp(parsed.occurredAt),
  };
  for (const key of [
    "anonymousSessionRef",
    "cartRef",
    "checkoutRef",
    "orderRef",
  ] as const) {
    if (Object.hasOwn(parsed, key))
      output[key] = string(parsed[key], 67, 72, OPAQUE_REF);
  }
  for (const key of ["productId", "variantId", "categoryId"] as const) {
    if (Object.hasOwn(parsed, key))
      output[key] = string(parsed[key], 36, 36, UUID);
  }
  if (Object.hasOwn(parsed, "quantity")) {
    const value = count(parsed.quantity);
    if (value < 1 || value > 9_999) invalid();
    output.quantity = value;
  }
  const hasCurrency = Object.hasOwn(parsed, "currency");
  const hasValue = Object.hasOwn(parsed, "valueMinor");
  if (hasCurrency !== hasValue) invalid();
  if (hasCurrency) {
    output.currency = string(parsed.currency, 3, 3, CURRENCY);
    output.valueMinor = count(parsed.valueMinor);
  }
  for (const key of [
    "paymentMethod",
    "shippingMethod",
    "campaign",
    "source",
    "medium",
  ] as const) {
    if (Object.hasOwn(parsed, key)) {
      output[key] = parseAnalyticsSafeDimension(parsed[key]);
    }
  }
  if (Object.hasOwn(parsed, "safeErrorCode"))
    output.safeErrorCode = string(parsed.safeErrorCode, 1, 64, SAFE_CODE);
  return Object.freeze(output) as unknown as CommerceAnalyticsEvent;
}

export function parseBrowserCommerceEvent(
  value: unknown,
): BrowserCommerceEvent {
  return commerceEvent(
    value,
    BROWSER_COMMERCE_EVENT_NAMES,
  ) as BrowserCommerceEvent;
}

export function parseServerCommerceEvent(value: unknown): ServerCommerceEvent {
  return commerceEvent(
    value,
    SERVER_COMMERCE_EVENT_NAMES,
  ) as ServerCommerceEvent;
}

export function sanitizeAnalyticsSearchTerm(value: unknown): string {
  if (typeof value !== "string" || CONTROL.test(value)) return "redacted";
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (
    normalized.length < 1 ||
    normalized.length > 64 ||
    !SEARCH_SAFE.test(normalized) ||
    EMAIL_LIKE.test(normalized) ||
    URL_LIKE.test(normalized) ||
    PHONE_LIKE.test(normalized) ||
    CARD_LIKE.test(normalized) ||
    TOKEN_LIKE.test(normalized)
  )
    return "redacted";
  return normalized;
}

export function parseCommerceAnalyticsSettings(
  value: unknown,
): Readonly<CommerceAnalyticsSettings> {
  const rawSettings = exact(value, [
    "candidateInactivityMinutes",
    "abandonedInactivityHours",
    "recoveryLinkHours",
    "automaticRecoveryEnabled",
    "maximumMessageAttempts",
    "minimumMessageIntervalHours",
    "trackingPolicy",
    "version",
  ]);
  const candidateInactivityMinutes = count(
      rawSettings.candidateInactivityMinutes,
    ),
    abandonedInactivityHours = count(rawSettings.abandonedInactivityHours),
    recoveryLinkHours = count(rawSettings.recoveryLinkHours),
    maximumMessageAttempts = count(rawSettings.maximumMessageAttempts),
    minimumMessageIntervalHours = count(
      rawSettings.minimumMessageIntervalHours,
    ),
    version = positiveVersion(rawSettings.version);
  if (
    candidateInactivityMinutes < 15 ||
    candidateInactivityMinutes > 360 ||
    abandonedInactivityHours < 1 ||
    abandonedInactivityHours > 168 ||
    abandonedInactivityHours * 60 <= candidateInactivityMinutes ||
    recoveryLinkHours < 1 ||
    recoveryLinkHours > 168 ||
    maximumMessageAttempts < 1 ||
    maximumMessageAttempts > 3 ||
    minimumMessageIntervalHours < 6 ||
    minimumMessageIntervalHours > 168 ||
    typeof rawSettings.automaticRecoveryEnabled !== "boolean" ||
    (rawSettings.trackingPolicy !== "disabled" &&
      rawSettings.trackingPolicy !== "anonymous_commerce")
  )
    invalid();
  return Object.freeze({
    candidateInactivityMinutes,
    abandonedInactivityHours,
    recoveryLinkHours,
    automaticRecoveryEnabled: rawSettings.automaticRecoveryEnabled,
    maximumMessageAttempts,
    minimumMessageIntervalHours,
    trackingPolicy: rawSettings.trackingPolicy,
    version,
  });
}

export function parseCommerceAnalyticsSnapshot(
  value: unknown,
): CommerceAnalyticsSnapshot {
  const parsed = exact(
    value,
    [
      "schemaVersion",
      "rangeStart",
      "rangeEnd",
      "currencies",
      "attribution",
      "products",
      "productPage",
      "cartPage",
      "worker",
    ],
    ["series", "carts"],
  );
  if (parsed.schemaVersion !== 1) invalid();
  const rangeStart = timestamp(parsed.rangeStart),
    rangeEnd = timestamp(parsed.rangeEnd);
  if (rangeStart >= rangeEnd) invalid();
  const currencies = Object.freeze(
    denseArray(parsed.currencies, 32).map(
      (entry): Readonly<CommerceAnalyticsCurrencyBucket> => {
        const row = exact(entry, [
          "currency",
          "activeCarts",
          "candidateCarts",
          "eligibleCarts",
          "checkoutStarts",
          "eligibleCheckoutStarts",
          "checkoutAbandoned",
          "paymentFailures",
          "paidOrders",
          "grossRevenueMinor",
          "refundedMinor",
          "abandonedCarts",
          "abandonedValueMinor",
          "recoveredCarts",
          "recoveredGrossMinor",
          "recoveredRefundedMinor",
          "recoveredNetMinor",
        ]);
        const gross = count(row.recoveredGrossMinor),
          refunded = count(row.recoveredRefundedMinor),
          net = count(row.recoveredNetMinor);
        if (refunded > gross || net !== gross - refunded) invalid();
        return Object.freeze({
          currency: string(row.currency, 3, 3, CURRENCY),
          paidOrders: count(row.paidOrders),
          activeCarts: count(row.activeCarts),
          candidateCarts: count(row.candidateCarts),
          eligibleCarts: count(row.eligibleCarts),
          checkoutStarts: count(row.checkoutStarts),
          eligibleCheckoutStarts: count(row.eligibleCheckoutStarts),
          checkoutAbandoned: count(row.checkoutAbandoned),
          paymentFailures: count(row.paymentFailures),
          grossRevenueMinor: count(row.grossRevenueMinor),
          refundedMinor: count(row.refundedMinor),
          abandonedCarts: count(row.abandonedCarts),
          abandonedValueMinor: count(row.abandonedValueMinor),
          recoveredCarts: count(row.recoveredCarts),
          recoveredGrossMinor: gross,
          recoveredRefundedMinor: refunded,
          recoveredNetMinor: net,
        });
      },
    ),
  );
  if (
    new Set(currencies.map(({ currency }) => currency)).size !==
    currencies.length
  )
    invalid();
  const attribution = Object.freeze(
    denseArray(parsed.attribution, 200).map((entry) => {
      const row = exact(
        entry,
        [
          "source",
          "medium",
          "campaign",
          "currency",
          "paidOrders",
          "grossRevenueMinor",
          "abandonedCarts",
          "recoveredRevenueMinor",
        ],
        ["touch"],
      );
      const touch = row.touch ?? "last";
      if (touch !== "first" && touch !== "last") invalid();
      return Object.freeze({
        touch,
        source: string(row.source, 1, 128),
        medium: string(row.medium, 1, 128),
        campaign: nullable(row.campaign, (candidate) =>
          string(candidate, 1, 128),
        ),
        currency: string(row.currency, 3, 3, CURRENCY),
        paidOrders: count(row.paidOrders),
        grossRevenueMinor: count(row.grossRevenueMinor),
        abandonedCarts: count(row.abandonedCarts),
        recoveredRevenueMinor: count(row.recoveredRevenueMinor),
      });
    }),
  );
  const products = Object.freeze(
    denseArray(parsed.products, 5000).map((entry) => {
      const row = exact(
        entry,
        ["productId", "title", "currency", "quantity", "revenueMinor"],
        [
          "categoryId",
          "categoryName",
          "brandId",
          "brandName",
          "checkoutStarts",
          "paidOrders",
          "abandonedAppearances",
          "recoveredRevenueMinor",
        ],
      );
      return Object.freeze({
        productId: string(row.productId, 36, 36, UUID),
        title: string(row.title, 1, 200),
        currency: string(row.currency, 3, 3, CURRENCY),
        categoryId: nullable(row.categoryId ?? null, (candidate) =>
          string(candidate, 36, 36, UUID),
        ),
        categoryName: nullable(row.categoryName ?? null, (candidate) =>
          string(candidate, 1, 200),
        ),
        brandId: nullable(row.brandId ?? null, (candidate) =>
          string(candidate, 36, 36, UUID),
        ),
        brandName: nullable(row.brandName ?? null, (candidate) =>
          string(candidate, 1, 200),
        ),
        checkoutStarts: count(row.checkoutStarts ?? 0),
        paidOrders: count(row.paidOrders ?? 0),
        quantity: count(row.quantity),
        revenueMinor: count(row.revenueMinor),
        abandonedAppearances: count(row.abandonedAppearances ?? 0),
        recoveredRevenueMinor: count(row.recoveredRevenueMinor ?? 0),
      });
    }),
  );
  const rawProductPage = exact(parsed.productPage, [
      "page",
      "pageSize",
      "totalItems",
      "totalPages",
    ]),
    productPage = Object.freeze({
      page: count(rawProductPage.page),
      pageSize: count(rawProductPage.pageSize) as 100,
      totalItems: count(rawProductPage.totalItems),
      totalPages: count(rawProductPage.totalPages),
    });
  if (
    productPage.page < 1 ||
    productPage.pageSize !== 100 ||
    productPage.totalPages !==
      Math.ceil(productPage.totalItems / productPage.pageSize) ||
    products.length > productPage.pageSize
  )
    invalid();
  const rawCartPage = exact(parsed.cartPage, [
      "page",
      "pageSize",
      "totalItems",
      "totalPages",
    ]),
    cartPage = Object.freeze({
      page: count(rawCartPage.page),
      pageSize: count(rawCartPage.pageSize) as 100,
      totalItems: count(rawCartPage.totalItems),
      totalPages: count(rawCartPage.totalPages),
    });
  if (
    cartPage.page < 1 ||
    cartPage.pageSize !== 100 ||
    cartPage.totalPages !== Math.ceil(cartPage.totalItems / cartPage.pageSize)
  )
    invalid();
  const series = Object.freeze(
    denseArray(parsed.series ?? [], 4000).map(
      (entry): Readonly<CommerceAnalyticsSeriesPoint> => {
        const row = exact(entry, [
          "startsAt",
          "currency",
          "paidOrders",
          "grossRevenueMinor",
          "abandonedCarts",
          "recoveredCarts",
        ]);
        return Object.freeze({
          startsAt: timestamp(row.startsAt),
          currency: string(row.currency, 3, 3, CURRENCY),
          paidOrders: count(row.paidOrders),
          grossRevenueMinor: count(row.grossRevenueMinor),
          abandonedCarts: count(row.abandonedCarts),
          recoveredCarts: count(row.recoveredCarts),
        });
      },
    ),
  );
  const carts = Object.freeze(
    denseArray(parsed.carts ?? [], 100).map(
      (entry): Readonly<CommerceAnalyticsCartRow> => {
        const row = exact(entry, [
          "id",
          "customerLabel",
          "productSummary",
          "subtotalMinor",
          "discountMinor",
          "shippingMinor",
          "totalMinor",
          "currency",
          "lastActivityAt",
          "abandonedAt",
          "source",
          "campaign",
          "device",
          "lifecycle",
          "contactable",
          "contacted",
        ]);
        const lifecycle = String(row.lifecycle),
          device = String(row.device);
        if (
          ![
            "active",
            "candidate",
            "abandoned",
            "resumed",
            "converted_pending_payment",
            "recovered",
            "expired",
          ].includes(lifecycle) ||
          !["desktop", "mobile", "tablet", "unknown"].includes(device) ||
          typeof row.contactable !== "boolean" ||
          typeof row.contacted !== "boolean"
        )
          invalid();
        return Object.freeze({
          id: string(row.id, 36, 36, UUID),
          customerLabel: string(row.customerLabel, 1, 200),
          productSummary: string(row.productSummary, 1, 240),
          subtotalMinor: count(row.subtotalMinor),
          discountMinor: count(row.discountMinor),
          shippingMinor: count(row.shippingMinor),
          totalMinor: count(row.totalMinor),
          currency: string(row.currency, 3, 3, CURRENCY),
          lastActivityAt: timestamp(row.lastActivityAt),
          abandonedAt: nullable(row.abandonedAt, timestamp),
          source: string(row.source, 1, 128),
          campaign: nullable(row.campaign, (candidate) =>
            string(candidate, 1, 128),
          ),
          device: device as CommerceAnalyticsCartRow["device"],
          lifecycle: lifecycle as CommerceAnalyticsCartRow["lifecycle"],
          contactable: row.contactable,
          contacted: row.contacted,
        });
      },
    ),
  );
  const status = exact(parsed.worker, [
    "pending",
    "claimed",
    "retry",
    "deadLetter",
    "oldestPendingSeconds",
    "lastSuccessfulDelivery",
    "deliveryLatencyMilliseconds",
  ]);
  const worker = Object.freeze({
    pending: count(status.pending),
    claimed: count(status.claimed),
    retry: count(status.retry),
    deadLetter: count(status.deadLetter),
    oldestPendingSeconds: count(status.oldestPendingSeconds),
    lastSuccessfulDelivery: nullable(status.lastSuccessfulDelivery, timestamp),
    deliveryLatencyMilliseconds: count(status.deliveryLatencyMilliseconds),
  });
  return Object.freeze({
    schemaVersion: 1,
    rangeStart,
    rangeEnd,
    currencies,
    attribution,
    products,
    productPage,
    series,
    carts,
    cartPage,
    worker,
  });
}
