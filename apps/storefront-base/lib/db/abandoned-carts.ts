import { createServerClient } from "@/lib/supabase";

// =====================================================
// ABANDONED CART OPERATIONS
// =====================================================

/**
 * Create abandoned cart
 */
export async function createAbandonedCart(data: {
    customerId?: string;
    email?: string;
    phone?: string;
    items: Record<string, unknown>[];
    total: number;
}) {
    const serverClient = createServerClient();

    const { data: cart, error } = await serverClient
        .from("abandoned_carts")
        .insert({
            customer_id: data.customerId || null,
            email: data.email || null,
            phone: data.phone || null,
            items: data.items,
            total: data.total,
            recovered: false,
        })
        .select()
        .single();

    if (error) throw error;
    return cart;
}

/**
 * Get all abandoned carts (admin)
 */
export async function getAbandonedCarts(options?: {
    recovered?: boolean;
    limit?: number;
    offset?: number;
}) {
    const serverClient = createServerClient();

    let query = serverClient
        .from("abandoned_carts")
        .select("*")
        .order("created_at", { ascending: false });

    if (options?.recovered !== undefined) {
        query = query.eq("recovered", options.recovered);
    }

    if (options?.limit) {
        query = query.limit(options.limit);
    }

    if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data;
}

/**
 * Get abandoned cart by ID (admin)
 */
export async function getAbandonedCartById(id: string) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("abandoned_carts")
        .select("*")
        .eq("id", id)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Mark cart as recovered (admin)
 */
export async function markCartAsRecovered(id: string) {
    const serverClient = createServerClient();

    const { data, error } = await serverClient
        .from("abandoned_carts")
        .update({ recovered: true })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete abandoned cart (admin)
 */
export async function deleteAbandonedCart(id: string) {
    const serverClient = createServerClient();

    const { error } = await serverClient
        .from("abandoned_carts")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}

/**
 * Get abandoned cart statistics (admin)
 */
export async function getAbandonedCartStats() {
    const serverClient = createServerClient();

    const { data: carts, error } = await serverClient
        .from("abandoned_carts")
        .select("total, recovered, created_at");

    if (error) throw error;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayCarts = carts.filter(c => new Date(c.created_at) >= today);
    const weekCarts = carts.filter(c => new Date(c.created_at) >= thisWeek);
    const recoveredCarts = carts.filter(c => c.recovered);

    return {
        total: carts.length,
        totalValue: carts.reduce((sum, c) => sum + Number(c.total), 0),
        recovered: recoveredCarts.length,
        recoveredValue: recoveredCarts.reduce((sum, c) => sum + Number(c.total), 0),
        recoveryRate: carts.length > 0 ? (recoveredCarts.length / carts.length) * 100 : 0,
        todayCount: todayCarts.length,
        weekCount: weekCarts.length,
    };
}
