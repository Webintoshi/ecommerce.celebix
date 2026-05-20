import { ProductsPageClient } from "@/components/product/ProductsPageClient";
import { getLocalizedCopy } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/request-locale";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { createServerClient } from "@/lib/supabase";
import { getProductDiscountRulesMap } from "@/lib/product-pricing";
import { maybeListStorefrontProducts } from "@/lib/db/light-postgres-storefront-read";
import {
  getVariantAttributeRegistry,
  hydrateProductVariantSnapshots,
} from "@/lib/variant-attribute-hydration";
import { getProductListingOrderPositions } from "@/lib/db/settings";
import { Product } from "@/types/product";
import { sortProductsByListingOrder } from "@celebix/platform-config/src/product-listing-order";
import { resolveVariantDisplayPricing, type ProductDiscountRule } from "@celebix/platform-config/src/product-pricing";
import { translateProductCollection } from "@/lib/translation";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  return buildStorePageMetadata({
    locale,
    pathname: "/urunler",
    title: copy.productsTitle,
    description: copy.productsDescription,
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
  rules: ProductDiscountRule[] = [],
): Product {
  const hydratedVariants = hydrateProductVariantSnapshots(dbProduct.variants || [], attributeRegistry);

  return {
    id: dbProduct.id,
    name: dbProduct.name,
    slug: dbProduct.slug,
    description: dbProduct.description || "",
    shortDescription: dbProduct.short_description || "",
    category: ((dbProduct.category || "genel") as unknown) as Product["category"],
    subcategory: ((dbProduct.subcategory || "genel") as unknown) as Product["subcategory"],
    images: dbProduct.images || [],
    tags: dbProduct.tags || [],
    variants:
      hydratedVariants.map((variant) => {
        const pricing = resolveVariantDisplayPricing(
          {
            price: Number(variant.price),
            originalPrice: variant.original_price ? Number(variant.original_price) : undefined,
          },
          rules,
        );

        return {
          id: variant.id,
          name: variant.name,
          weight: variant.weight ? parseInt(variant.weight, 10) : 250,
          price: pricing.price,
          originalPrice: pricing.originalPrice,
          stock: variant.stock,
          sku: variant.sku || "",
          groupName: variant.group_name || undefined,
          images: Array.isArray(variant.images) ? variant.images : [],
          attributes: variant.attributes,
          raw_attributes: variant.raw_attributes,
        };
      }) || [],
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

async function getProducts(locale: Awaited<ReturnType<typeof getRequestLocale>>): Promise<Product[]> {
  const supabase = createServerClient();
  const [lightPostgresProducts, attributeRegistry, productListingOrder] = await Promise.all([
    maybeListStorefrontProducts(),
    getVariantAttributeRegistry(),
    getProductListingOrderPositions(),
  ]);

  if (lightPostgresProducts !== undefined) {
    const orderedProducts = sortProductsByListingOrder(
      lightPostgresProducts as unknown as DBProduct[],
      productListingOrder,
    );
    const discountRulesMap = await getProductDiscountRulesMap(
      supabase,
      orderedProducts.map((product) => product.id),
    );

    const translatedProducts = await translateProductCollection(
      orderedProducts as DBProduct[],
      locale,
    );

    return translatedProducts.map((product) =>
      transformProduct(product as DBProduct, attributeRegistry, discountRulesMap[String(product.id)] || []),
    );
  }

  try {
    const [{ data: products, error }] = await Promise.all([
      supabase
        .from("products")
        .select(`
          *,
          variants:product_variants(*, raw_attributes:attributes)
        `)
        .eq("is_active", true)
        .or("status.eq.published,status.is.null")
        .order("created_at", { ascending: false }),
    ]);

    if (error) {
      console.error("Supabase error:", error);
      return [];
    }

    const orderedProducts = sortProductsByListingOrder(
      ((products as DBProduct[] | null | undefined) || []),
      productListingOrder,
    );
    const discountRulesMap = await getProductDiscountRulesMap(
      supabase,
      orderedProducts.map((product) => product.id),
    );

    const translatedProducts = await translateProductCollection(
      orderedProducts as DBProduct[],
      locale,
    );

    return translatedProducts.map((product) =>
      transformProduct(product as DBProduct, attributeRegistry, discountRulesMap[String(product.id)] || []),
    );
  } catch (error) {
    console.error("Failed to fetch products:", error);
    return [];
  }
}

async function getCategoryCounts() {
  const lightPostgresProducts = await maybeListStorefrontProducts();
  if (lightPostgresProducts !== undefined) {
    const counts: Record<string, number> = {};
    lightPostgresProducts.forEach((product) => {
      const key = product.category || "genel";
      counts[key] = (counts[key] || 0) + 1;
    });

    return counts;
  }

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
  const locale = await getRequestLocale();
  const [products, categoryCounts] = await Promise.all([getProducts(locale), getCategoryCounts()]);

  return (
    <ProductsPageClient
      initialProducts={products}
      categoryCounts={categoryCounts}
    />
  );
}
