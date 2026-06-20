import {
  AbandonedCart,
  AbandonedCartItem,
  AbandonedCartFilters,
  AbandonedCartSort,
} from "@/types/abandoned-cart";
import { supabase } from "@/lib/supabase";
import { extractAdminStoredAssetUrl, resolveAdminAssetUrl } from "@/lib/asset-url";
import { buildStorefrontUrl } from "@/lib/store-runtime";

export type {
  AbandonedCart,
  AbandonedCartItem,
  AbandonedCartFilters,
  AbandonedCartSort,
} from "@/types/abandoned-cart";

let cachedCarts: AbandonedCart[] = [];
let lastFetch: number = 0;
let lastNotice: AbandonedCartNotice | null = null;
const CACHE_DURATION = 60000; // 1 minute cache

export type AbandonedCartNotice = {
  code: string;
  message: string;
};

export function getLastAbandonedCartNotice() {
  return lastNotice;
}

function setNoticeFromPayload(payload: any) {
  if (payload?.code) {
    lastNotice = {
      code: String(payload.code),
      message:
        typeof payload.message === "string"
          ? payload.message
          : typeof payload.error === "string"
            ? payload.error
            : "Abandoned cart kaynagi bu runtime icin hazir degil.",
    };
    return;
  }

  lastNotice = null;
}

function normalizeAbandonedCartItemImage(source: unknown): string {
  const rawSource = typeof source === "string" ? source.trim() : "";

  if (!rawSource) {
    return "";
  }

  const extractedSource = extractAdminStoredAssetUrl(rawSource);
  const normalizedSource =
    extractedSource.startsWith("/") && !extractedSource.startsWith("/api/assets?")
      ? buildStorefrontUrl(extractedSource)
      : extractedSource;

  return resolveAdminAssetUrl(normalizedSource) || normalizedSource;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildCustomerName(cart: any) {
  const firstName = readString(cart.firstName ?? cart.first_name);
  const lastName = readString(cart.lastName ?? cart.last_name);
  const fullName = `${firstName || ""} ${lastName || ""}`.trim();
  return readString(cart.customerName) || fullName || "Anonim sepet";
}

function normalizeAbandonedCartItems(items: unknown): AbandonedCartItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.map((item: any) => ({
    ...item,
    id: item.id || `${item.productId || item.product_id}:${item.variantId || item.variant_id}`,
    productId: item.productId || item.product_id,
    productName: item.productName || item.name || "",
    productSlug: item.productSlug || item.product_slug || "",
    productImage: normalizeAbandonedCartItemImage(item.productImage || item.image || ""),
    variantId: item.variantId || item.variant_id,
    variantName: item.variantName || item.variant_name || "",
    stock: typeof item.stock === "number" ? item.stock : 0,
  }));
}

async function fetchFromAPI(
  filters?: AbandonedCartFilters,
  sort?: AbandonedCartSort,
  page = 1
): Promise<{ carts: AbandonedCart[]; total: number }> {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.search) params.set("search", filters.search);
    if (sort) params.set("sort", sort);
    params.set("page", page.toString());
    params.set("limit", "50");

    const response = await fetch(`/api/abandoned-carts?${params}`);
    const data = await response.json();
    setNoticeFromPayload(data);

    if (data.success) {
      // Map snake_case to camelCase
      const mappedCarts = (data.carts || []).map((cart: any) => {
        const items = normalizeAbandonedCartItems(cart.items);
        const customerEmail = readString(cart.customerEmail ?? cart.email);
        const customerPhone = readString(cart.customerPhone ?? cart.phone);

        return {
          ...cart,
          cartId: cart.cartId ?? cart.cart_id ?? null,
          storeSlug: cart.storeSlug ?? cart.store_slug ?? null,
          customerId: cart.customerId ?? cart.customer_id ?? null,
          sessionId: cart.sessionId ?? cart.session_id ?? null,
          firstName: cart.firstName ?? cart.first_name ?? null,
          lastName: cart.lastName ?? cart.last_name ?? null,
          customerName: buildCustomerName(cart),
          customerEmail,
          customerPhone,
          email: customerEmail,
          phone: customerPhone,
          createdAt: cart.createdAt ?? cart.created_at ?? null,
          updatedAt: cart.updatedAt ?? cart.updated_at ?? null,
          recoveredAt: cart.recoveredAt ?? cart.recovered_at ?? null,
          abandonedAt: cart.abandonedAt ?? cart.abandoned_at ?? null,
          lastActivityAt: cart.lastActivityAt ?? cart.last_activity_at ?? cart.updated_at ?? cart.created_at ?? null,
          checkoutStartedAt: cart.checkoutStartedAt ?? cart.checkout_started_at ?? null,
          orderId: cart.orderId ?? cart.order_id ?? null,
          itemCount: cart.itemCount ?? cart.item_count ?? items.length,
          isAnonymous: cart.isAnonymous ?? cart.is_anonymous ?? !Boolean(customerEmail || customerPhone),
          status: cart.status ?? (cart.recovered ? "recovered" : "abandoned"),
          items,
        };
      });
      return {
        carts: mappedCarts,
        total: data.pagination?.total || 0,
      };
    }
    setNoticeFromPayload(data);
    return { carts: [], total: 0 };
  } catch (error) {
    console.error("Error fetching from API:", error);
    lastNotice = {
      code: "abandoned_cart_fetch_failed",
      message: "Terk sepet kaynagi su an okunamiyor; son cache veya bos liste gosteriliyor.",
    };
    return { carts: cachedCarts, total: cachedCarts.length };
  }
}

export async function getAbandonedCarts(): Promise<AbandonedCart[]> {
  const now = Date.now();
  
  if (now - lastFetch < CACHE_DURATION && cachedCarts.length > 0) {
    return cachedCarts;
  }

  const { carts } = await fetchFromAPI();
  cachedCarts = carts;
  lastFetch = now;
  
  return carts;
}

export async function getFilteredAbandonedCarts(
  filters?: AbandonedCartFilters,
  sort?: AbandonedCartSort
): Promise<AbandonedCart[]> {
  const { carts } = await fetchFromAPI(filters, sort);
  return carts;
}

export async function getAbandonedCartStats(): Promise<{
  total: number;
  recovered: number;
  totalValue: number;
  avgValue: number;
  recoveryRate: number;
  last24h: {
    abandoned: number;
    lostValue: number;
    recovered: number;
  };
  conversion: {
    addedToCart: number;
    purchased: number;
    rate: number;
  };
}> {
  const carts = await getAbandonedCarts();
  
  const total = carts.length;
  const recovered = carts.filter(c => c.recovered).length;
  const totalValue = carts.reduce((sum, c) => sum + (c.total || 0), 0);
  const avgValue = total > 0 ? totalValue / total : 0;
  const recoveryRate = total > 0 ? (recovered / total) * 100 : 0;

  // Last 24 hours stats
  const oneDayAgo = new Date();
  oneDayAgo.setDate(oneDayAgo.getDate() - 1);
  
  const last24hCarts = carts.filter(c => {
    const createdAt = c.createdAt ? new Date(c.createdAt) : null;
    return createdAt && createdAt >= oneDayAgo;
  });
  
  const last24hAbandoned = last24hCarts.filter(c => !c.recovered).length;
  const last24hRecovered = last24hCarts.filter(c => c.recovered).length;
  const last24hLostValue = last24hCarts
    .filter(c => !c.recovered)
    .reduce((sum, c) => sum + (c.total || 0), 0);

  // Conversion data - compare abandoned carts vs orders
  // Get orders from last 24 hours
  let conversionData = { addedToCart: 0, purchased: 0, rate: 0 };
  
  try {
    const response = await fetch('/api/orders?limit=1000&status=all');
    const data = await response.json();
    
    if (data.success && data.orders) {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const recentOrders = data.orders.filter((o: any) => {
        const createdAt = new Date(o.created_at);
        return createdAt >= oneWeekAgo;
      });
      
      const purchased = recentOrders.length;
      const addedToCart = carts.filter(c => {
        const createdAt = c.createdAt ? new Date(c.createdAt) : null;
        return createdAt && createdAt >= oneWeekAgo;
      }).length;
      
      const rate = addedToCart > 0 ? (purchased / (purchased + addedToCart)) * 100 : 0;
      
      conversionData = {
        addedToCart,
        purchased,
        rate: Math.min(rate, 100),
      };
    }
  } catch (error) {
    console.error("Failed to fetch conversion data:", error);
  }

  return {
    total,
    recovered,
    totalValue,
    avgValue,
    recoveryRate,
    last24h: {
      abandoned: last24hAbandoned,
      lostValue: last24hLostValue,
      recovered: last24hRecovered,
    },
    conversion: conversionData,
  };
}

export async function markCartAsRecovered(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/abandoned-carts?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recovered: true }),
    });
    
    const data = await response.json();
    
    if (data.success) {
      cachedCarts = cachedCarts.map(cart =>
        cart.id === id
          ? { ...cart, recovered: true, recoveredAt: new Date(), status: "recovered" }
          : cart
      );
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error marking cart as recovered:", error);
    return false;
  }
}

export async function deleteAbandonedCart(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/abandoned-carts?id=${id}`, {
      method: "DELETE",
    });
    
    const data = await response.json();
    
    if (data.success) {
      cachedCarts = cachedCarts.filter(cart => cart.id !== id);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting abandoned cart:", error);
    return false;
  }
}

export async function saveCart(data: {
  session_id?: string;
  customer_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  is_anonymous?: boolean;
  items: AbandonedCartItem[];
  total: number;
  item_count: number;
}): Promise<AbandonedCart | null> {
  try {
    const response = await fetch("/api/abandoned-carts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    
    const result = await response.json();
    
    if (result.success) {
      cachedCarts = [result.cart, ...cachedCarts];
      return result.cart;
    }
    return null;
  } catch (error) {
    console.error("Error saving cart:", error);
    return null;
  }
}
