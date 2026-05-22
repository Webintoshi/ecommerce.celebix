import "server-only";

import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { fetchUmamiAggregate } from "@/lib/analytics/umami";
import { fetchPlausibleAggregate } from "@/lib/analytics/plausible";
import { syncAbandonedCartStatuses } from "@/lib/db/abandoned-carts";
import type { DashboardAnalysisSummary, DashboardAnalysisSummaryItem } from "@/lib/admin-data-types";
import type { AnalyticsStats, TimeRange, TrendData } from "@/types/analytics";

type OrderRow = {
  id: string;
  total: number | string | null;
  status: string | null;
  created_at: string;
};

type AbandonedCartRow = {
  total: number | string | null;
  recovered: boolean | null;
  status?: string | null;
};

type DashboardAnalyticsPayload = {
  success: true;
  stats: AnalyticsStats;
  trendData: TrendData[];
  comparisonTrendData: TrendData[];
  abandonedCartStats: {
    totalValue: number;
    recoveryRate: number;
    recoveredCount: number;
    totalCount: number;
  };
  analysisSummary: DashboardAnalysisSummary;
  traffic: {
    visitors: number;
    pageViews: number;
    addToCart: number;
    purchases: number;
  };
  labels: {
    current: string;
    previous: string;
  };
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function getDateRange(timeRange: TimeRange): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  let startDate: string;

  switch (timeRange) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      break;
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case "month":
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case "quarter":
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      break;
    case "year":
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  return { startDate, endDate };
}

function getPreviousDateRange(timeRange: TimeRange): { startDate: string; endDate: string } {
  const { startDate, endDate } = getDateRange(timeRange);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = Math.max(24 * 60 * 60 * 1000, end.getTime() - start.getTime());
  const previousEnd = new Date(start.getTime());
  const previousStart = new Date(start.getTime() - diffMs);

  return {
    startDate: previousStart.toISOString(),
    endDate: previousEnd.toISOString(),
  };
}

function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function getOrderStatusBuckets(orders: OrderRow[]) {
  const paidStatusSet = new Set(["processing", "shipped", "completed", "delivered"]);
  const paidOrders = orders.filter((order) => (order.status ? paidStatusSet.has(order.status) : false));

  return {
    paidOrders,
    paidOrdersCount: paidOrders.length,
    allOrdersCount: orders.length,
    paidRevenue: paidOrders.reduce((sum, order) => sum + toNumber(order.total), 0),
  };
}

function formatSeriesLabel(date: Date, timeRange: TimeRange): string {
  if (timeRange === "today") {
    return date.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}

function getSeriesKey(date: Date, timeRange: TimeRange): string {
  if (timeRange === "today") {
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      0,
      0,
      0,
    ).toISOString();
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
}

function buildTrendData(
  startDate: string,
  endDate: string,
  orders: OrderRow[],
  timeRange: TimeRange,
): TrendData[] {
  const paidStatusSet = new Set(["processing", "shipped", "completed", "delivered"]);
  const timeline = new Map<string, { date: Date; revenue: number; orders: number }>();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const intervalMs = timeRange === "today" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  for (
    let cursor = new Date(start.getTime());
    cursor < end;
    cursor = new Date(cursor.getTime() + intervalMs)
  ) {
    const key = getSeriesKey(cursor, timeRange);
    timeline.set(key, {
      date: new Date(cursor.getTime()),
      revenue: 0,
      orders: 0,
    });
  }

  orders.forEach((order) => {
    const date = new Date(order.created_at);
    const key = getSeriesKey(date, timeRange);
    const prev = timeline.get(key);
    if (!prev) return;
    prev.orders += 1;
    if (order.status && paidStatusSet.has(order.status)) {
      prev.revenue += toNumber(order.total);
    }
    timeline.set(key, prev);
  });

  return Array.from(timeline.values()).map((item) => ({
    date: formatSeriesLabel(item.date, timeRange),
    revenue: Math.round(item.revenue),
    orders: item.orders,
  }));
}

async function getFallbackTrafficAggregate(
  supabase: ReturnType<typeof createServerClient>,
  startDate: string,
  endDate: string,
) {
  const [{ count: pageViewsCount }, visitorCount] = await Promise.all([
    supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startDate)
      .lt("created_at", endDate),
    (async () => {
      const byCreatedAt = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startDate)
        .lt("created_at", endDate);

      if (!byCreatedAt.error) {
        return Number(byCreatedAt.count || 0);
      }

      const byActivity = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .gte("last_activity_at", startDate)
        .lt("last_activity_at", endDate);

      if (!byActivity.error) {
        return Number(byActivity.count || 0);
      }

      return 0;
    })(),
  ]);

  return {
    visitors: visitorCount,
    pageViews: Number(pageViewsCount || 0),
  };
}

async function fetchTrafficAggregate(
  supabase: ReturnType<typeof createServerClient>,
  startDate: string,
  endDate: string,
) {
  const umami = await fetchUmamiAggregate({ startDate, endDate });
  if (umami) {
    return {
      visitors: umami.visitors,
      pageViews: umami.pageviews,
    };
  }

  const plausible = await fetchPlausibleAggregate({ startDate, endDate });
  if (plausible) {
    return {
      visitors: plausible.visitors,
      pageViews: plausible.pageviews,
    };
  }

  return getFallbackTrafficAggregate(supabase, startDate, endDate);
}

async function getEventCount(
  supabase: ReturnType<typeof createServerClient>,
  eventType: string,
  startDate: string,
  endDate: string,
) {
  try {
    const { count, error } = await supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("event_type", eventType)
      .gte("created_at", startDate)
      .lt("created_at", endDate);

    if (error) {
      return 0;
    }

    return Number(count || 0);
  } catch {
    return 0;
  }
}

async function getAbandonedCartStats(
  supabase: ReturnType<typeof createServerClient>,
  startDate: string,
  endDate: string,
) {
  try {
    await syncAbandonedCartStatuses(supabase);
    let carts: AbandonedCartRow[] = [];

    const withStatus = await supabase
      .from("abandoned_carts")
      .select("total,recovered,status")
      .gte("created_at", startDate)
      .lt("created_at", endDate);

    if (!withStatus.error) {
      carts = (withStatus.data || []) as AbandonedCartRow[];
    } else {
      const fallback = await supabase
        .from("abandoned_carts")
        .select("total,recovered")
        .gte("created_at", startDate)
        .lt("created_at", endDate);

      if (!fallback.error) {
        carts = (fallback.data || []) as AbandonedCartRow[];
      }
    }

    const visibleCarts = carts.filter((cart) => {
      const status = cart.status || (cart.recovered ? "recovered" : "abandoned");
      return status !== "active" && status !== "cleared";
    });

    const totalAbandonedValue = visibleCarts.reduce((sum, cart) => sum + toNumber(cart.total), 0);
    const recoveredCarts = visibleCarts.filter(
      (cart) => cart.recovered || cart.status === "recovered",
    ).length;
    const totalCarts = visibleCarts.length;
    const recoveryRate = totalCarts > 0 ? (recoveredCarts / totalCarts) * 100 : 0;

    return {
      totalValue: Math.round(totalAbandonedValue),
      recoveryRate: Math.round(recoveryRate * 10) / 10,
      recoveredCount: recoveredCarts,
      totalCount: totalCarts,
    };
  } catch {
    return {
      totalValue: 0,
      recoveryRate: 0,
      recoveredCount: 0,
      totalCount: 0,
    };
  }
}

function buildAnalysisSummary(args: {
  visitors: number;
  previousVisitors: number;
  pageViews: number;
  previousPageViews: number;
  addToCart: number;
  previousAddToCart: number;
  purchases: number;
  previousPurchases: number;
}): DashboardAnalysisSummary {
  const items: DashboardAnalysisSummaryItem[] = [
    {
      key: "visitors",
      label: "Toplam Ziyaretçi",
      value: args.visitors,
      change: calculateChange(args.visitors, args.previousVisitors),
      tone: "violet",
    },
    {
      key: "pageViews",
      label: "Ürün Görüntüleme",
      value: args.pageViews,
      change: calculateChange(args.pageViews, args.previousPageViews),
      tone: "sky",
    },
    {
      key: "addToCart",
      label: "Sepete Eklenen",
      value: args.addToCart,
      change: calculateChange(args.addToCart, args.previousAddToCart),
      tone: "amber",
    },
    {
      key: "purchases",
      label: "Satın Alma",
      value: args.purchases,
      change: calculateChange(args.purchases, args.previousPurchases),
      tone: "orange",
    },
  ];

  return { items };
}

function getPeriodLabels(timeRange: TimeRange) {
  switch (timeRange) {
    case "today":
      return { current: "Bugün", previous: "Dün" };
    case "week":
      return { current: "Bu hafta", previous: "Geçen hafta" };
    case "month":
      return { current: "Bu ay", previous: "Geçen ay" };
    case "quarter":
      return { current: "Son 90 gün", previous: "Önceki 90 gün" };
    case "year":
      return { current: "Bu yıl", previous: "Geçen yıl" };
    default:
      return { current: "Bu dönem", previous: "Geçen dönem" };
  }
}

export async function getDashboardAnalyticsPayload(
  timeRange: TimeRange = "week",
): Promise<DashboardAnalyticsPayload> {
  const cacheKey = `analytics:dashboard:v2:${timeRange}`;

  return getOrSetCachedValue(cacheKey, 60_000, async () => {
    const supabase = createServerClient();
    const { startDate, endDate } = getDateRange(timeRange);
    const { startDate: prevStartDate, endDate: prevEndDate } = getPreviousDateRange(timeRange);

    const [
      currentOrdersRes,
      previousOrdersRes,
      totalCustomersRes,
      newCustomersRes,
      previousNewCustomersRes,
      currentTraffic,
      previousTraffic,
      currentAddToCart,
      previousAddToCart,
      abandonedCartStats,
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("id,total,status,created_at")
        .gte("created_at", startDate)
        .lt("created_at", endDate)
        .order("created_at", { ascending: true }),
      supabase
        .from("orders")
        .select("id,total,status,created_at")
        .gte("created_at", prevStartDate)
        .lt("created_at", prevEndDate),
      supabase.from("customers").select("*", { count: "exact", head: true }),
      supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startDate)
        .lt("created_at", endDate),
      supabase
        .from("customers")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevStartDate)
        .lt("created_at", prevEndDate),
      fetchTrafficAggregate(supabase, startDate, endDate),
      fetchTrafficAggregate(supabase, prevStartDate, prevEndDate),
      getEventCount(supabase, "add_to_cart", startDate, endDate),
      getEventCount(supabase, "add_to_cart", prevStartDate, prevEndDate),
      getAbandonedCartStats(supabase, startDate, endDate),
    ]);

    if (currentOrdersRes.error) throw currentOrdersRes.error;
    if (previousOrdersRes.error) throw previousOrdersRes.error;
    if (totalCustomersRes.error) throw totalCustomersRes.error;

    const currentOrders = (currentOrdersRes.data || []) as OrderRow[];
    const previousOrders = (previousOrdersRes.data || []) as OrderRow[];

    const currentOrderStats = getOrderStatusBuckets(currentOrders);
    const previousOrderStats = getOrderStatusBuckets(previousOrders);

    const avgOrderValue =
      currentOrderStats.paidOrdersCount > 0
        ? currentOrderStats.paidRevenue / currentOrderStats.paidOrdersCount
        : 0;

    const conversionRate =
      currentTraffic.visitors > 0
        ? (currentOrderStats.allOrdersCount / currentTraffic.visitors) * 100
        : 0;
    const prevConversionRate =
      previousTraffic.visitors > 0
        ? (previousOrderStats.allOrdersCount / previousTraffic.visitors) * 100
        : 0;

    const trendData = buildTrendData(startDate, endDate, currentOrders, timeRange);
    const comparisonTrendData = buildTrendData(prevStartDate, prevEndDate, previousOrders, timeRange);
    const labels = getPeriodLabels(timeRange);

    return {
      success: true,
      stats: {
        revenue: Math.round(currentOrderStats.paidRevenue),
        orders: currentOrderStats.allOrdersCount,
        customers: Number(totalCustomersRes.count || 0),
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgOrderValue: Math.round(avgOrderValue),
        revenueChange: calculateChange(currentOrderStats.paidRevenue, previousOrderStats.paidRevenue),
        ordersChange: calculateChange(currentOrderStats.allOrdersCount, previousOrderStats.allOrdersCount),
        customersChange: calculateChange(
          Number(newCustomersRes.count || 0),
          Number(previousNewCustomersRes.count || 0),
        ),
        conversionChange: calculateChange(conversionRate, prevConversionRate),
      },
      trendData,
      comparisonTrendData,
      abandonedCartStats,
      analysisSummary: buildAnalysisSummary({
        visitors: currentTraffic.visitors,
        previousVisitors: previousTraffic.visitors,
        pageViews: currentTraffic.pageViews,
        previousPageViews: previousTraffic.pageViews,
        addToCart: currentAddToCart,
        previousAddToCart,
        purchases: currentOrderStats.allOrdersCount,
        previousPurchases: previousOrderStats.allOrdersCount,
      }),
      traffic: {
        visitors: currentTraffic.visitors,
        pageViews: currentTraffic.pageViews,
        addToCart: currentAddToCart,
        purchases: currentOrderStats.allOrdersCount,
      },
      labels,
    };
  });
}
