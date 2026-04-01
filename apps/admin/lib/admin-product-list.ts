import "server-only";

import { createServerClient } from "@/lib/supabase";
import { fetchCategoriesServer } from "@/lib/categories";
import { resolveAdminAssetUrl } from "@/lib/asset-url";
import type {
  AdminPaginationMeta,
  AdminProductListItem,
  AdminProductVariant,
} from "@/lib/admin-data-types";
import type { CategoryInfo } from "@/types/product";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[] | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  is_featured: boolean | null;
  is_new: boolean | null;
  variants: VariantRow[] | null;
};

type VariantRow = {
  id: string;
  name: string | null;
  price: number | string | null;
  original_price: number | string | null;
  stock: number | string | null;
  sku: string | null;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  icon?: string | null;
  parent_id?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
  seo_title?: string | null;
  seo_description?: string | null;
};

function mapVariant(row: VariantRow): AdminProductVariant {
  return {
    id: row.id,
    name: row.name || "Varsayilan",
    price: Number(row.price || 0),
    originalPrice: row.original_price ? Number(row.original_price) : undefined,
    stock: Number(row.stock || 0),
    sku: row.sku || "",
  };
}

function mapProduct(row: ProductRow): AdminProductListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    shortDescription: row.short_description || "",
    images: (row.images || [])
      .map((image) => resolveAdminAssetUrl(image) || image)
      .filter((image): image is string => Boolean(image)),
    category: row.category || "",
    subcategory: row.subcategory || "",
    tags: row.tags || [],
    variants: (row.variants || []).map(mapVariant),
    featured: Boolean(row.is_featured),
    isNew: Boolean(row.is_new),
  };
}

function mapCategory(row: CategoryRow): CategoryInfo {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || "",
    image: resolveAdminAssetUrl(row.image) || row.image || "/placeholder.svg",
    icon: row.icon || "paket",
    productCount: 0,
    parent_id: row.parent_id || null,
    sort_order: row.sort_order || 0,
    is_active: row.is_active !== false,
    seo_title: row.seo_title || "",
    seo_description: row.seo_description || "",
  };
}

export async function getAdminProductsBootstrap(
  page = 1,
  limit = 20
): Promise<{
  products: AdminProductListItem[];
  categories: CategoryInfo[];
  pagination: AdminPaginationMeta;
}> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const offset = (safePage - 1) * safeLimit;
  const supabase = createServerClient();

  const [productsCountResponse, productsResponse, categoriesResponse] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase
      .from("products")
      .select(
        "id,name,slug,description,short_description,images,category,subcategory,tags,is_featured,is_new,variants:product_variants(id,name,price,original_price,stock,sku)"
      )
      .range(offset, offset + safeLimit - 1)
      .order("created_at", { ascending: false }),
    fetchCategoriesServer(),
  ]);

  if (productsCountResponse.error) {
    throw productsCountResponse.error;
  }

  if (productsResponse.error) {
    throw productsResponse.error;
  }

  const total = Number(productsCountResponse.count || 0);

  return {
    products: ((productsResponse.data || []) as ProductRow[]).map(mapProduct),
    categories: ((categoriesResponse || []) as CategoryRow[]).map(mapCategory),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}
