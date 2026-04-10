import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/product/ProductDetailClient";
import { getProductBySlug } from "@/lib/products";
import { createServerClient } from "@/lib/supabase";
import { parseProductSlug, findVariantIndex } from "@/lib/slug-parser";
import { findPreferredVariantIndex } from "@/lib/variant-selection";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { buildAbsoluteRequestUrl } from "@/lib/request-origin";
import { getRequestLocale } from "@/lib/request-locale";
import { buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

function isMissingProductVariantAttributeRelation(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("message" in error)) {
    return false;
  }

  const message = String(error.message ?? "");
  return /relationship between 'product_variants' and 'product_variant_attributes'/i.test(
    message,
  );
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const { slug } = await params;
  const { baseSlug } = parseProductSlug(slug);
  const product = await getProductBySlug(baseSlug);

  if (!product) {
    return buildStorePageMetadata({
      locale,
      pathname: `/urunler/${baseSlug}`,
      title: copy.missingProductTitle,
      description: copy.missingProductDescription,
      noIndex: true,
    });
  }

  return buildStorePageMetadata({
    locale,
    pathname: `/urunler/${baseSlug}`,
    title: product.seo_title || product.name,
    description:
      product.seo_description ||
      product.shortDescription ||
      product.description?.slice(0, 160) ||
      "",
    keywords: product.tags,
    image: product.images && product.images.length > 0 ? product.images[0] : null,
    type: "website",
  });
}

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: urlSlug } = await params;
  const parsedSlug = parseProductSlug(urlSlug);
  const { baseSlug } = parsedSlug;

  let product = null;
  let relatedProducts: any[] = [];

  try {
    const supabase = createServerClient();
    const { data: dbProducts, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("slug", baseSlug)
      .eq("is_active", true)
      .or("status.eq.published,status.is.null")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (productError) {
      console.error("Product fetch error:", productError);
    } else if (dbProducts?.[0]) {
      const dbProduct = dbProducts[0];
      const { data: variants, error: variantsError } = await fetchProductVariants(
        supabase,
        dbProduct.id,
      );

      if (variantsError) {
        console.error("Variants fetch error:", variantsError);
      }

      const { data: allAttributeValues } = await supabase
        .from("variant_attribute_values")
        .select(`
          id,
          value,
          color_code,
          image_url,
          attribute:variant_attributes(id, name)
        `);

      let images: string[] = [];
      if (
        dbProduct.images_v2 &&
        Array.isArray(dbProduct.images_v2) &&
        dbProduct.images_v2.length > 0
      ) {
        images = dbProduct.images_v2.map((img: any) => img?.url).filter(Boolean);
      }

      if (images.length === 0 && dbProduct.images && Array.isArray(dbProduct.images)) {
        images = dbProduct.images.filter(
          (img: any) => typeof img === "string" && img.length > 0,
        );
      }

      const transformedVariants =
        variants?.map((variant: any) => {
          let attrs = Array.isArray(variant.linked_attributes)
            ? variant.linked_attributes.map((attribute: any) => ({
                ...attribute.attribute_value,
                attribute: attribute.attribute_value?.attribute,
              }))
            : [];

          if (attrs.length === 0 && Array.isArray(variant.raw_attributes)) {
            attrs = variant.raw_attributes;
          }

          if (attrs.length === 0 && allAttributeValues) {
            const matchedValue = allAttributeValues.find(
              (attributeValue: any) =>
                attributeValue.value?.toLowerCase() === variant.name?.toLowerCase(),
            );
            if (matchedValue) {
              attrs = [
                {
                  id: matchedValue.id,
                  value: matchedValue.value,
                  color_code: matchedValue.color_code,
                  image_url: matchedValue.image_url,
                  attribute: matchedValue.attribute,
                },
              ];
            }
          }

          return {
            ...variant,
            originalPrice: variant.original_price,
            attributes: attrs,
          };
        }) || [];

      product = {
        ...dbProduct,
        images,
        variants: transformedVariants,
      } as any;
    }
  } catch (error) {
    console.error("Failed to fetch product from Supabase:", error);
  }

  if (!product) {
    product = getProductBySlug(baseSlug);
  }

  if (!product) {
    notFound();
  }

  let selectedVariantIndex = 0;
  if (product.variants && product.variants.length > 0) {
    selectedVariantIndex =
      parsedSlug.variantWeight || parsedSlug.variantId
        ? findVariantIndex(product.variants, parsedSlug)
        : findPreferredVariantIndex(product.variants);
  }

  try {
    const { getRelatedProducts } = await import("@/lib/products");
    relatedProducts = getRelatedProducts(product, 4);
  } catch {
    relatedProducts = [];
  }

  const variant = product.variants?.[selectedVariantIndex || 0];
  const storeName = STOREFRONT_RUNTIME.name;
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const [homeUrl, productsUrl, productUrl] = await Promise.all([
    buildAbsoluteRequestUrl(buildLocalizedPath("/", locale)),
    buildAbsoluteRequestUrl(buildLocalizedPath("/urunler", locale)),
    buildAbsoluteRequestUrl(buildLocalizedPath(`/urunler/${baseSlug}`, locale)),
  ]);

  const jsonLd = variant
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description:
          product.seo_description ||
          product.shortDescription ||
          product.description?.slice(0, 160) ||
          "",
        image: product.images && product.images.length > 0 ? product.images[0] : null,
        url: productUrl,
        brand: {
          "@type": "Brand",
          name: storeName,
        },
        offers: {
          "@type": "Offer",
          url: productUrl,
          priceCurrency: "TRY",
          price: variant.price,
          priceValidUntil: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000,
          ).toISOString().split("T")[0],
          availability:
            variant.stock > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          seller: {
            "@type": "Organization",
            name: storeName,
          },
        },
        aggregateRating: product.rating
          ? {
              "@type": "AggregateRating",
              ratingValue: product.rating,
              reviewCount: product.reviewCount || 0,
            }
          : undefined,
        sku: variant.sku,
        category: product.category,
      }
    : null;

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
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProductDetailClient
        slug={baseSlug}
        initialProduct={product}
        initialRelatedProducts={relatedProducts}
        initialVariantIndex={selectedVariantIndex}
      />
    </>
  );
}
