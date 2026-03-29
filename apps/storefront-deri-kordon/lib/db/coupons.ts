import { createServerClient, Coupon } from "@/lib/supabase";

// =====================================================
// COUPON QUERIES
// =====================================================

/**
 * Get active coupon by code
 */
export async function getCouponByCode(code: string) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("coupons")
        .select("*")
        .eq("code", code.trim().toUpperCase())
        .eq("is_active", true)
        .single();

    if (error) return null;

    // Validate start date
    if (data.starts_at && new Date(data.starts_at) > new Date()) {
        return null;
    }

    // Validate expiry
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return null;
    }

    // Validate usage limit
    if (data.max_uses && data.used_count >= data.max_uses) {
        return null;
    }

    return data;
}

/**
 * Get all coupons (admin)
 */
export async function getAllCoupons() {
    const serverClient = createServerClient();
    const orderedResult = await serverClient
        .from("coupons")
        .select("*")
        .order("created_at", { ascending: false });

    if (!orderedResult.error) {
        return orderedResult.data;
    }

    // Legacy DB compatibility: some deployments do not have `created_at` on coupons.
    if (orderedResult.error.code === "42703") {
        const fallbackResult = await serverClient
            .from("coupons")
            .select("*");

        if (fallbackResult.error) throw fallbackResult.error;
        return fallbackResult.data;
    }

    throw orderedResult.error;
}

/**
 * Get coupon by ID (admin)
 */
export async function getCouponById(id: string) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("coupons")
        .select("*")
        .eq("id", id)
        .single();

    if (error) throw error;
    return data;
}

// =====================================================
// ADMIN COUPON MUTATIONS
// =====================================================

/**
 * Create coupon (admin)
 */
export async function createCoupon(coupon: {
    code: string;
    type: "percentage" | "fixed";
    value: number;
    minOrder?: number;
    maxUses?: number;
    startsAt?: string;
    expiresAt?: string;
}) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("coupons")
        .insert({
            code: coupon.code.toUpperCase(),
            type: coupon.type,
            value: coupon.value,
            min_order: coupon.minOrder || 0,
            max_uses: coupon.maxUses || null,
            starts_at: coupon.startsAt || null,
            expires_at: coupon.expiresAt || null,
            is_active: true,
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update coupon (admin)
 */
export async function updateCoupon(id: string, updates: Partial<Coupon>) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("coupons")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Toggle coupon active status (admin)
 */
export async function toggleCoupon(id: string, isActive: boolean) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("coupons")
        .update({ is_active: isActive })
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Increment coupon usage (called when order is placed)
 */
export async function incrementCouponUsage(code: string) {
    const serverClient = createServerClient();

    const coupon = await getCouponByCode(code);
    if (!coupon) return false;

    const { error } = await serverClient
        .from("coupons")
        .update({ used_count: coupon.used_count + 1 })
        .eq("id", coupon.id);

    if (error) throw error;
    return true;
}

/**
 * Delete coupon (admin)
 */
export async function deleteCoupon(id: string) {
    const serverClient = createServerClient();
    const { error } = await serverClient
        .from("coupons")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}

/**
 * Apply coupon to order total
 */
export function applyCoupon(coupon: Coupon, subtotal: number): number {
    if (subtotal < coupon.min_order) {
        return 0;
    }

    if (coupon.type === "percentage") {
        return (subtotal * coupon.value) / 100;
    } else {
        return Math.min(coupon.value, subtotal);
    }
}
