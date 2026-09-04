import { createHash } from "node:crypto";
import {
  parseAnalyticsMetricResult,
  parseAnalyticsSafeDimension,
  parseAnalyticsSummary,
  type AnalyticsRange,
  type TenantContext,
} from "@celebix/saas-contracts";
import {
  ANALYTICS_ERROR_CODES,
  AnalyticsRepositoryError,
} from "@celebix/saas-data";

import type { ServerAnalyticsRuntime } from "../server-analytics/runtime.ts";
import { readAnalyticsProviderCache } from "../server-analytics/provider-cache.ts";
import { authorizeAnalyticsRequest } from "./request-authority.ts";

const VIEWS = [
  "overview",
  "funnel",
  "abandoned-carts",
  "acquisition",
  "products",
  "status",
] as const;
const OVERVIEW_EVENTS = Object.freeze([
  "product_view",
  "add_to_cart",
  "begin_checkout",
]);
const FUNNEL_EVENTS = Object.freeze([
  "product_view",
  "add_to_cart",
  "view_cart",
  "begin_checkout",
  "payment_method_selected",
  "purchase",
]);
type View = (typeof VIEWS)[number];
type Dependencies = Readonly<{
  resolveRuntime(): Promise<ServerAnalyticsRuntime | null>;
  now(): Date;
  requestId(): string;
}>;
type Filters = Readonly<{
  device?: string;
  source?: string;
  campaign?: string;
  productId?: string;
  categoryId?: string;
  currency?: string;
  touch?: "first" | "last";
  search?: string;
  lifecycle?: string;
  contact?: "contactable" | "unavailable";
  brandId?: string;
  minimumValueMinor?: number;
  maximumValueMinor?: number;
  productPage?: number;
  cartPage?: number;
}>;
type Range = Readonly<{
  start: Date;
  end: Date;
  timezone: string;
  umamiRange: AnalyticsRange | null;
  label: string;
  compare: boolean;
  filters: Filters;
}>;
const DAY = 86_400_000;

type CountRows = Readonly<{
  items: readonly Readonly<{ label: string; value: number }>[];
}>;
function cacheRecord(value: unknown, keys: readonly string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("analytics_cache_invalid");
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw Error("analytics_cache_invalid");
  const descriptors = Object.getOwnPropertyDescriptors(value),
    names = Object.keys(descriptors);
  if (
    names.sort().join("\n") !== [...keys].sort().join("\n") ||
    names.some((key) => !("value" in descriptors[key]!))
  )
    throw Error("analytics_cache_invalid");
  return Object.fromEntries(
    names.map((key) => [key, descriptors[key]!.value]),
  ) as Record<string, unknown>;
}
function parseCountRows(
  value: unknown,
  allowedLabels?: ReadonlySet<string>,
): CountRows {
  const root = cacheRecord(value, ["items"]);
  if (!Array.isArray(root.items) || root.items.length > 10_000)
    throw Error("analytics_cache_invalid");
  const seen = new Set<string>();
  const items = root.items.map((entry) => {
    const row = cacheRecord(entry, ["label", "value"]);
    if (
      typeof row.label !== "string" ||
      row.label.length < 1 ||
      row.label.length > 128 ||
      (allowedLabels && !allowedLabels.has(row.label)) ||
      seen.has(row.label) ||
      !Number.isSafeInteger(row.value) ||
      Number(row.value) < 0
    )
      throw Error("analytics_cache_invalid");
    seen.add(row.label);
    return Object.freeze({ label: row.label, value: Number(row.value) });
  });
  return Object.freeze({ items: Object.freeze(items) });
}
function parseAcquisitionRows(value: unknown) {
  const root = cacheRecord(value, ["items"]);
  if (!Array.isArray(root.items) || root.items.length > 1_000)
    throw Error("analytics_cache_invalid");
  return Object.freeze({
    items: Object.freeze(
      root.items.map((entry) => {
        const row = cacheRecord(entry, [
          "source",
          "medium",
          "campaign",
          "visitors",
          "pageviews",
          "productViews",
          "addsToCart",
          "checkouts",
        ]);
        const source = parseAnalyticsSafeDimension(row.source),
          medium = parseAnalyticsSafeDimension(row.medium),
          campaign =
            row.campaign === null
              ? null
              : parseAnalyticsSafeDimension(row.campaign);
        for (const key of [
          "visitors",
          "pageviews",
          "productViews",
          "addsToCart",
          "checkouts",
        ])
          if (!Number.isSafeInteger(row[key]) || Number(row[key]) < 0)
            throw Error("analytics_cache_invalid");
        return Object.freeze({
          source,
          medium,
          campaign,
          visitors: Number(row.visitors),
          pageviews: Number(row.pageviews),
          productViews: Number(row.productViews),
          addsToCart: Number(row.addsToCart),
          checkouts: Number(row.checkouts),
        });
      }),
    ),
  });
}

function cachedProvider<T>(
  context: Readonly<{
    runtime: ServerAnalyticsRuntime;
    tenantContext: TenantContext;
    range: Range;
  }>,
  websiteId: string,
  scope: string,
  ttlSeconds: 30 | 60,
  filters: Readonly<Record<string, unknown>>,
  parser: (value: unknown) => T,
  load: () => Promise<T>,
) {
  return readAnalyticsProviderCache({
    cache: context.runtime.sharedCache ?? null,
    storeId: context.tenantContext.store.id,
    websiteId,
    scope,
    ttlSeconds,
    start: context.range.start,
    end: context.range.end,
    timezone: context.range.timezone,
    currency: context.range.filters.currency ?? null,
    filters,
    parser,
    load,
  });
}

function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}
function zonedMidnight(date: string, timezone: string): Date {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const wall = Date.UTC(year, month - 1, day);
  let instant = wall;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instant));
    const value = Object.fromEntries(
      parts.map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(value.year),
      Number(value.month) - 1,
      Number(value.day),
      Number(value.hour),
      Number(value.minute),
      Number(value.second),
    );
    instant -= represented - wall;
  }
  return new Date(instant);
}

function json(value: unknown, status = 200, headers?: HeadersInit) {
  const output = new Headers(headers);
  output.set("cache-control", "no-store");
  output.set("x-content-type-options", "nosniff");
  return Response.json(value, { status, headers: output });
}
function error(code: string, status: number, headers?: HeadersInit) {
  return json({ code }, status, headers);
}
function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}
function repositoryError(value: unknown): Response {
  if (
    !(value instanceof AnalyticsRepositoryError) ||
    !ANALYTICS_ERROR_CODES.includes(value.code)
  )
    return error("unavailable", 503);
  const status =
    value.code === "invalid_input"
      ? 400
      : value.code === "unauthenticated"
        ? 401
        : [
              "membership_denied",
              "store_inactive",
              "feature_not_enabled",
            ].includes(value.code)
          ? 403
          : value.code === "durable_authority_invalid"
            ? 409
            : 503;
  return error(value.code, status);
}

function range(
  request: Request,
  view: View,
  now: Date,
  defaultTimezone: string,
): Range | null {
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (
    url.pathname !== `/api/analytics/${view}` ||
    url.hash ||
    url.username ||
    url.password ||
    url.search.length > 1024
  )
    return null;
  const entries = [...url.searchParams.entries()],
    dimensions: Readonly<Record<View, readonly string[]>> = Object.freeze({
      overview: Object.freeze(["currency"]),
      funnel: Object.freeze([
        "currency",
        "device",
        "source",
        "campaign",
        "product",
        "category",
      ]),
      "abandoned-carts": Object.freeze([
        "currency",
        "lifecycle",
        "contact",
        "minValue",
        "maxValue",
        "source",
        "campaign",
        "device",
        "search",
        "page",
      ]),
      acquisition: Object.freeze(["currency", "touch", "source", "campaign"]),
      products: Object.freeze([
        "currency",
        "search",
        "product",
        "category",
        "brand",
        "source",
        "campaign",
        "device",
        "page",
      ]),
      status: Object.freeze([]),
    }),
    allowed = new Set([
      "range",
      "compare",
      "from",
      "to",
      "timezone",
      ...dimensions[view],
    ]);
  if (
    entries.some(([key]) => !allowed.has(key)) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  )
    return null;
  const dimension = (key: string, maximum = 128) => {
    const value = url.searchParams.get(key);
    return value === null
      ? undefined
      : value.length >= 1 &&
          value.length <= maximum &&
          value === value.trim() &&
          !/[\u0000-\u001f\u007f]/.test(value)
        ? value
        : null;
  };
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const trafficDimension = (key: string) => {
    const value = dimension(key);
    if (value === undefined || value === null) return value;
    try {
      return parseAnalyticsSafeDimension(value);
    } catch {
      return null;
    }
  };
  const device = dimension("device", 32),
    source = trafficDimension("source"),
    campaign = trafficDimension("campaign"),
    productId = dimension("product", 36),
    categoryId = dimension("category", 36),
    brandId = dimension("brand", 36),
    currency = dimension("currency", 3),
    touch = dimension("touch", 5),
    search = dimension("search", 100),
    lifecycle = dimension("lifecycle", 32),
    contact = dimension("contact", 16),
    minimumRaw = dimension("minValue", 15),
    maximumRaw = dimension("maxValue", 15);
  const pageRaw = dimension("page", 6),
    selectedPage =
      pageRaw === undefined
        ? undefined
        : pageRaw !== null && /^[1-9][0-9]{0,5}$/.test(pageRaw)
          ? Number(pageRaw)
          : null;
  const amount = (value: string | undefined | null) =>
    value === undefined
      ? undefined
      : value !== null &&
          /^(0|[1-9][0-9]{0,14})$/.test(value) &&
          Number.isSafeInteger(Number(value))
        ? Number(value)
        : null;
  const minimumValueMinor = amount(minimumRaw),
    maximumValueMinor = amount(maximumRaw);
  if (
    [
      device,
      source,
      campaign,
      productId,
      categoryId,
      brandId,
      currency,
      touch,
      search,
      lifecycle,
      contact,
      minimumRaw,
      maximumRaw,
      minimumValueMinor,
      maximumValueMinor,
      selectedPage,
    ].includes(null) ||
    (productId && !uuid.test(productId)) ||
    (categoryId && !uuid.test(categoryId)) ||
    (brandId && !uuid.test(brandId)) ||
    (currency && !/^[A-Z]{3}$/.test(currency)) ||
    (device &&
      !(["desktop", "mobile", "tablet", "unknown"] as string[]).includes(
        device,
      )) ||
    (touch && !(["first", "last"] as string[]).includes(touch)) ||
    (contact &&
      !(["contactable", "unavailable"] as string[]).includes(contact)) ||
    (lifecycle &&
      !(
        [
          "active",
          "candidate",
          "abandoned",
          "resumed",
          "converted_pending_payment",
          "recovered",
          "expired",
        ] as string[]
      ).includes(lifecycle)) ||
    (typeof minimumValueMinor === "number" &&
      typeof maximumValueMinor === "number" &&
      minimumValueMinor > maximumValueMinor)
  )
    return null;
  const filters = Object.freeze({
    ...(device ? { device } : {}),
    ...(source ? { source } : {}),
    ...(campaign ? { campaign } : {}),
    ...(productId ? { productId } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(brandId ? { brandId } : {}),
    ...(currency ? { currency } : {}),
    ...(touch ? { touch: touch as "first" | "last" } : {}),
    ...(search ? { search } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    ...(contact ? { contact: contact as "contactable" | "unavailable" } : {}),
    ...(typeof minimumValueMinor === "number" ? { minimumValueMinor } : {}),
    ...(typeof maximumValueMinor === "number" ? { maximumValueMinor } : {}),
    ...(typeof selectedPage === "number" && view === "products"
      ? { productPage: selectedPage }
      : {}),
    ...(typeof selectedPage === "number" && view === "abandoned-carts"
      ? { cartPage: selectedPage }
      : {}),
  });
  const preset = url.searchParams.get("range"),
    compare = url.searchParams.get("compare");
  if (preset !== null) {
    if (
      !["today", "7d", "30d", "90d"].includes(preset) ||
      ![null, "0", "1"].includes(compare) ||
      url.searchParams.has("from") ||
      url.searchParams.has("to")
    )
      return null;
    const label = preset;
    const days = label === "today" ? 1 : Number(label.slice(0, -1));
    const timezone = url.searchParams.get("timezone") ?? defaultTimezone;
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      return null;
    }
    const today = localDate(now, timezone);
    const start =
      label === "today"
        ? zonedMidnight(today, timezone)
        : zonedMidnight(
            localDate(new Date(now.getTime() - (days - 1) * DAY), timezone),
            timezone,
          );
    return Object.freeze({
      start,
      end: new Date(now),
      timezone,
      umamiRange: label === "today" ? null : (label as AnalyticsRange),
      label,
      compare: compare === "1",
      filters,
    });
  }
  const from = url.searchParams.get("from"),
    to = url.searchParams.get("to"),
    zone = url.searchParams.get("timezone");
  if (
    !from ||
    !to ||
    url.searchParams.has("compare") ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from) ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to)
  )
    return null;
  let timezone: string;
  try {
    timezone = zone ?? defaultTimezone;
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return null;
  }
  const start = zonedMidnight(from, timezone),
    afterEnd = new Date(`${to}T12:00:00.000Z`);
  afterEnd.setUTCDate(afterEnd.getUTCDate() + 1);
  const end = new Date(
    Math.min(
      now.getTime(),
      zonedMidnight(afterEnd.toISOString().slice(0, 10), timezone).getTime(),
    ),
  );
  if (
    !Number.isFinite(start.getTime()) ||
    start >= end ||
    end > now ||
    end.getTime() - start.getTime() > 400 * DAY
  )
    return null;
  return Object.freeze({
    start,
    end,
    timezone,
    umamiRange: null,
    label: `${from}:${to}`,
    compare: false,
    filters,
  });
}

async function authorized(
  dependencies: Dependencies,
  request: Request,
  view: View,
): Promise<
  | Response
  | Readonly<{
      runtime: ServerAnalyticsRuntime;
      tenantContext: TenantContext;
      now: Date;
      range: Range;
    }>
> {
  if (request.method !== "GET")
    return error("method_not_allowed", 405, { allow: "GET" });
  let now: Date, requestId: string;
  try {
    now = dependencies.now();
    requestId = dependencies.requestId();
  } catch {
    return error("unavailable", 503);
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()))
    return error("unavailable", 503);
  if (range(request, view, now, "UTC") === null)
    return error("invalid_input", 400);
  let runtime: ServerAnalyticsRuntime | null;
  try {
    runtime = await dependencies.resolveRuntime();
  } catch {
    return error("unavailable", 503);
  }
  if (!runtime) return error("unavailable", 503);
  const decision = await authorizeAnalyticsRequest(
    runtime,
    request,
    requestId,
    now,
    false,
  );
  if (decision.kind === "response") {
    let body: unknown;
    try {
      body = await decision.response.json();
    } catch {
      body = { code: "unavailable" };
    }
    return json(body, decision.response.status);
  }
  let selected: Range | null;
  try {
    const defaultTimezone = await runtime.analytics.commerceTimezone({
      tenantContext: decision.tenantContext,
      now,
    });
    selected = range(request, view, now, defaultTimezone);
  } catch (caught) {
    return repositoryError(caught);
  }
  if (!selected) return error("invalid_input", 400);
  return Object.freeze({
    runtime,
    tenantContext: decision.tenantContext,
    now: new Date(now),
    range: selected,
  });
}

export function createCommerceAnalyticsHttpHandlers(
  dependencies: Dependencies,
) {
  if (
    !dependencies ||
    typeof dependencies.resolveRuntime !== "function" ||
    typeof dependencies.now !== "function" ||
    typeof dependencies.requestId !== "function"
  )
    throw new Error("commerce_analytics_http_handler_invalid");
  const make =
    (view: View) =>
    async (request: Request): Promise<Response> => {
      const context = await authorized(dependencies, request, view);
      if (isResponse(context)) return context;
      try {
        const commerce = await context.runtime.analytics.commerceSnapshot({
          tenantContext: context.tenantContext,
          now: context.now,
          rangeStart: context.range.start,
          rangeEnd: context.range.end,
          filters: Object.freeze({
            view,
            ...context.range.filters,
            timezone: context.range.timezone,
          }),
        });
        const selected = context.range.filters;
        const selectedTouch =
          selected.touch ?? (view === "acquisition" ? "last" : undefined);
        const project = (snapshot: typeof commerce) =>
          Object.freeze({
            ...snapshot,
            currencies: Object.freeze(
              snapshot.currencies.filter(
                (row) =>
                  !selected.currency || row.currency === selected.currency,
              ),
            ),
            series: Object.freeze(
              snapshot.series.filter(
                (row) =>
                  !selected.currency || row.currency === selected.currency,
              ),
            ),
            products: snapshot.products,
            carts: snapshot.carts,
            attribution: Object.freeze(
              snapshot.attribution.filter(
                (row) =>
                  (!selected.currency || row.currency === selected.currency) &&
                  (!selected.source || row.source === selected.source) &&
                  (!selected.campaign || row.campaign === selected.campaign) &&
                  (!selectedTouch || row.touch === selectedTouch),
              ),
            ),
          });
        const projectedCommerce = project(commerce);
        const duration =
          context.range.end.getTime() - context.range.start.getTime();
        const comparisonCommerce = context.range.compare
          ? project(
              await context.runtime.analytics.commerceSnapshot({
                tenantContext: context.tenantContext,
                now: context.now,
                rangeStart: new Date(context.range.start.getTime() - duration),
                rangeEnd: new Date(context.range.start),
                filters: Object.freeze({
                  view,
                  ...context.range.filters,
                  timezone: context.range.timezone,
                }),
              }),
            )
          : null;
        let traffic: unknown = null,
          comparisonTraffic: unknown = null,
          providerAvailable: boolean | null = null,
          degraded = false;
        const workerDegraded =
          commerce.worker.deadLetter > 0 ||
          commerce.worker.retry > 0 ||
          commerce.worker.oldestPendingSeconds > 300;
        const umamiFilters = Object.freeze({
          ...(context.range.filters.device
            ? { device: context.range.filters.device }
            : {}),
          ...(context.range.filters.source
            ? { source: context.range.filters.source }
            : {}),
          ...(context.range.filters.campaign
            ? { campaign: context.range.filters.campaign }
            : {}),
          ...(context.range.filters.currency
            ? { currency: context.range.filters.currency }
            : {}),
          ...(context.range.filters.productId
            ? { productId: context.range.filters.productId }
            : {}),
          ...(context.range.filters.categoryId
            ? { categoryId: context.range.filters.categoryId }
            : {}),
        });
        if (view === "overview") {
          if (
            !context.runtime.providerConfigured ||
            context.range.filters.currency
          ) {
            degraded = true;
            if (context.range.filters.currency) providerAvailable = false;
          } else
            try {
              const authority =
                await context.runtime.analytics.getConnectionAuthority({
                  tenantContext: context.tenantContext,
                  now: context.now,
                });
              const [summary, events, path, referrer, device, country] =
                await Promise.all([
                  cachedProvider(
                    context,
                    authority.websiteId,
                    "overview-summary",
                    30,
                    umamiFilters,
                    parseAnalyticsSummary,
                    () =>
                      context.runtime.umami.summary({
                        websiteId: authority.websiteId,
                        range: context.range.umamiRange ?? "7d",
                        timezone: context.range.timezone,
                        now: context.now,
                        start: context.range.start,
                        end: context.range.end,
                      }),
                  ),
                  cachedProvider(
                    context,
                    authority.websiteId,
                    "overview-events",
                    30,
                    umamiFilters,
                    (value) => parseCountRows(value, new Set(OVERVIEW_EVENTS)),
                    () =>
                      context.runtime.umami.independentEventSessions({
                        websiteId: authority.websiteId,
                        start: context.range.start,
                        end: context.range.end,
                        eventNames: OVERVIEW_EVENTS,
                        filters: umamiFilters,
                      }),
                  ),
                  ...(["path", "referrer", "device", "country"] as const).map(
                    (type) =>
                      cachedProvider(
                        context,
                        authority.websiteId,
                        `overview-${type}`,
                        30,
                        umamiFilters,
                        parseAnalyticsMetricResult,
                        () =>
                          context.runtime.umami.metrics({
                            websiteId: authority.websiteId,
                            range: context.range.umamiRange ?? "7d",
                            timezone: context.range.timezone,
                            type,
                            now: context.now,
                            start: context.range.start,
                            end: context.range.end,
                          }),
                      ),
                  ),
                ]);
              traffic = Object.freeze({
                summary,
                events,
                sources: referrer,
                metrics: Object.freeze({ path, referrer, device, country }),
              });
              if (context.range.compare) {
                const previousEnd = new Date(context.range.start),
                  previousStart = new Date(
                    context.range.start.getTime() - duration,
                  );
                const [previousSummary, previousEvents] = await Promise.all([
                  readAnalyticsProviderCache({
                    cache: context.runtime.sharedCache ?? null,
                    storeId: context.tenantContext.store.id,
                    websiteId: authority.websiteId,
                    scope: "overview-summary",
                    ttlSeconds: 30,
                    start: previousStart,
                    end: previousEnd,
                    timezone: context.range.timezone,
                    currency: context.range.filters.currency ?? null,
                    filters: umamiFilters,
                    parser: parseAnalyticsSummary,
                    load: () =>
                      context.runtime.umami.summary({
                        websiteId: authority.websiteId,
                        range: context.range.umamiRange ?? "7d",
                        timezone: context.range.timezone,
                        now: context.now,
                        start: previousStart,
                        end: previousEnd,
                      }),
                  }),
                  readAnalyticsProviderCache({
                    cache: context.runtime.sharedCache ?? null,
                    storeId: context.tenantContext.store.id,
                    websiteId: authority.websiteId,
                    scope: "overview-events",
                    ttlSeconds: 30,
                    start: previousStart,
                    end: previousEnd,
                    timezone: context.range.timezone,
                    currency: context.range.filters.currency ?? null,
                    filters: umamiFilters,
                    parser: (value) =>
                      parseCountRows(value, new Set(OVERVIEW_EVENTS)),
                    load: () =>
                      context.runtime.umami.independentEventSessions({
                        websiteId: authority.websiteId,
                        start: previousStart,
                        end: previousEnd,
                        eventNames: OVERVIEW_EVENTS,
                        filters: umamiFilters,
                      }),
                  }),
                ]);
                comparisonTraffic = Object.freeze({
                  summary: previousSummary,
                  events: previousEvents,
                });
              }
              providerAvailable = true;
            } catch {
              degraded = true;
              providerAvailable = false;
            }
        } else if (view === "funnel") {
          if (!context.runtime.providerConfigured) degraded = true;
          else
            try {
              const authority =
                await context.runtime.analytics.getConnectionAuthority({
                  tenantContext: context.tenantContext,
                  now: context.now,
                });
              const verifiedPurchases =
                await context.runtime.analytics.paidFunnelSessions({
                  tenantContext: context.tenantContext,
                  now: context.now,
                  rangeStart: context.range.start,
                  rangeEnd: context.range.end,
                  filters: context.range.filters,
                });
              const evidenceDigest = createHash("sha256")
                .update(JSON.stringify(verifiedPurchases))
                .digest("hex");
              const events = await cachedProvider(
                context,
                authority.websiteId,
                "funnel-events",
                30,
                Object.freeze({ ...umamiFilters, evidenceDigest }),
                (value) => parseCountRows(value, new Set(FUNNEL_EVENTS)),
                () =>
                  context.runtime.umami.eventSessions({
                    websiteId: authority.websiteId,
                    start: context.range.start,
                    end: context.range.end,
                    eventNames: FUNNEL_EVENTS,
                    verifiedPurchases,
                    filters: umamiFilters,
                  }),
              );
              traffic = Object.freeze({ events });
              providerAvailable = true;
            } catch {
              degraded = true;
              providerAvailable = false;
            }
        } else if (view === "acquisition") {
          if (
            !context.runtime.providerConfigured ||
            context.range.filters.currency
          ) {
            degraded = true;
            if (context.range.filters.currency) providerAvailable = false;
          } else
            try {
              const authority =
                await context.runtime.analytics.getConnectionAuthority({
                  tenantContext: context.tenantContext,
                  now: context.now,
                });
              const [summary, breakdown] = await Promise.all([
                cachedProvider(
                  context,
                  authority.websiteId,
                  "acquisition-summary",
                  60,
                  umamiFilters,
                  parseAnalyticsSummary,
                  () =>
                    context.runtime.umami.summary({
                      websiteId: authority.websiteId,
                      range: context.range.umamiRange ?? "7d",
                      timezone: context.range.timezone,
                      now: context.now,
                      start: context.range.start,
                      end: context.range.end,
                    }),
                ),
                cachedProvider(
                  context,
                  authority.websiteId,
                  "acquisition-breakdown",
                  60,
                  umamiFilters,
                  parseAcquisitionRows,
                  () =>
                    context.runtime.umami.acquisitionBreakdown({
                      websiteId: authority.websiteId,
                      start: context.range.start,
                      end: context.range.end,
                      filters: Object.freeze({
                        ...(context.range.filters.device
                          ? { device: context.range.filters.device }
                          : {}),
                        ...(context.range.filters.source
                          ? { source: context.range.filters.source }
                          : {}),
                        ...(context.range.filters.campaign
                          ? { campaign: context.range.filters.campaign }
                          : {}),
                      }),
                    }),
                ),
              ]);
              traffic = Object.freeze({ summary, breakdown });
              providerAvailable = true;
            } catch {
              degraded = true;
              providerAvailable = false;
            }
        } else if (view === "products") {
          if (!context.runtime.providerConfigured) degraded = true;
          else
            try {
              const authority =
                await context.runtime.analytics.getConnectionAuthority({
                  tenantContext: context.tenantContext,
                  now: context.now,
                });
              const productFilters = Object.freeze({
                ...(context.range.filters.device
                  ? { device: context.range.filters.device }
                  : {}),
                ...(context.range.filters.source
                  ? { source: context.range.filters.source }
                  : {}),
                ...(context.range.filters.campaign
                  ? { campaign: context.range.filters.campaign }
                  : {}),
                ...(context.range.filters.currency
                  ? { currency: context.range.filters.currency }
                  : {}),
                ...(context.range.filters.categoryId
                  ? { categoryId: context.range.filters.categoryId }
                  : {}),
              });
              const [views, adds] = await Promise.all([
                ...(["product_view", "add_to_cart"] as const).map((eventName) =>
                  cachedProvider(
                    context,
                    authority.websiteId,
                    `products-${eventName.replaceAll("_", "-")}`,
                    30,
                    Object.freeze({
                      ...productFilters,
                      productIds: projectedCommerce.products.map(
                        (product) => product.productId,
                      ),
                    }),
                    (value) => parseCountRows(value),
                    () =>
                      context.runtime.umami.eventPropertyValues({
                        websiteId: authority.websiteId,
                        start: context.range.start,
                        end: context.range.end,
                        eventName,
                        propertyName: "product_id",
                        productIds: projectedCommerce.products.map(
                          (product) => product.productId,
                        ),
                        filters: productFilters,
                      }),
                  ),
                ),
              ]);
              traffic = Object.freeze({ views, adds });
              providerAvailable = true;
            } catch {
              degraded = true;
              providerAvailable = false;
            }
        } else if (view === "status") {
          if (!context.runtime.providerConfigured) {
            providerAvailable = false;
            degraded = true;
          } else
            try {
              const connection =
                await context.runtime.analytics.getConnectionAuthority({
                  tenantContext: context.tenantContext,
                  now: context.now,
                });
              const website = await context.runtime.umami.getWebsite(
                connection.websiteId,
              );
              providerAvailable =
                connection.status === "active" &&
                website?.id === connection.websiteId;
              if (!providerAvailable) degraded = true;
            } catch {
              providerAvailable = false;
              degraded = true;
            }
        }
        if (workerDegraded) degraded = true;
        const message =
          providerAvailable === false
            ? "Trafik verileri geçici olarak alınamıyor. Sipariş ve sepet verileri günceldir."
            : workerDegraded
              ? "Analytics event teslimatında gecikme var. Trafik, sipariş ve sepet verileri kullanılabilir."
              : null;
        return json(
          Object.freeze({
            schemaVersion: 1,
            view,
            range: Object.freeze({
              start: commerce.rangeStart,
              end: commerce.rangeEnd,
              timezone: context.range.timezone,
              label: context.range.label,
            }),
            filters: context.range.filters,
            status: degraded ? "degraded" : "complete",
            message,
            traffic,
            comparisonTraffic,
            commerce: projectedCommerce,
            comparisonCommerce,
            providerAvailable,
          }),
        );
      } catch (caught) {
        return repositoryError(caught);
      }
    };
  return Object.freeze(
    Object.fromEntries(VIEWS.map((view) => [view, make(view)])) as Record<
      View,
      (request: Request) => Promise<Response>
    >,
  );
}
