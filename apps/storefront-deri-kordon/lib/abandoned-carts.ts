import {
  AbandonedCart,
  AbandonedCartItem,
  AbandonedCartFilters,
  AbandonedCartSort,
} from "@/types/abandoned-cart";
import { supabase } from "@/lib/supabase";

export type {
  AbandonedCart,
  AbandonedCartItem,
  AbandonedCartFilters,
  AbandonedCartSort,
} from "@/types/abandoned-cart";

let cachedCarts: AbandonedCart[] = [];
let lastFetch: number = 0;
const CACHE_DURATION = 60000; // 1 minute cache

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

    if (data.success) {
      // Map snake_case to camelCase
      const mappedCarts = (data.carts || []).map((cart: any) => ({
        ...cart,
        createdAt: cart.created_at,
        updatedAt: cart.updated_at,
        recoveredAt: cart.recovered_at,
        itemCount: cart.item_count,
        isAnonymous: cart.is_anonymous,
        items: (cart.items || []).map((item: any) => ({
          ...item,
          productImage: item.image || "",
        })),
      }));
      return {
        carts: mappedCarts,
        total: data.pagination?.total || 0,
      };
    }
    return { carts: [], total: 0 };
  } catch (error) {
    console.error("Error fetching from API:", error);
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
          ? { ...cart, recovered: true, recovered_at: new Date() }
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
