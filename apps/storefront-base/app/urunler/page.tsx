import { ProductsPageClient } from "@/components/product/ProductsPageClient";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { createServerClient } from "@/lib/supabase";
import {
  getVariantAttributeRegistry,
  hydrateProductVariantSnapshots,
} from "@/lib/variant-attribute-hydration";
import { Product } from "@/types/product";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return buildStorePageMetadata({
    pathname: "/urunler",
    title: "Tum Urunler",
    description: "Tum urun koleksiyonunu, kategorileri ve vitrindeki tum urunleri kesfedin.",
    keywords: ["urunler", "koleksiyon", "kategori", "magaza"],
  });
}

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
  group_name?: string | null;
  images?: string[] | null;
  attributes?: Array<Record<string, unknown>>;
  raw_attributes?: Array<Record<string, unknown>>;
}

function transformProduct(
  dbProduct: DBProduct,
  attributeRegistry: Awaited<ReturnType<typeof getVariantAttributeRegistry>>,
): Product {
  const hydratedVariants = hydrateProductVariantSnapshots(dbProduct.variants || [], attributeRegistry);

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
    variants:
      hydratedVariants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        weight: variant.weight ? parseInt(variant.weight, 10) : 250,
        price: Number(variant.price),
        originalPrice: variant.original_price ? Number(variant.original_price) : undefined,
        stock: variant.stock,
        sku: variant.sku || "",
        groupName: variant.group_name || undefined,
        images: Array.isArray(variant.images) ? variant.images : [],
        attributes: variant.attributes,
        raw_attributes: variant.raw_attributes,
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
    const [{ data: products, error }, attributeRegistry] = await Promise.all([
      supabase
        .from("products")
        .select(`
          *,
          variants:product_variants(*, raw_attributes:attributes)
        `)
        .eq("is_active", true)
        .or("status.eq.published,status.is.null")
        .order("created_at", { ascending: false }),
      getVariantAttributeRegistry(),
    ]);

    if (error) {
      console.error("Supabase error:", error);
      return [];
    }

    return (products as DBProduct[] | null | undefined)?.map((product) =>
      transformProduct(product, attributeRegistry),
    ) || [];
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
    products?.forEach((product) => {
      counts[product.category] = (counts[product.category] || 0) + 1;
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
