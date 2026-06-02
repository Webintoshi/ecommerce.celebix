import "server-only";

import type { AdminProductReviewRecord } from "@/lib/product-reviews";
import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { getLiveAnalyticsSnapshot } from "@/lib/live-analytics";
import { getDashboardAnalyticsPayload } from "@/lib/dashboard-analytics";
import { listAdminProductReviews } from "@/lib/product-reviews";
import { isAdminProductReviewsDisabled } from "@/lib/light-postgres-readiness";
import type {
  DashboardBootstrapData,
  DashboardCustomerActivity,
  DashboardLowStockProduct,
  DashboardOverview,
  DashboardRecentOrder,
  LiveAnalyticsSnapshot,
} from "@/lib/admin-data-types";
import type { TimeRange } from "@/types/analytics";

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_id: string | null;
  shipping_address: {
    firstName?: string;
    first_name?: string;
    lastName?: string;
    last_name?: string;
  } | null;
  total: number | string | null;
  created_at: string;
  status: string | null;
};

type OrderTotalRow = {
  total: number | string | null;
};

type CountRow = {
  product_id: string | null;
};

type LowStockVariantRow = {
  product_id: string | null;
  name: string | null;
  sku: string | null;
  stock: number | null;
  product:
    | {
        id: string;
        name: string;
        images: unknown;
      }
    | Array<{
        id: string;
        name: string;
        images: unknown;
      }>
    | null;
};

type CustomerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
};

type DashboardBootstrapOptions = {
  includeLiveData?: boolean;
  timeRange?: TimeRange;
};

function getRecentReviewsPromise(
  supabase: ReturnType<typeof createServerClient>,
): Promise<AdminProductReviewRecord[]> {
  if (isAdminProductReviewsDisabled()) {
    return Promise.resolve([]);
  }

  return listAdminProductReviews(supabase, { limit: 5 });
}

function getEmptyLiveAnalyticsSnapshot(): LiveAnalyticsSnapshot {
  return {
    liveVisitors: 0,
    devices: {
      mobile: 0,
      desktop: 0,
      tablet: 0,
    },
    topPages: [],
    topReferrers: [],
    topCountries: [],
    topBrowsers: [],
    abandonedCarts: {
      count: 0,
      total: 0,
    },
    today: {
      addToCart: 0,
      purchases: 0,
    },
    recentEvents: [],
  };
}

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}

function normalizeImages(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function normalizeJoinedProduct(
  value: LowStockVariantRow["product"],
): { id: string; name: string; images: string[] } | null {
  const joined = Array.isArray(value) ? value[0] : value;
  if (!joined?.id) {
    return null;
  }

  return {
    id: joined.id,
    name: joined.name,
    images: normalizeImages(joined.images),
  };
}

function resolveCustomerName(order: Pick<OrderRow, "shipping_address">) {
  const firstName =
    order.shipping_address?.firstName ||
    order.shipping_address?.first_name ||
    "Müşteri";
  const lastName = order.shipping_address?.lastName || order.shipping_address?.last_name || "";

  return `${firstName} ${lastName}`.trim();
}

function buildOverviewCards(
  timeRange: TimeRange,
  analytics: Awaited<ReturnType<typeof getDashboardAnalyticsPayload>>,
  pendingOrders: number,
): DashboardOverview {
  const orderLabel =
    timeRange === "today"
      ? "Bugünkü Siparişler"
      : timeRange === "week"
        ? "Bu Haftaki Siparişler"
        : timeRange === "month"
          ? "Bu Aydaki Siparişler"
          : timeRange === "quarter"
            ? "Son 90 Gün Siparişleri"
            : "Bu Yıl Siparişleri";

  const revenueLabel =
    timeRange === "today"
      ? "Bugünkü Ciro"
      : timeRange === "week"
        ? "Haftalık Ciro"
        : timeRange === "month"
          ? "Aylık Ciro"
          : timeRange === "quarter"
            ? "90 Günlük Ciro"
            : "Yıllık Ciro";

  return {
    timeRange,
    cards: [
      {
        key: "orders",
        label: orderLabel,
        value: analytics.stats.orders,
        change: analytics.stats.ordersChange,
        href: "/admin/siparisler",
        format: "number",
        tone: "orange",
        trend: analytics.trendData.map((item) => item.orders),
      },
      {
        key: "revenue",
        label: revenueLabel,
        value: analytics.stats.revenue,
        change: analytics.stats.revenueChange,
        href: "/admin/analizler",
        format: "currency",
        tone: "emerald",
        trend: analytics.trendData.map((item) => item.revenue),
      },
      {
        key: "conversion",
        label: "Dönüşüm Oranı",
        value: analytics.stats.conversionRate,
        change: analytics.stats.conversionChange,
        href: "/admin/analizler",
        format: "percent",
        tone: "violet",
        trend: [],
      },
      {
        key: "pending",
        label: "Bekleyen Siparişler",
        value: pendingOrders,
        change: 0,
        href: "/admin/siparisler",
        format: "number",
        tone: "amber",
        trend: [],
      },
    ],
  };
}

function buildCustomerActivityName(customer: CustomerRow) {
  const name = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
  if (name.length > 0) {
    return name;
  }

  if (customer.email) {
    return customer.email.split("@")[0] || "Müşteri";
  }

  return "Müşteri";
}

function buildCustomerActivities(args: {
  orders: OrderRow[];
  customers: CustomerRow[];
  reviews: Awaited<ReturnType<typeof listAdminProductReviews>>;
}) {
  const orderActivities: DashboardCustomerActivity[] = args.orders.map((order) => ({
    id: `order:${order.id}`,
    type: "order",
    customerName: resolveCustomerName(order),
    summary: "Yeni bir sipariş verdi.",
    createdAt: order.created_at,
    href: `/admin/siparisler/${order.id}`,
  }));

  const customerActivities: DashboardCustomerActivity[] = args.customers.map((customer) => {
    const createdAt = new Date(customer.created_at).getTime();
    const updatedAt = new Date(customer.updated_at).getTime();
    const isUpdate = updatedAt - createdAt > 5 * 60 * 1000;

    return {
      id: `customer:${customer.id}`,
      type: "customer",
      customerName: buildCustomerActivityName(customer),
      summary: isUpdate ? "Hesabını güncelledi." : "Müşteri hesabı oluşturdu.",
      createdAt: isUpdate ? customer.updated_at : customer.created_at,
      href: `/admin/musteriler/${customer.id}`,
    };
  });

  const reviewActivities: DashboardCustomerActivity[] = args.reviews.map((review) => ({
    id: `review:${review.id}`,
    type: "review",
    customerName: review.reviewer_name || "Müşteri",
    summary: review.product?.name
      ? `${review.product.name} için yorum yaptı.`
      : "Bir ürün yorumu yaptı.",
    createdAt: review.created_at,
    href: "/admin/urunler/yorumlar",
  }));

  return [...orderActivities, ...reviewActivities, ...customerActivities]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
}

export async function getAdminDashboardBootstrapData(
  options: DashboardBootstrapOptions = {},
): Promise<DashboardBootstrapData> {
  const includeLiveData = options.includeLiveData ?? true;
  const timeRange = options.timeRange ?? "week";
  const cacheKey = includeLiveData
    ? `admin:dashboard:bootstrap:v3:${timeRange}:full`
    : `admin:dashboard:bootstrap:v3:${timeRange}:core`;
  const cacheTtlMs = includeLiveData ? 15_000 : 30_000;

  return getOrSetCachedValue(cacheKey, cacheTtlMs, async () => {
    const supabase = createServerClient();

    const [
      recentOrdersResponse,
      totalProductsResponse,
      totalOrdersResponse,
      pendingOrdersResponse,
      deliveredOrdersResponse,
      lowStockProductIdsResponse,
      lowStockVariantsResponse,
      recentCustomersResponse,
      recentActivityOrdersResponse,
      analytics,
      recentReviews,
      liveData,
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("id,order_number,customer_id,shipping_address,total,created_at,status")
        .order("created_at", { ascending: false })
        .limit(6),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("id", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("orders").select("total").eq("status", "delivered"),
      supabase
        .from("product_variants")
        .select("product_id")
        .lt("stock", 10)
        .not("product_id", "is", null),
      supabase
        .from("product_variants")
        .select("product_id,name,sku,stock,product:products(id,name,images)")
        .lt("stock", 10)
        .not("product_id", "is", null)
        .order("stock", { ascending: true })
        .limit(40),
      supabase
        .from("customers")
        .select("id,first_name,last_name,email,created_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(5),
      supabase
        .from("orders")
        .select("id,order_number,customer_id,shipping_address,created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      getDashboardAnalyticsPayload(timeRange),
      getRecentReviewsPromise(supabase),
      includeLiveData ? getLiveAnalyticsSnapshot() : Promise.resolve(getEmptyLiveAnalyticsSnapshot()),
    ]);

    if (recentOrdersResponse.error) throw recentOrdersResponse.error;
    if (totalOrdersResponse.error) throw totalOrdersResponse.error;
    if (pendingOrdersResponse.error) throw pendingOrdersResponse.error;
    if (deliveredOrdersResponse.error) throw deliveredOrdersResponse.error;
    if (totalProductsResponse.error) throw totalProductsResponse.error;
    if (lowStockProductIdsResponse.error) throw lowStockProductIdsResponse.error;
    if (lowStockVariantsResponse.error) throw lowStockVariantsResponse.error;
    if (recentCustomersResponse.error) throw recentCustomersResponse.error;
    if (recentActivityOrdersResponse.error) throw recentActivityOrdersResponse.error;

    const recentOrdersRows = (recentOrdersResponse.data || []) as OrderRow[];
    const deliveredOrders = (deliveredOrdersResponse.data || []) as OrderTotalRow[];
    const lowStockProductIds = new Set(
      ((lowStockProductIdsResponse.data || []) as CountRow[])
        .map((row) => row.product_id)
        .filter((productId): productId is string => Boolean(productId)),
    );
    const lowStockProductsMap = new Map<string, DashboardLowStockProduct>();

    ((lowStockVariantsResponse.data || []) as LowStockVariantRow[]).forEach((variant) => {
      const product = normalizeJoinedProduct(variant.product);
      if (!product) return;

      const existing = lowStockProductsMap.get(product.id) || {
        id: product.id,
        name: product.name,
        imageUrl: product.images[0] || null,
        variantName: variant.name || "Varsayılan",
        sku: variant.sku || null,
        stock: Number(variant.stock || 0),
        variants: [],
      };

      existing.variants.push({
        name: variant.name || "Varsayılan",
        stock: Number(variant.stock || 0),
      });

      const variantStock = Number(variant.stock || 0);
      const existingStock = typeof existing.stock === "number" ? existing.stock : Number.MAX_SAFE_INTEGER;
      if (variantStock < existingStock) {
        existing.variantName = variant.name || "Varsayılan";
        existing.sku = variant.sku || null;
        existing.stock = variantStock;
      }

      lowStockProductsMap.set(product.id, existing);
    });

    const recentOrders = recentOrdersRows.map<DashboardRecentOrder>((order) => ({
      id: order.id,
      orderNumber: order.order_number || "---",
      customerId: order.customer_id,
      customerName: resolveCustomerName(order),
      shippingAddress: {
        firstName:
          order.shipping_address?.firstName ||
          order.shipping_address?.first_name ||
          "Müşteri",
        lastName:
          order.shipping_address?.lastName ||
          order.shipping_address?.last_name ||
          "",
      },
      total: Number(order.total || 0),
      createdAt: order.created_at,
      status: order.status || "pending",
    }));

    const totalRevenue = deliveredOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pendingOrders = Number(pendingOrdersResponse.count || 0);

    return {
      stats: {
        totalProducts: Number(totalProductsResponse.count || 0),
        totalOrders: Number(totalOrdersResponse.count || 0),
        pendingOrders,
        totalRevenue,
        lowStockProducts: lowStockProductIds.size,
      },
      recentOrders,
      lowStockProducts: Array.from(lowStockProductsMap.values()).slice(0, 6),
      liveData,
      overview: buildOverviewCards(timeRange, analytics, pendingOrders),
      performance: {
        timeRange,
        currentLabel: analytics.labels.current,
        previousLabel: analytics.labels.previous,
        currentRevenue: analytics.stats.revenue,
        previousRevenue: analytics.comparisonTrendData.reduce((sum, item) => sum + item.revenue, 0),
        currentOrders: analytics.stats.orders,
        previousOrders: analytics.comparisonTrendData.reduce((sum, item) => sum + item.orders, 0),
        chart: analytics.trendData.map((point, index) => {
          const previous = analytics.comparisonTrendData[index];
          return {
            label: point.date,
            currentRevenue: point.revenue,
            previousRevenue: previous?.revenue || 0,
            currentOrders: point.orders,
            previousOrders: previous?.orders || 0,
          };
        }),
      },
      analysisSummary: analytics.analysisSummary,
      customerActivities: buildCustomerActivities({
        orders: (recentActivityOrdersResponse.data || []) as OrderRow[],
        customers: (recentCustomersResponse.data || []) as CustomerRow[],
        reviews: recentReviews,
      }),
    };
  });
}
