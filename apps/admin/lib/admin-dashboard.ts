import "server-only";

import { createServerClient } from "@/lib/supabase";
import { getOrSetCachedValue } from "@/lib/cache/memory-cache";
import { getLiveAnalyticsSnapshot } from "@/lib/live-analytics";
import type {
  DashboardBootstrapData,
  DashboardLowStockProduct,
  DashboardRecentOrder,
} from "@/lib/admin-data-types";

type ProductRow = {
  id: string;
  name: string;
  variants: Array<{
    name: string | null;
    stock: number | null;
  }> | null;
};

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

export async function getAdminDashboardBootstrapData(): Promise<DashboardBootstrapData> {
  return getOrSetCachedValue("admin:dashboard:bootstrap:v1", 15_000, async () => {
    const supabase = createServerClient();

    const [productsResponse, recentOrdersResponse, totalOrdersResponse, pendingOrdersResponse, deliveredOrdersResponse, liveData] = await Promise.all([
      supabase
        .from("products")
        .select("id,name,variants:product_variants(name,stock)")
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id,order_number,shipping_address,total,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
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
      getLiveAnalyticsSnapshot(),
    ]);

    if (productsResponse.error) {
      throw productsResponse.error;
    }

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

    const products = (productsResponse.data || []) as ProductRow[];
    const recentOrdersRows = (recentOrdersResponse.data || []) as OrderRow[];
    const deliveredOrders = (deliveredOrdersResponse.data || []) as OrderTotalRow[];

    const allLowStockProducts = products
      .filter((product) => product.variants?.some((variant) => Number(variant.stock || 0) < 10))
      .map<DashboardLowStockProduct>((product) => ({
        id: product.id,
        name: product.name,
        variants: (product.variants || []).map((variant) => ({
          name: variant.name || "Varsayilan",
          stock: Number(variant.stock || 0),
        })),
      }));

    const recentOrders = recentOrdersRows.map<DashboardRecentOrder>((order) => ({
      id: order.id,
      orderNumber: order.order_number || "---",
      shippingAddress: {
        firstName:
          order.shipping_address?.firstName ||
          order.shipping_address?.first_name ||
          "Musteri",
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
        totalProducts: products.length,
        totalOrders: Number(totalOrdersResponse.count || 0),
        pendingOrders: Number(pendingOrdersResponse.count || 0),
        totalRevenue,
        lowStockProducts: allLowStockProducts.length,
      },
      recentOrders,
      lowStockProducts: allLowStockProducts.slice(0, 5),
      liveData,
    };
  });
}
