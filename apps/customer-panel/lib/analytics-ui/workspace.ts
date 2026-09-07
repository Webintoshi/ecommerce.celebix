export type AnalyticsWorkspaceTab =
  | "overview"
  | "funnel"
  | "carts"
  | "acquisition"
  | "products";

export const ANALYTICS_WORKSPACE_TABS = Object.freeze([
  Object.freeze({ value: "overview", label: "Genel Bakış" }),
  Object.freeze({ value: "funnel", label: "Dönüşüm Hunisi" }),
  Object.freeze({ value: "carts", label: "Sepet & Checkout" }),
  Object.freeze({ value: "acquisition", label: "Trafik Kaynakları" }),
  Object.freeze({ value: "products", label: "Ürünler" }),
] as const);

const SHARED_QUERY = Object.freeze([
  "range",
  "from",
  "to",
  "timezone",
  "compare",
  "currency",
]);

const TAB_QUERY: Readonly<Record<AnalyticsWorkspaceTab, readonly string[]>> =
  Object.freeze({
    overview: Object.freeze([]),
    funnel: Object.freeze([
      "device",
      "source",
      "campaign",
      "product",
      "category",
    ]),
    carts: Object.freeze([
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
    acquisition: Object.freeze(["touch", "source", "campaign"]),
    products: Object.freeze([
      "search",
      "product",
      "category",
      "brand",
      "source",
      "campaign",
      "device",
      "page",
    ]),
  });

export function analyticsQueryHref(
  serialized: string,
  patch: Readonly<Record<string, string | null>>,
): string {
  const query = new URLSearchParams(serialized);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) query.delete(key);
    else query.set(key, value);
  }
  const suffix = query.toString();
  return suffix ? `/analytics?${suffix}` : "/analytics";
}

export function analyticsRequestQuery(
  serialized: string,
  range: "today" | "7d" | "30d" | "90d" | "custom",
  initialTimezone?: string,
): string {
  const query = new URLSearchParams(serialized);
  query.delete("tab");
  if (!query.has("timezone") && initialTimezone) {
    query.set("timezone", initialTimezone);
  }
  if (range !== "custom" && !query.has("range")) query.set("range", range);
  return query.toString();
}

export function analyticsTabHref(
  serialized: string,
  next: AnalyticsWorkspaceTab,
): string {
  const query = new URLSearchParams(serialized);
  const current = query.get("tab") ?? "overview";
  const allowed = new Set([...SHARED_QUERY, ...TAB_QUERY[next]]);
  for (const key of [...query.keys()]) {
    if (key !== "tab" && !allowed.has(key)) query.delete(key);
  }
  if (current !== next) query.delete("page");
  query.set("tab", next);
  return `/analytics?${query.toString()}`;
}

export function analyticsOverviewDetailHref(
  serialized: string,
  next: Exclude<AnalyticsWorkspaceTab, "overview" | "acquisition" | "products">,
): string {
  return analyticsTabHref(serialized, next);
}

export type AnalyticsDisplayValue = Readonly<{
  state: "ready" | "unavailable";
  value: string;
}>;

type AnalyticsCommerceTrendPoint = Readonly<{
  startsAt: string;
  currency: string;
  paidOrders: number;
}>;

type AnalyticsTrafficTrendPoint = Readonly<{
  at: string;
  value: number;
}>;

function analyticsCalendarDay(value: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(value));
  const field = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}`;
}

export function analyticsCommerceTrends(
  commerce: readonly AnalyticsCommerceTrendPoint[],
  traffic: readonly AnalyticsTrafficTrendPoint[] | null,
  timezone: string,
): Readonly<{
  orders: readonly Readonly<{ label: string; value: number }>[];
  paidConversionPermille:
    | readonly Readonly<{ label: string; value: number }>[]
    | null;
}> {
  const label = (row: AnalyticsCommerceTrendPoint) =>
    `${new Date(row.startsAt).toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      timeZone: timezone,
    })} · ${row.currency}`;
  const orders = commerce.map((row) =>
    Object.freeze({ label: label(row), value: row.paidOrders }),
  );
  if (traffic === null) {
    return Object.freeze({
      orders: Object.freeze(orders),
      paidConversionPermille: null,
    });
  }
  const visitors = new Map(
    traffic.map((row) => [analyticsCalendarDay(row.at, timezone), row.value]),
  );
  const paidConversionPermille = commerce.flatMap((row) => {
    const visitorCount = visitors.get(
      analyticsCalendarDay(row.startsAt, timezone),
    );
    return visitorCount && visitorCount > 0
      ? [
          Object.freeze({
            label: label(row),
            value: Math.round((row.paidOrders / visitorCount) * 1000),
          }),
        ]
      : [];
  });
  return Object.freeze({
    orders: Object.freeze(orders),
    paidConversionPermille: Object.freeze(paidConversionPermille),
  });
}

export function analyticsBehaviorValue(value: number | null): AnalyticsDisplayValue {
  return value === null
    ? Object.freeze({ state: "unavailable", value: "—" })
    : Object.freeze({
        state: "ready",
        value: value.toLocaleString("tr-TR"),
      });
}

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export type AnalyticsOverviewMetric = Readonly<{
  key: "revenue" | "orders" | "visitors" | "average_order" | "conversion";
  label: string;
  value: string;
  state: "ready" | "unavailable";
  source: "PostgreSQL" | "Umami" | "PostgreSQL + Umami";
}>;

export function analyticsOverviewMetrics(
  commerce: Readonly<{
    currency: string;
    paidOrders: number;
    grossRevenueMinor: number;
  }>,
  visitors: number | null,
): readonly AnalyticsOverviewMetric[] {
  const average = commerce.paidOrders
    ? money(commerce.grossRevenueMinor / commerce.paidOrders, commerce.currency)
    : null;
  const conversion =
    visitors === null || visitors <= 0
      ? null
      : commerce.paidOrders / visitors;
  return Object.freeze([
    Object.freeze({
      key: "revenue",
      label: "Toplam Gelir",
      value: money(commerce.grossRevenueMinor, commerce.currency),
      state: "ready",
      source: "PostgreSQL",
    }),
    Object.freeze({
      key: "orders",
      label: "Toplam Sipariş",
      value: commerce.paidOrders.toLocaleString("tr-TR"),
      state: "ready",
      source: "PostgreSQL",
    }),
    Object.freeze({
      key: "visitors",
      label: "Ziyaretçiler",
      value: visitors === null ? "—" : visitors.toLocaleString("tr-TR"),
      state: visitors === null ? "unavailable" : "ready",
      source: "Umami",
    }),
    Object.freeze({
      key: "average_order",
      label: "Ortalama Sepet Tutarı",
      value: average ?? "—",
      state: average === null ? "unavailable" : "ready",
      source: "PostgreSQL",
    }),
    Object.freeze({
      key: "conversion",
      label: "Dönüşüm Oranı",
      value:
        conversion === null
          ? "—"
          : new Intl.NumberFormat("tr-TR", {
              style: "percent",
              maximumFractionDigits: 1,
            }).format(conversion),
      state: conversion === null ? "unavailable" : "ready",
      source: "PostgreSQL + Umami",
    }),
  ]);
}

export function analyticsTrafficOnlyMetrics(
  visitors: number | null,
): readonly AnalyticsOverviewMetric[] {
  return Object.freeze([
    Object.freeze({
      key: "visitors" as const,
      label: "Ziyaretçiler",
      value: visitors === null ? "—" : visitors.toLocaleString("tr-TR"),
      state: visitors === null ? ("unavailable" as const) : ("ready" as const),
      source: "Umami" as const,
    }),
  ]);
}

const FUNNEL_STAGES = Object.freeze([
  Object.freeze({ event: "product_view", label: "Ürün Görüntüleme" }),
  Object.freeze({ event: "add_to_cart", label: "Sepete Ekleme" }),
  Object.freeze({ event: "view_cart", label: "Sepeti Görüntüleme" }),
  Object.freeze({ event: "begin_checkout", label: "Checkout Başlatma" }),
  Object.freeze({ event: "payment_method_selected", label: "Ödeme Yöntemi" }),
  Object.freeze({ event: "purchase", label: "Satın Alma" }),
] as const);

export type AnalyticsFunnelStage = Readonly<{
  event: string;
  label: string;
  count: number | null;
  previousRate: number | null;
  totalRate: number | null;
  dropoff: number | null;
  dropoffRate: number | null;
}>;

export function analyticsFunnelStages(
  events: Readonly<Record<string, number>>,
): readonly AnalyticsFunnelStage[] {
  const first = events[FUNNEL_STAGES[0].event] ?? null;
  return Object.freeze(
    FUNNEL_STAGES.map((stage, index) => {
      const count = events[stage.event] ?? null;
      const previous = index
        ? (events[FUNNEL_STAGES[index - 1]!.event] ?? null)
        : null;
      const dropoff =
        count !== null && previous !== null
          ? Math.max(0, previous - count)
          : null;
      return Object.freeze({
        ...stage,
        count,
        previousRate:
          count !== null && previous !== null && previous > 0
            ? count / previous
            : null,
        totalRate:
          count !== null && first !== null && first > 0 ? count / first : null,
        dropoff,
        dropoffRate:
          dropoff !== null && previous !== null && previous > 0
            ? dropoff / previous
            : null,
      });
    }),
  );
}
