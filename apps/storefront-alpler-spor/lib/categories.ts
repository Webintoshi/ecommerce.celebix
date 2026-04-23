import { CategoryInfo } from "@/types/product";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import { runCategoriesQuery } from "@/lib/categories-query-compat";
import { DEFAULT_LOCALE, type StorefrontLocale } from "@/lib/i18n";

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

export async function fetchCategories(locale: StorefrontLocale = DEFAULT_LOCALE): Promise<CategoryInfo[]> {
  try {
    const response = await fetch(`/api/categories?locale=${locale}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as { categories?: CategoryInfo[] };
    return Array.isArray(payload.categories) ? payload.categories : [];
  } catch (error) {
    console.error("Error fetching categories:", error);
    return [];
  }
}

export async function fetchCategoriesServer() {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();

  const { data, error } = await runCategoriesQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query;
  });

  if (error) {
    console.error("Error fetching categories:", error);
    return [];
  }

  return data || [];
}

export async function fetchCategoryBySlug(slug: string): Promise<CategoryInfo | null> {
  const supabase = getSupabase();

  const { data, error } = await runCategoriesQuery((includeIsActiveFilter) => {
    let query = supabase.from("categories").select("*").eq("slug", slug);

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query.single();
  });

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
    icon: data.icon || "icon",
    productCount: 0,
  };
}

export async function getCategoryById(id: string): Promise<CategoryInfo | undefined> {
  const supabase = getSupabase();

  const { data, error } = await supabase.from("categories").select("*").eq("id", id).single();

  if (error || !data) return undefined;

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description || "",
    image: data.image || "/placeholder.jpg",
    icon: data.icon || "icon",
    productCount: 0,
  };
}

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

export async function deleteCategory(id: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

export function getCategories(): CategoryInfo[] {
  console.warn("getCategories() is deprecated. Use fetchCategories() instead.");
  return [];
}

export function getCategoryBySlug(slug: string): CategoryInfo | undefined {
  console.warn("getCategoryBySlug() is deprecated. Use fetchCategoryBySlug() instead.");
  return undefined;
}

export const CATEGORIES: CategoryInfo[] = [];
