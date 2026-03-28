import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { fetchPlausibleAggregate } from "@/lib/analytics/plausible";

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

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function getDateRange(timeRange: string): { startDate: string; endDate: string } {
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

function getPreviousDateRange(timeRange: string): { startDate: string; endDate: string } {
  const { startDate, endDate } = getDateRange(timeRange);
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daysDiff = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - daysDiff * 24 * 60 * 60 * 1000);

  return {
    startDate: previousStart.toISOString(),
    endDate: previousEnd.toISOString(),
  };
}

function calculateChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
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

function buildTrendData(startDate: string, endDate: string, orders: OrderRow[]) {
  const paidStatusSet = new Set(["processing", "shipped", "completed", "delivered"]);
  const timeline = new Map<string, { revenue: number; orders: number }>();

  const start = new Date(startDate);
  const end = new Date(endDate);
  for (
    let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    cursor < end;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const dateKey = cursor.toISOString().split("T")[0];
    timeline.set(dateKey, { revenue: 0, orders: 0 });
  }

  orders.forEach((order) => {
    const day = new Date(order.created_at);
    const key = new Date(day.getFullYear(), day.getMonth(), day.getDate()).toISOString().split("T")[0];
    const prev = timeline.get(key);
    if (!prev) return;
    prev.orders += 1;
    if (order.status && paidStatusSet.has(order.status)) {
      prev.revenue += toNumber(order.total);
    }
    timeline.set(key, prev);
  });

  return Array.from(timeline.entries()).map(([date, item]) => ({
    date: new Date(date).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }),
    revenue: Math.round(item.revenue),
    orders: item.orders,
  }));
}

async function fetchTrafficPageViews(
  supabase: ReturnType<typeof createServerClient>,
  startDate: string,
  endDate: string
): Promise<number> {
  const plausible = await fetchPlausibleAggregate({ startDate, endDate });
  if (plausible) return plausible.pageviews;

  try {
    const { count } = await supabase
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startDate)
      .lt("created_at", endDate);
    return Number(count || 0);
  } catch {
    return 0;
  }
}

async function getAbandonedCartStats(
  supabase: ReturnType<typeof createServerClient>,
  startDate: string,
  endDate: string
) {
  try {
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

    const totalAbandonedValue = carts.reduce((sum, cart) => sum + toNumber(cart.total), 0);
    const recoveredCarts = carts.filter((cart) => cart.recovered).length;
    const totalCarts = carts.length;
    const recoveryRate = totalCarts > 0 ? (recoveredCarts / totalCarts) * 100 : 0;

    return {
      totalValue: Math.round(totalAbandonedValue),
      recoveryRate: Math.round(recoveryRate * 10) / 10,
      recoveredCount: recoveredCarts,
      totalCount: totalCarts,
    };
  } catch {
    return { totalValue: 0, recoveryRate: 0, recoveredCount: 0, totalCount: 0 };
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get("timeRange") || "week";
    const cacheKey = `analytics:dashboard:${timeRange}`;

    const payload = await getOrSetCachedValue(cacheKey, 60_000, async () => {
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
        fetchTrafficPageViews(supabase, startDate, endDate),
        fetchTrafficPageViews(supabase, prevStartDate, prevEndDate),
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
        currentTraffic > 0 ? (currentOrderStats.allOrdersCount / currentTraffic) * 100 : 0;
      const prevConversionRate =
        previousTraffic > 0 ? (previousOrderStats.allOrdersCount / previousTraffic) * 100 : 0;

      const trendData = buildTrendData(startDate, endDate, currentOrders);

      return {
        success: true,
        stats: {
          revenue: Math.round(currentOrderStats.paidRevenue),
          orders: currentOrderStats.allOrdersCount,
          customers: Number(totalCustomersRes.count || 0),
          conversionRate: Math.round(conversionRate * 100) / 100,
          avgOrderValue: Math.round(avgOrderValue),
          revenueChange: calculateChange(
            currentOrderStats.paidRevenue,
            previousOrderStats.paidRevenue
          ),
          ordersChange: calculateChange(
            currentOrderStats.allOrdersCount,
            previousOrderStats.allOrdersCount
          ),
          customersChange: calculateChange(
            Number(newCustomersRes.count || 0),
            Number(previousNewCustomersRes.count || 0)
          ),
          conversionChange: calculateChange(conversionRate, prevConversionRate),
        },
        trendData,
        abandonedCartStats,
      };
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Analytics API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Analiz verileri alınamadı.",
      },
      { status: 500 }
    );
  }
}
