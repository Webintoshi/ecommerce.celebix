import { CategoryInfo } from "@/types/product";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";

type CategoryAdminInput = Omit<CategoryInfo, "id" | "productCount"> & {
  parent_id?: string | null;
  sort_order?: number;
  is_active?: boolean;
  seo_title?: string;
  seo_description?: string;
  seo_keywords?: string[] | null;
  seo_keywords?: string[];
};

function getSupabase() {
  return getBrowserSupabaseClient();
}

async function requestCategoryApi<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    cache: "no-store",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || "Kategori isteği başarısız oldu.");
  }

  return data as T;
}

const OPTIONAL_CATEGORY_COLUMNS = new Set([
  "icon",
  "is_active",
  "seo_title",
  "seo_description",
  "seo_keywords",
  "faq",
  "geo_data",
]);

function getMissingCategoryColumn(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("message" in error)) return null;
  const message = String(error.message ?? "");
  const match =
    message.match(/Could not find the '([^']+)' column of 'categories'/i) ||
    message.match(/column categories\.([a-z_]+) does not exist/i);
  return match?.[1] ?? null;
}

function stripUnsupportedCategoryColumn<T extends Record<string, unknown>>(
  payload: T,
  error: unknown
): T | null {
  const missingColumn = getMissingCategoryColumn(error);
  if (!missingColumn || !OPTIONAL_CATEGORY_COLUMNS.has(missingColumn) || !(missingColumn in payload)) {
    return null;
  }

  const nextPayload = { ...payload };
  delete nextPayload[missingColumn];
  return nextPayload;
}

function mapCategory(data: Record<string, any>): CategoryInfo {
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    description: data.description || "",
    image: data.image || "/placeholder.svg",
    icon: data.icon || "paket",
    productCount: 0,
    parent_id: data.parent_id,
    sort_order: data.sort_order || 0,
    is_active: data.is_active !== false,
    seo_title: data.seo_title || "",
    seo_description: data.seo_description || "",
    seo_keywords: data.seo_keywords || null,
  };
}

// Supabase'den kategorileri cek (Client-side read)
export async function fetchCategories(options?: { fresh?: boolean }): Promise<CategoryInfo[]> {
  try {
    const url = options?.fresh
      ? `/api/categories?fresh=${Date.now()}`
      : "/api/categories";
    const result = await requestCategoryApi<{ categories?: Record<string, unknown>[] }>(
      url,
      { method: "GET" },
    );
    return (result.categories || []).map((category) => mapCategory(category as Record<string, any>));
  } catch (error) {
    console.error("Error fetching categories:", error);
    try {
      const supabase = getSupabase();
      const { data, error: fallbackError } = await supabase
        .from("categories")
        .select("*")
        .order("sort_order", { ascending: true });

      if (fallbackError) {
        console.error("Fallback category fetch error:", fallbackError);
        return [];
      }

      return (data || []).map((category) => mapCategory(category as Record<string, any>));
    } catch (fallbackError) {
      console.error("Fallback category fetch exception:", fallbackError);
      return [];
    }
  }
}

// Server-side icin kategori cekme
export async function fetchCategoriesServer() {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();

  const primary = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (!primary.error) {
    return primary.data || [];
  }

  const missingColumn = getMissingCategoryColumn(primary.error);
  if (missingColumn !== "is_active") {
    console.error("Error fetching categories:", primary.error);
    return [];
  }

  const fallback = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (fallback.error) {
    console.error("Fallback server category fetch error:", fallback.error);
    return [];
  }

  return fallback.data || [];
}

// Slug'a gore kategori getir (Client-side read)
export async function fetchCategoryBySlug(slug: string): Promise<CategoryInfo | null> {
  try {
    const result = await requestCategoryApi<{ category?: Record<string, unknown> }>(
      `/api/categories?slug=${encodeURIComponent(slug)}`,
      { method: "GET" },
    );

    if (!result.category) return null;
    return mapCategory(result.category as Record<string, any>);
  } catch (error) {
    console.error("Error fetching category:", error);
    return null;
  }
}

// =====================================================
// ADMIN PANEL FONKSIYONLARI
// Writes always go through /api/categories so service-role handles RLS.
// =====================================================

export async function getCategoryById(id: string): Promise<CategoryInfo | undefined> {
  const result = await requestCategoryApi<{ category?: Record<string, unknown> }>(
    `/api/categories?id=${encodeURIComponent(id)}`,
    { method: "GET" }
  ).catch(() => null);

  const data = result?.category;
  if (!data) return undefined;

  return mapCategory(data);
}

export async function addCategory(category: CategoryAdminInput): Promise<void> {
  let payload: Record<string, unknown> = {
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
    seo_keywords: category.seo_keywords || null,
    seo_keywords: category.seo_keywords || null,
  };

  while (true) {
    try {
      await requestCategoryApi("/api/categories", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return;
    } catch (error) {
      const nextPayload = stripUnsupportedCategoryColumn(payload, error);
      if (!nextPayload) throw error;
      payload = nextPayload;
    }
  }
}

export async function updateCategory(id: string, updatedCategory: Partial<CategoryAdminInput>): Promise<void> {
  let payload: Record<string, unknown> = {
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
    seo_keywords: updatedCategory.seo_keywords || null,
    seo_keywords: updatedCategory.seo_keywords || null,
  };

  while (true) {
    try {
      await requestCategoryApi("/api/categories", {
        method: "PUT",
        body: JSON.stringify({ id, ...payload }),
      });
      return;
    } catch (error) {
      const nextPayload = stripUnsupportedCategoryColumn(payload, error);
      if (!nextPayload) throw error;
      payload = nextPayload;
    }
  }
}

export async function deleteCategory(id: string): Promise<void> {
  await requestCategoryApi(`/api/categories?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
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
