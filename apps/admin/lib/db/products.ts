import { supabase, createServerClient, Product, ProductVariant } from "@/lib/supabase";

// =====================================================
// PRODUCT QUERIES
// =====================================================

/**
 * Get all products with their variants
 */
export async function getProducts() {
    const { data, error } = await supabase
        .from("products")
        .select(`
      *,
      variants:product_variants(*)
    `)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Get featured products
 */
export async function getFeaturedProducts() {
    const { data, error } = await supabase
        .from("products")
        .select(`
      *,
      variants:product_variants(*)
    `)
        .eq("is_featured", true)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Get bestseller products
 */
export async function getBestsellerProducts() {
    const { data, error } = await supabase
        .from("products")
        .select(`
      *,
      variants:product_variants(*)
    `)
        .eq("is_bestseller", true)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Get product by slug
 */
export async function getProductBySlug(slug: string) {
    const { data, error } = await supabase
        .from("products")
        .select(`
      *,
      variants:product_variants(*)
    `)
        .eq("slug", slug)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get products by category
 */
export async function getProductsByCategory(category: string) {
    const { data, error } = await supabase
        .from("products")
        .select(`
      *,
      variants:product_variants(*)
    `)
        .eq("category", category)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
}

/**
 * Search products
 */
export async function searchProducts(query: string) {
    const { data, error } = await supabase
        .from("products")
        .select(`
      *,
      variants:product_variants(*)
    `)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .limit(10);

    if (error) throw error;
    return data;
}

// =====================================================
// ADMIN PRODUCT MUTATIONS (Server-side only)
// =====================================================

/**
 * Create a new product (admin)
 */
export async function createProduct(product: Omit<Product, "id" | "created_at" | "updated_at">) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("products")
        .insert(product)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update a product (admin)
 */
export async function updateProduct(id: string, updates: Partial<Product>) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("products")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete a product (admin)
 */
export async function deleteProduct(id: string) {
    const serverClient = createServerClient();
    
    // Check if there are any order items referencing this product directly
    const { data: orderItems } = await serverClient
        .from("order_items")
        .select("id")
        .eq("product_id", id)
        .limit(1);

    if (orderItems && orderItems.length > 0) {
        throw new Error("Bu ürüne ait sipariş kalemleri bulunmaktadır. Önce siparişleri iptal etmeniz gerekmektedir.");
    }

    // Get product variants
    const { data: variants } = await serverClient
        .from("product_variants")
        .select("id")
        .eq("product_id", id);

    if (variants && variants.length > 0) {
        const variantIds = variants.map(v => v.id);
        
        // Check if any variant has order items
        const { data: variantOrderItems } = await serverClient
            .from("order_items")
            .select("id")
            .in("variant_id", variantIds)
            .limit(1);

        if (variantOrderItems && variantOrderItems.length > 0) {
            throw new Error("Bu ürünün varyantlarına ait sipariş kalemleri bulunmaktadır. Önce siparişleri iptal etmeniz gerekmektedir.");
        }

        // Delete related records first (in order to avoid FK constraints)
        // Handle each variant separately to catch specific errors
        for (const variant of variants) {
            // Try to delete variant - if it fails due to FK, continue to next
            const { error: variantError } = await serverClient
                .from("product_variants")
                .delete()
                .eq("id", variant.id);
            
            if (variantError) {
                console.log("Variant delete warning:", variantError.message);
            }
        }
    }

    // Delete all related records - handle FK errors gracefully
    const relatedTables = [
        "customer_preferred_products",
        "favorites",
        "product_views",
        "product_reviews",
        "cart_items",
        "wishlist_items"
    ];

    for (const table of relatedTables) {
        try {
            await serverClient.from(table).delete().eq("product_id", id);
        } catch (e) {}
        
        try {
            if (variants && variants.length > 0) {
                const variantIds = variants.map(v => v.id);
                await serverClient.from(table).delete().in("variant_id", variantIds);
            }
        } catch (e) {}
    }

    // Now delete the product
    const { error } = await serverClient
        .from("products")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}

/**
 * Add variant to product (admin)
 */
export async function addProductVariant(variant: Omit<ProductVariant, "id" | "created_at">) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("product_variants")
        .insert(variant)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update variant (admin)
 */
export async function updateProductVariant(id: string, updates: Partial<ProductVariant>) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("product_variants")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete variant (admin)
 */
export async function deleteProductVariant(id: string) {
    const serverClient = createServerClient();
    
    // Check if there are any order items referencing this variant
    const { data: orderItems } = await serverClient
        .from("order_items")
        .select("id")
        .eq("variant_id", id)
        .limit(1);

    if (orderItems && orderItems.length > 0) {
        throw new Error("Bu varyanta ait sipariş kalemleri bulunmaktadır. Önce siparişleri iptal etmeniz gerekmektedir.");
    }

    const { error } = await serverClient
        .from("product_variants")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}
