import { createServerClient } from "@/lib/supabase";
import { Product } from "@/types/product";
import { ProductsPageClient } from "@/components/product/ProductsPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "TÃ¼m ÃœrÃ¼nler | Deri Kordon",
  description: "DoÄŸal ve katkÄ±sÄ±z fÄ±stÄ±k ezmesi, fÄ±ndÄ±k ezmesi ve kuruyemiÅŸ Ã§eÅŸitlerimizi keÅŸfedin.",
};

interface DBProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[];
  category: string;
  subcategory: string | null;
  tags: string[];
  is_featured: boolean;
  is_bestseller: boolean;
  is_active: boolean;
  is_new: boolean;
  vegan: boolean;
  gluten_free: boolean;
  sugar_free: boolean;
  high_protein: boolean;
  rating: number;
  review_count: number;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
  variants: DBVariant[];
}

interface DBVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  weight: string | null;
  created_at: string;
}

function transformProduct(dbProduct: DBProduct): Product {
  return {
    id: dbProduct.id,
    name: dbProduct.name,
    slug: dbProduct.slug,
    description: dbProduct.description || "",
    shortDescription: dbProduct.short_description || "",
    category: (dbProduct.category as Product["category"]) || "fistik-ezmesi",
    subcategory: (dbProduct.subcategory as Product["subcategory"]) || "klasik",
    images: dbProduct.images || [],
    tags: dbProduct.tags || [],
    variants: dbProduct.variants?.map(v => ({
      id: v.id,
      name: v.name,
      weight: v.weight ? parseInt(v.weight) : 250,
      price: Number(v.price),
      originalPrice: v.original_price ? Number(v.original_price) : undefined,
      stock: v.stock,
      sku: v.sku || "",
    })) || [],
    vegan: dbProduct.vegan,
    glutenFree: dbProduct.gluten_free,
    sugarFree: dbProduct.sugar_free,
    highProtein: dbProduct.high_protein,
    rating: Number(dbProduct.rating) || 5,
    reviewCount: dbProduct.review_count || 0,
    featured: dbProduct.is_featured,
    new: dbProduct.is_new,
    seoTitle: dbProduct.seo_title || undefined,
    seoDescription: dbProduct.seo_description || undefined,
  };
}

async function getProducts(): Promise<Product[]> {
  const supabase = createServerClient();
  
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select(`
        *,
        variants:product_variants(*)
      `)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Supabase error:", error);
      return [];
    }
    
    return (products as DBProduct[] || []).map(transformProduct);
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return [];
  }
}

async function getCategoryCounts() {
  const supabase = createServerClient();
  
  try {
    const { data: products } = await supabase
      .from("products")
      .select("category")
      .eq("is_active", true);

    const counts: Record<string, number> = {};
    products?.forEach((p) => {
      counts[p.category] = (counts[p.category] || 0) + 1;
    });
    
    return counts;
  } catch (error) {
    console.error("Failed to fetch category counts:", error);
    return {};
  }
}

export default async function AllProductsPage() {
  const [products, categoryCounts] = await Promise.all([
    getProducts(),
    getCategoryCounts(),
  ]);
  
  return (
    <ProductsPageClient 
      initialProducts={products} 
      categoryCounts={categoryCounts}
    />
  );
}

