import "server-only";

import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { getLiveAnalyticsSnapshot } from "@/lib/live-analytics";
import type {
  DashboardBootstrapData,
  DashboardLowStockProduct,
  DashboardRecentOrder,
  LiveAnalyticsSnapshot,
} from "@/lib/admin-data-types";

type OrderRow = {
  id: string;
  order_number: string | null;
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

type LowStockVariantIdRow = {
  product_id: string | null;
};

type LowStockVariantRow = {
  product_id: string | null;
  name: string | null;
  stock: number | null;
  product:
    | {
        id: string;
        name: string;
      }
    | Array<{
        id: string;
        name: string;
      }>
    | null;
};

type DashboardBootstrapOptions = {
  includeLiveData?: boolean;
};

function getEmptyLiveAnalyticsSnapshot(): LiveAnalyticsSnapshot {
  return {
    liveVisitors: 0,
    devices: {
      mobile: 0,
      desktop: 0,
      tablet: 0,
    },
    topPages: [],
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

function normalizeJoinedProduct(
  value: LowStockVariantRow["product"],
): { id: string; name: string } | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first?.id ? first : null;
  }

  return value?.id ? value : null;
}

export async function getAdminDashboardBootstrapData(
  options: DashboardBootstrapOptions = {},
): Promise<DashboardBootstrapData> {
  const includeLiveData = options.includeLiveData ?? true;
  const cacheKey = includeLiveData
    ? "admin:dashboard:bootstrap:v2:full"
    : "admin:dashboard:bootstrap:v2:core";
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
      liveData,
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("id,order_number,shipping_address,total,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("products")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("orders")
        .select("total")
        .eq("status", "delivered"),
      supabase
        .from("product_variants")
        .select("product_id")
        .lt("stock", 10)
        .not("product_id", "is", null),
      supabase
        .from("product_variants")
        .select("product_id,name,stock,product:products(id,name)")
        .lt("stock", 10)
        .not("product_id", "is", null)
        .order("stock", { ascending: true })
        .limit(40),
      includeLiveData
        ? getLiveAnalyticsSnapshot()
        : Promise.resolve(getEmptyLiveAnalyticsSnapshot()),
    ]);

    if (recentOrdersResponse.error) {
      throw recentOrdersResponse.error;
    }

    if (totalOrdersResponse.error) {
      throw totalOrdersResponse.error;
    }

    if (pendingOrdersResponse.error) {
      throw pendingOrdersResponse.error;
    }

    if (deliveredOrdersResponse.error) {
      throw deliveredOrdersResponse.error;
    }

    if (totalProductsResponse.error) {
      throw totalProductsResponse.error;
    }

    if (lowStockProductIdsResponse.error) {
      throw lowStockProductIdsResponse.error;
    }

    if (lowStockVariantsResponse.error) {
      throw lowStockVariantsResponse.error;
    }

    const recentOrdersRows = (recentOrdersResponse.data || []) as OrderRow[];
    const deliveredOrders = (deliveredOrdersResponse.data || []) as OrderTotalRow[];
    const lowStockProductIds = new Set(
      ((lowStockProductIdsResponse.data || []) as LowStockVariantIdRow[])
        .map((row) => row.product_id)
        .filter((productId): productId is string => Boolean(productId)),
    );
    const lowStockProductsMap = new Map<string, DashboardLowStockProduct>();

    ((lowStockVariantsResponse.data || []) as LowStockVariantRow[]).forEach((variant) => {
      const product = normalizeJoinedProduct(variant.product);
      if (!product) {
        return;
      }

      const existingProduct = lowStockProductsMap.get(product.id) || {
        id: product.id,
        name: product.name,
        variants: [],
      };

      existingProduct.variants.push({
        name: variant.name || "Varsayilan",
        stock: Number(variant.stock || 0),
      });
      lowStockProductsMap.set(product.id, existingProduct);
    });

    const recentOrders = recentOrdersRows.map<DashboardRecentOrder>((order) => ({
      id: order.id,
      orderNumber: order.order_number || "---",
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

    const totalRevenue = deliveredOrders.reduce(
      (sum, order) => sum + Number(order.total || 0),
      0
    );

    return {
      stats: {
        totalProducts: Number(totalProductsResponse.count || 0),
        totalOrders: Number(totalOrdersResponse.count || 0),
        pendingOrders: Number(pendingOrdersResponse.count || 0),
        totalRevenue,
        lowStockProducts: lowStockProductIds.size,
      },
      recentOrders,
      lowStockProducts: Array.from(lowStockProductsMap.values()).slice(0, 5),
      liveData,
    };
  });
}
