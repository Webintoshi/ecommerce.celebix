import { createServerClient } from "@/lib/supabase";
import { runProductsQuery } from "@/lib/products-query-compat";
import {
  getVariantAttributeRegistry,
  hydrateProductVariantSnapshots,
} from "@/lib/variant-attribute-hydration";
import { Product } from "@/types/product";
import { ProductsPageClient } from "@/components/product/ProductsPageClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Tüm Ürünler | Deri Kordon",
  description:
    "El yapımı hakiki deri kordonlar, Apple Watch kayışları ve premium deri aksesuarları keşfedin.",
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
      hydratedVariants.map((v) => ({
        id: v.id,
        name: v.name,
        weight: v.weight ? parseInt(v.weight) : 250,
        price: Number(v.price),
        originalPrice: v.original_price ? Number(v.original_price) : undefined,
        stock: v.stock,
        sku: v.sku || "",
        groupName: v.group_name || undefined,
        images: Array.isArray(v.images) ? v.images : [],
        attributes: v.attributes,
        raw_attributes: v.raw_attributes,
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
      runProductsQuery(
      (includeIsActiveFilter) => {
        let query = supabase.from("products").select(`
            *,
            variants:product_variants(*, raw_attributes:attributes)
          `);

        if (includeIsActiveFilter) {
          query = query.eq("is_active", true);
        }

        return query
          .or("status.eq.published,status.is.null")
          .order("created_at", { ascending: false });
      }
      ),
      getVariantAttributeRegistry(),
    ]);

    if (error) {
      console.error("Supabase error:", error);
      return [];
    }

    return ((products as DBProduct[]) || []).map((product) =>
      transformProduct(product, attributeRegistry),
    );
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return [];
  }
}

export default async function AllProductsPage() {
  const products = await getProducts();

  return <ProductsPageClient initialProducts={products} />;
}
