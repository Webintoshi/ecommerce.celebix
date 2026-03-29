import { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/product/ProductDetailClient";
import { getProductBySlug, getProductSlug } from "@/lib/products";
import { createServerClient } from "@/lib/supabase";
import { parseProductSlug, findVariantIndex, buildCanonicalUrl } from "@/lib/slug-parser";

// Generate metadata on the server side
export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params;

  // Parse URL slug to extract base slug
  const { baseSlug } = parseProductSlug(slug);

  // Get product from static data (fastest)
  const product = await getProductBySlug(baseSlug);
  
  if (!product) {
    return {
      title: "ÃœrÃ¼n BulunamadÄ± | Deri Kordon",
      description: "AradÄ±ÄŸÄ±nÄ±z Ã¼rÃ¼n bulunamadÄ±.",
    };
  }

  // Use seo_title/seo_description if available, fallback to defaults
  const seoTitle = product.seo_title || `${product.name} | Deri Kordon`;
  const seoDescription = product.seo_description || product.shortDescription || product.description?.slice(0, 160) || "";

  return {
    title: seoTitle,
    description: seoDescription,
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: seoTitle,
      description: seoDescription,
      images: product.images && product.images.length > 0 && product.images[0] 
        ? [product.images[0]] 
        : ['/images/og-default.jpg'],
      type: "website",
      locale: "tr_TR",
      siteName: "Deri Kordon",
      url: `https://deri-kordon.test/urunler/${slug}`,
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description: seoDescription,
      images: product.images && product.images.length > 0 && product.images[0] 
        ? [product.images[0]] 
        : ['/images/og-default.jpg'],
    },
    alternates: {
      canonical: buildCanonicalUrl(baseSlug),
    },
  };
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
    const { data: dbProduct, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("slug", baseSlug)
      .eq("is_active", true)
      .single();
    
    if (productError) {
      console.error('Product fetch error:', productError);
      supabaseError = productError;
    } else if (dbProduct) {
      // Ayri olarak varyantlari cek (nitelikleriyle birlikte)
      const { data: variants, error: variantsError } = await supabase
        .from("product_variants")
        .select(`
          *,
          attributes:product_variant_attributes(
            id,
            attribute_value:variant_attribute_values(
              id,
              attribute_id,
              value,
              color_code,
              image_url,
              attribute:variant_attributes(id, name)
            )
          )
        `)
        .eq("product_id", dbProduct.id);
      
      if (variantsError) {
        console.error('Variants fetch error:', variantsError);
        supabaseError = variantsError;
      }
      
      // Fetch all variant attribute values for matching (fallback)
      const { data: allAttributeValues } = await supabase
        .from('variant_attribute_values')
        .select(`
          id,
          value,
          color_code,
          image_url,
          attribute:variant_attributes(id, name)
        `);
      
      // Debug logging removed

      // Transform images_v2 to images format
      let images: string[] = [];
      
      if (dbProduct.images_v2 && Array.isArray(dbProduct.images_v2) && dbProduct.images_v2.length > 0) {
        images = dbProduct.images_v2.map((img: any) => img?.url).filter(Boolean);
      }
      
      // Fallback to images column if images_v2 is empty
      if (images.length === 0 && dbProduct.images && Array.isArray(dbProduct.images)) {
        images = dbProduct.images.filter((img: any) => typeof img === 'string' && img.length > 0);
      }
      
      // Transform variants with attributes
      const transformedVariants = variants?.map((v: any) => {
        // Get existing attributes from product_variant_attributes
        let attrs = v.attributes?.map((a: any) => ({
          ...a.attribute_value,
          attribute: a.attribute_value?.attribute
        })) || [];
        
        // FALLBACK: If no attributes, try to match variant name with attribute values
        if (attrs.length === 0 && allAttributeValues) {
          const matchedValue = allAttributeValues.find((av: any) => 
            av.value?.toLowerCase() === v.name?.toLowerCase()
          );
          if (matchedValue) {
            attrs = [{
              id: matchedValue.id,
              value: matchedValue.value,
              color_code: matchedValue.color_code,
              image_url: matchedValue.image_url,
              attribute: matchedValue.attribute
            }];
          }
        }
        
        return {
          ...v,
          originalPrice: v.original_price,
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
    supabaseError = error;
  }

  // 2. SECOND: Fallback to static data if Supabase fails
  if (!product) {
    product = getProductBySlug(baseSlug);  // Use baseSlug instead of urlSlug
  }

  // 3. If still no product, return 404
  if (!product) {
    notFound();
  }

  // 4. Determine selected variant based on URL
  let selectedVariantIndex = 0;
  if (product.variants && product.variants.length > 0) {
    selectedVariantIndex = findVariantIndex(product.variants, parsedSlug);
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

  // Generate JSON-LD Schema
  const variant = product.variants?.[selectedVariantIndex || 0];
  const jsonLd = variant ? {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.seo_description || product.shortDescription || product.description?.slice(0, 160) || "",
    image: product.images && product.images.length > 0 ? product.images[0] : null,
    url: `https://deri-kordon.test/urunler/${baseSlug}`,
    brand: {
      "@type": "Brand",
      name: "Deri Kordon",
    },
    offers: {
      "@type": "Offer",
      url: `https://deri-kordon.test/urunler/${baseSlug}`,
      priceCurrency: "TRY",
      price: variant.price,
      priceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      availability: variant.stock > 0
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: "Deri Kordon",
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
        name: "Ana Sayfa",
        item: "https://deri-kordon.test",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "ÃœrÃ¼nler",
        item: "https://deri-kordon.test/urunler",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: `https://deri-kordon.test/urunler/${baseSlug}`,
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

