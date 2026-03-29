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

async function requestCategoryApi<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {
    throw new Error(data?.error || "Kategori istegi basarisiz oldu.");
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
  const match = message.match(/Could not find the '([^']+)' column of 'categories'/i);
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

// Supabase'den kategorileri cek (Client-side read)
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

  return (
    data?.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || "",
      image: cat.image || "/placeholder.svg",
      icon: cat.icon || "paket",
      productCount: 0,
      parent_id: cat.parent_id,
      sort_order: cat.sort_order || 0,
      is_active: cat.is_active !== false,
      seo_title: cat.seo_title || "",
      seo_description: cat.seo_description || "",
    })) || []
  );
}

// Server-side icin kategori cekme
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

// Slug'a gore kategori getir (Client-side read)
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
    icon: data.icon || "paket",
    productCount: 0,
  };
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

  return {
    id: String(data.id),
    name: String(data.name),
    slug: String(data.slug),
    description: String(data.description || ""),
    image: String(data.image || "/placeholder.jpg"),
    icon: String(data.icon || "paket"),
    productCount: 0,
  };
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
