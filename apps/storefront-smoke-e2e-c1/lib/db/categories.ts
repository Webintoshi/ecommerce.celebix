import { supabase, createServerClient, Category } from "@/lib/supabase";

// =====================================================
// CATEGORY QUERIES
// =====================================================

/**
 * Get all categories
 */
export async function getCategories() {
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });

    if (error) throw error;
    return data;
}

/**
 * Get category by slug
 */
export async function getCategoryBySlug(slug: string) {
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("slug", slug)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Get category by ID
 */
export async function getCategoryById(id: string) {
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("id", id)
        .single();

    if (error) throw error;
    return data;
}

// =====================================================
// ADMIN CATEGORY MUTATIONS
// =====================================================

/**
 * Create category (admin)
 */
export async function createCategory(category: Omit<Category, "id">) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("categories")
        .insert(category)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Update category (admin)
 */
export async function updateCategory(id: string, updates: Partial<Category>) {
    const serverClient = createServerClient();
    const { data, error } = await serverClient
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete category (admin)
 */
export async function deleteCategory(id: string) {
    const serverClient = createServerClient();
    const { error } = await serverClient
        .from("categories")
        .delete()
        .eq("id", id);

    if (error) throw error;
    return true;
}
