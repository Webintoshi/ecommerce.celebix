import { Product } from "@/types/product";
import { getStoredProducts, addStoredProduct, addStoredProducts, deleteStoredProduct, updateStoredProduct, initializeProducts } from "./product-storage";
import { parseShopifyCSV, importProductsFromCSV } from "./csv-import";
import { runProductsQuery } from "@/lib/products-query-compat";

export type { Product } from "@/types/product";

// Default Ürün Verileri
const DEFAULT_PRODUCTS: Product[] = [];

// Initialize products on load
if (typeof window !== "undefined") {
  initializeProducts(DEFAULT_PRODUCTS);
}

// Get all products - Fetch from Supabase
export async function getAllProducts(): Promise<Product[]> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await runProductsQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("products")
      .select("*, variants:product_variants(*, raw_attributes:attributes)");

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query.or("status.eq.published,status.is.null");
  });

  if (error) {
    console.error("Error fetching products from Supabase:", error);
    return [];
  }

  return data || [];
}

// Get limited products for homepage (optimized)
export async function getLimitedProducts(limit: number = 8): Promise<Product[]> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await runProductsQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("products")
      .select("*, variants:product_variants(*, raw_attributes:attributes)");

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query
      .or("status.eq.published,status.is.null")
      .limit(limit);
  });

  if (error) {
    console.error("Error fetching limited products:", error);
    return [];
  }

  return data || [];
}

export const PRODUCTS: Product[] = [];

export async function getProductSlug(): Promise<string[]> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await runProductsQuery((includeIsActiveFilter) => {
    let query = supabase.from("products").select("slug");

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query.or("status.eq.published,status.is.null");
  });

  if (error) {
    console.error("Error fetching product slugs from Supabase:", error);
    return [];
  }

  return (data || []).map((p) => p.slug);
}

// Yardımcı Fonksiyonlar - Şimdi Supabase'den çekiyor
export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const { createServerClient } = await import("@/lib/supabase");
  const supabase = createServerClient();
  const { data, error } = await runProductsQuery((includeIsActiveFilter) => {
    let query = supabase
      .from("products")
      .select("*, variants:product_variants(*, raw_attributes:attributes)")
      .eq("slug", slug);

    if (includeIsActiveFilter) {
      query = query.eq("is_active", true);
    }

    return query
      .or("status.eq.published,status.is.null")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);
  });

  if (error) {
    console.error("Error fetching product by slug from Supabase:", error);
    return undefined;
  }

  return data?.[0];
}

export function getProductsByCategory(category: string): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getFeaturedProducts(limit = 8): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getNewProducts(limit = 4): Product[] {
  return []; // Sadece Supabase'den çek
}

export function searchProducts(query: string): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getRelatedProducts(product: Product, limit = 4): Product[] {
  return []; // Sadece Supabase'den çek
}

export function getProductsByCategorySlug(slug: string): Product[] {
  return []; // Sadece Supabase'den çek
}

export function addProduct(product: Product): void {
  addStoredProduct(product);
}

export function updateProduct(id: string, updatedProduct: Partial<Product>): void {
  updateStoredProduct(id, updatedProduct);
}

export function deleteProduct(id: string): void {
  deleteStoredProduct(id);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const products = await getAllProducts();
  return products.find((p) => p.id === id);
}

export function importProductsFromCSVFile(csvContent: string): {
  success: boolean;
  count: number;
  message: string;
} {
  const result = importProductsFromCSV(csvContent);

  if (result.success && result.products.length > 0) {
    addStoredProducts(result.products);
    return {
      success: true,
      count: result.products.length,
      message: `${result.products.length} ürün başarıyla içe aktarıldı.`,
    };
  }

  return {
    success: false,
    count: 0,
    message: result.message,
  };
}

export { parseShopifyCSV };
