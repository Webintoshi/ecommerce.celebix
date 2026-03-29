import { CategoryInfo } from "@/types/product";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";

type CategoryAdminInput = Omit<CategoryInfo, "id" | "productCount"> & {
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  seo_title?: string;
  seo_description?: string;
};

function getSupabase() {
  return getBrowserSupabaseClient();
}

// Supabase'den kategorileri çek (Client-side)
export async function fetchCategories(): Promise<CategoryInfo[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("Error fetching categories:", error);
      return [];
    }

    return data?.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      image: cat.image || "/placeholder.svg",
      icon: cat.icon || "📦",
      productCount: 0,
      parent_id: cat.parent_id,
      sort_order: cat.sort_order || 0,
      is_active: cat.is_active !== false,
      seo_title: cat.seo_title || "",
      seo_description: cat.seo_description || "",
    })) || [];
}

// Server-side için kategori çekme
export async function fetchCategoriesServer() {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  return data || [];
}

// Slug'a göre kategori getir (Client-side)
export async function fetchCategoryBySlug(slug: string): Promise<CategoryInfo | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error || !data) {
    console.error("Error fetching category:", error);
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description || "",
    image: data.image || "/placeholder.svg",
    icon: data.icon || "📦",
    productCount: 0,
  };
}

// =====================================================
// ADMIN PANEL FONKSİYONLARI (Supabase ile)
// =====================================================

// ID'ye göre kategori getir (Admin için)
export async function getCategoryById(id: string): Promise<CategoryInfo | undefined> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description || "",
    image: data.image || "/placeholder.jpg",
    icon: data.icon || "📦",
    productCount: 0,
  };
}

// Kategori ekle (Admin için)
export async function addCategory(category: CategoryAdminInput): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("categories").insert({
    name: category.name,
    slug: category.slug,
    description: category.description,
    image: category.image,
    icon: category.icon,
    parent_id: category.parent_id || null,
    sort_order: category.sort_order || 0,
    is_active: category.is_active !== false,
    seo_title: category.seo_title || null,
    seo_description: category.seo_description || null,
  });

  if (error) throw error;
}

// Kategori güncelle (Admin için)
export async function updateCategory(id: string, updatedCategory: Partial<CategoryAdminInput>): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from("categories")
    .update({
      name: updatedCategory.name,
      slug: updatedCategory.slug,
      description: updatedCategory.description,
      image: updatedCategory.image,
      icon: updatedCategory.icon,
      parent_id: updatedCategory.parent_id || null,
      sort_order: updatedCategory.sort_order || 0,
      is_active: updatedCategory.is_active !== false,
      seo_title: updatedCategory.seo_title || null,
      seo_description: updatedCategory.seo_description || null,
    })
    .eq("id", id);

  if (error) throw error;
}

// Kategori sil (Admin için)
export async function deleteCategory(id: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// ESKİ getCategories - backwards compatibility
export function getCategories(): CategoryInfo[] {
  console.warn("getCategories() is deprecated. Use fetchCategories() instead.");
  return [];
}

// ESKİ getCategoryBySlug - backwards compatibility  
export function getCategoryBySlug(slug: string): CategoryInfo | undefined {
  console.warn("getCategoryBySlug() is deprecated. Use fetchCategoryBySlug() instead.");
  return undefined;
}

// BOŞ CATEGORIES ARRAY - Artık statik kategori yok!
export const CATEGORIES: CategoryInfo[] = [];
