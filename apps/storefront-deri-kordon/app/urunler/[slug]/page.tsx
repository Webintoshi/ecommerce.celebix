import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/product/ProductDetailClient";
import { getProductBySlug, getProductSlug } from "@/lib/products";
import { runProductsQuery } from "@/lib/products-query-compat";
import { createServerClient } from "@/lib/supabase";
import { parseProductSlug, findVariantIndex, buildCanonicalUrl } from "@/lib/slug-parser";
import { findPreferredVariantIndex } from "@/lib/variant-selection";
import { getRequestLocale } from "@/lib/request-locale";
import { buildLocaleAlternates, buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { buildAbsoluteRequestUrl } from "@/lib/request-origin";
import { translateProductRecord } from "@/lib/translation";
import {
  getVariantAttributeRegistry,
  hydrateVariantAttributes,
  inferVariantAttributesFromName,
} from "@/lib/variant-attribute-hydration";

function isMissingProductVariantAttributeRelation(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  const message = String(error.message ?? "");
  return /relationship between 'product_variants' and 'product_variant_attributes'/i.test(message);
}

async function fetchProductVariants(supabase: any, productId: string) {
  const selectWithLinkedAttributes = `
    *,
    raw_attributes:attributes,
    linked_attributes:product_variant_attributes(
      id,
      attribute_value:variant_attribute_values(
        id,
        attribute_id,
        value,
        display_order,
        color_code,
        image_url,
        attribute:variant_attributes(id, name)
      )
    )
  `;

  const { data, error } = await supabase
    .from("product_variants")
    .select(selectWithLinkedAttributes)
    .eq("product_id", productId);

  if (!error) {
    return { data, error: null };
  }

  if (!isMissingProductVariantAttributeRelation(error)) {
    return { data: null, error };
  }

  const fallbackResult = await supabase
    .from("product_variants")
    .select("*, raw_attributes:attributes")
    .eq("product_id", productId);

  if (fallbackResult.error) {
    return { data: null, error: fallbackResult.error };
  }

  return { data: fallbackResult.data, error: null };
}

function normalizeProductVariant(variant: any) {
  return {
    ...variant,
    originalPrice: variant?.originalPrice ?? variant?.original_price ?? undefined,
    images: Array.isArray(variant?.images) ? variant.images : [],
  };
}

function extractProductImages(product: any): string[] {
  if (Array.isArray(product?.images_v2) && product.images_v2.length > 0) {
    return product.images_v2
      .map((image: any) => image?.url)
      .filter((image: unknown): image is string => typeof image === "string" && image.length > 0);
  }

  if (Array.isArray(product?.images)) {
    return product.images.filter(
      (image: unknown): image is string => typeof image === "string" && image.length > 0
    );
  }

  return [];
}

function normalizeProductForDetail(product: any) {
  if (!product) {
    return null;
  }

  return {
    ...product,
    shortDescription: product.shortDescription ?? product.short_description ?? "",
    reviewCount: product.reviewCount ?? product.review_count ?? 0,
    featured: product.featured ?? product.is_featured ?? false,
    new: product.new ?? product.is_new ?? false,
    seoTitle: product.seoTitle ?? product.seo_title ?? undefined,
    seoDescription: product.seoDescription ?? product.seo_description ?? undefined,
    images: extractProductImages(product),
    variants: Array.isArray(product.variants)
      ? product.variants.map((variant: any) => normalizeProductVariant(variant))
      : [],
  };
}

// Generate metadata on the server side
export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const { slug } = await params;

  // Parse URL slug to extract base slug
  const { baseSlug } = parseProductSlug(slug);

  // Get product from static data (fastest)
  const product = normalizeProductForDetail(await getProductBySlug(baseSlug));
  
  if (!product) {
    return buildStorePageMetadata({
      locale,
      pathname: `/urunler/${baseSlug}`,
      title: copy.missingProductTitle,
      description: copy.missingProductDescription,
      noIndex: true,
    });
  }

  const translatedProduct = await translateProductRecord(product, locale);

  return buildStorePageMetadata({
    locale,
    pathname: `/urunler/${baseSlug}`,
    title: translatedProduct.seoTitle || translatedProduct.name,
    description:
      translatedProduct.seoDescription ||
      translatedProduct.shortDescription ||
      translatedProduct.description?.slice(0, 160) ||
      "",
    keywords: translatedProduct.tags,
    image: translatedProduct.images && translatedProduct.images.length > 0 ? translatedProduct.images[0] : null,
    type: "website",
  });

}

// Dynamic rendering for fresh data - NO CACHE
export const revalidate = 0;
export const dynamic = 'force-dynamic';

// Note: generateStaticParams disabled for dynamic content
// If you want static generation, uncomment below and remove dynamic = 'force-dynamic' above
/*
export async function generateStaticParams() {
  try {
    const supabase = createServerClient();
    const { data: products } = await supabase
      .from("products")
      .select("slug")
      .eq("is_active", true);
    
    if (products && products.length > 0) {
      return products.map((p) => ({ slug: p.slug }));
    }
  } catch (error) {
    console.error("Failed to fetch slugs for static generation:", error);
  }
  
  const allSlugs = await getProductSlug();
  return allSlugs.map((slug) => ({ slug }));
}
*/

// Server component
export default async function ProductDetailPage({
  params
}: {
  params: Promise<{ slug: string }>
}) {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const { slug: urlSlug } = await params;

  // Parse URL slug to extract base product slug and variant info
  const parsedSlug = parseProductSlug(urlSlug);
  const { baseSlug } = parsedSlug;

  let product = null;
  let relatedProducts: any[] = [];

  // 1. FIRST: Check Supabase (always has latest data with images)
  let supabaseError = null;
  try {
    const supabase = createServerClient();
    
    // Once urunu cek
    const { data: dbProducts, error: productError } = await runProductsQuery((includeIsActiveFilter) => {
      let query = supabase
        .from("products")
        .select("*")
        .eq("slug", baseSlug);

      if (includeIsActiveFilter) {
        query = query.eq("is_active", true);
      }

      return query
        .or("status.eq.published,status.is.null")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
    });
    
    if (productError) {
      console.error('Product fetch error:', productError);
      supabaseError = productError;
    } else if (dbProducts?.[0]) {
      const dbProduct = dbProducts[0];
      // Ayri olarak varyantlari cek (nitelikleriyle birlikte)
      const { data: variants, error: variantsError } = await fetchProductVariants(supabase, dbProduct.id);
      
      if (variantsError) {
        console.error('Variants fetch error:', variantsError);
        supabaseError = variantsError;
      }

      const attributeRegistry = await getVariantAttributeRegistry();

      // Transform images_v2 to images format
      const images = extractProductImages(dbProduct);
      
      // Transform variants with attributes
      let transformedVariants = variants?.map((v: any) => {
        const linkedAttributes = Array.isArray(v.linked_attributes)
          ? v.linked_attributes.map((a: any) => ({
              ...a.attribute_value,
              attribute: a.attribute_value?.attribute
            }))
          : [];

        const rawAttributes = Array.isArray(v.raw_attributes) ? v.raw_attributes : [];
        let attrs = hydrateVariantAttributes(
          [...linkedAttributes, ...rawAttributes],
          attributeRegistry,
        );

        if (attrs.length === 0) {
          attrs = inferVariantAttributesFromName(v.name || "", attributeRegistry);
        }

        return {
          ...v,
          originalPrice: v.original_price,
          images: Array.isArray(v.images) ? v.images : [],
          attributes: attrs,
        };
      }) || [];

      if (transformedVariants.length === 0) {
        const fallbackProduct = normalizeProductForDetail(await getProductBySlug(baseSlug));

        if (fallbackProduct?.variants?.length) {
          transformedVariants = fallbackProduct.variants;
        }
      }

      product = normalizeProductForDetail({
        ...dbProduct,
        images,
        variants: transformedVariants,
      });
    }
  } catch (error) {
    console.error("Failed to fetch product from Supabase:", error);
    supabaseError = error;
  }

  // 2. SECOND: Fallback to static data if Supabase fails
  if (!product) {
    product = normalizeProductForDetail(await getProductBySlug(baseSlug));
  }

  // 3. If still no product, return 404
  if (!product) {
    notFound();
  }

  product = (await translateProductRecord(product, locale)) as typeof product;

  // 4. Determine selected variant based on URL
  let selectedVariantIndex = 0;
  if (product.variants && product.variants.length > 0) {
    selectedVariantIndex =
      parsedSlug.variantWeight || parsedSlug.variantId
        ? findVariantIndex(product.variants, parsedSlug)
        : findPreferredVariantIndex(product.variants);
  }

  // 5. Get related products from same category (from static data - faster)
  try {
    // Try to get related products from static data first
    const { getRelatedProducts } = await import("@/lib/products");
    relatedProducts = getRelatedProducts(product, 4);
  } catch {
    // Fallback: empty array
    relatedProducts = [];
  }

  if (relatedProducts.length > 0) {
    relatedProducts = await Promise.all(
      relatedProducts.map((item) => translateProductRecord(item, locale)),
    );
  }

  // Generate JSON-LD Schema
  const variant = product.variants?.[selectedVariantIndex || 0];
  const localizedProductPath = buildLocalizedPath(`/urunler/${baseSlug}`, locale);
  const [homeUrl, productsUrl, productUrl] = await Promise.all([
    buildAbsoluteRequestUrl(buildLocalizedPath("/", locale)),
    buildAbsoluteRequestUrl(buildLocalizedPath("/urunler", locale)),
    buildAbsoluteRequestUrl(localizedProductPath),
  ]);
  const jsonLd = variant ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.seo_description || product.shortDescription || product.description?.slice(0, 160) || "",
    image: product.images && product.images.length > 0 ? product.images[0] : null,
    url: productUrl,
    brand: {
      "@type": "Brand",
      name: STOREFRONT_RUNTIME.name,
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "TRY",
      price: variant.price,
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      availability: variant.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: STOREFRONT_RUNTIME.name,
      },
    },
    aggregateRating: product.rating ? {
      "@type": "AggregateRating",
      ratingValue: product.rating,
      reviewCount: product.reviewCount || 0,
    } : undefined,
    sku: variant.sku,
    category: product.category,
  } : null;

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: copy.breadcrumbHome,
        item: homeUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: copy.breadcrumbProducts,
        item: productsUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: productUrl,
      },
    ],
  };

  return (
    <>
      {/* JSON-LD Schema */}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      
      {/* Product Detail Client Component */}
      <ProductDetailClient
        slug={baseSlug}
        initialProduct={product}
        initialRelatedProducts={relatedProducts}
        initialVariantIndex={selectedVariantIndex}
      />
    </>
  );
}
