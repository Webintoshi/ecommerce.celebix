import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runCategoriesQuery } from "@/lib/categories-query-compat";
import { runProductsQuery } from "@/lib/products-query-compat";
import { getProductListingOrderPositions } from "@/lib/db/settings";
import { getProductDiscountRulesMap } from "@/lib/product-pricing";
import { createServerClient } from "@/lib/supabase";
import { getRequestLocale } from "@/lib/request-locale";
import { buildLocalizedPath, getLocalizedCopy, type StorefrontLocale } from "@/lib/i18n";
import { getLocaleRoutingConfig } from "@/lib/locale-routing";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestOrigin } from "@/lib/request-origin";
import {
  getVariantAttributeRegistry,
  hydrateProductVariantSnapshots,
} from "@/lib/variant-attribute-hydration";
import type { Category, CategoryFAQ } from "@/types/category";
import type { Product, ProductVariant } from "@/types/product";
import {
  inferLegacySubcategorySlug,
  readCelebixCategoryHierarchyMetadata,
  sortProductsByListingOrder,
} from "@celebix/platform-config";
import { resolveVariantDisplayPricing, type ProductDiscountRule } from "@celebix/platform-config/src/product-pricing";
import { translateCategoryRecord, translateProductCollection } from "@/lib/translation";
import CollectionProductsClient from "./CollectionProductsClient";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface DBVariant {
  id: string;
  product_id: string;
  name: string;
  sku: string | null;
  price: number;
  original_price: number | null;
  stock: number;
  weight: string | null;
  unit: string | null;
  barcode: string | null;
  images: string[] | null;
  group_name: string | null;
  attributes?: Array<Record<string, unknown>>;
  raw_attributes?: Array<Record<string, unknown>>;
}

interface DBProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  images: string[] | null;
  images_v2?: Array<{ url?: string } | string> | null;
  category: string | null;
  subcategory: string | null;
  tags: string[] | null;
  is_featured: boolean | null;
  is_bestseller: boolean | null;
  is_active: boolean | null;
  is_new: boolean | null;
  vegan: boolean | null;
  gluten_free: boolean | null;
  sugar_free: boolean | null;
  high_protein: boolean | null;
  rating: number | null;
  review_count: number | null;
  seo_title: string | null;
  seo_description: string | null;
  shopify_metadata?: Record<string, unknown> | null;
  variants: DBVariant[] | null;
}

type ResolvedLocaleRouting = Awaited<ReturnType<typeof getLocaleRoutingConfig>>;

function buildAbsoluteUrl(
  path: string,
  locale: StorefrontLocale,
  origin: string,
  routing: ResolvedLocaleRouting,
) {
  return new URL(buildLocalizedPath(path, locale, routing), origin).toString();
}

async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const supabase = createServerClient();

  try {
    const { data, error } = await runCategoriesQuery((includeIsActiveFilter) => {
      let query = supabase.from("categories").select("*").eq("slug", slug);

      if (includeIsActiveFilter) {
        query = query.eq("is_active", true);
      }

      return query.single();
    });

    if (error || !data) {
      console.error("Category fetch error:", error);
      return null;
    }

    return data as Category;
  } catch (error) {
    console.error("Unexpected error fetching category:", error);
    return null;
  }
}

async function getCollectionSlugs(category: Category): Promise<string[]> {
  const supabase = createServerClient();

  try {
    const { data, error } = await runCategoriesQuery((includeIsActiveFilter) => {
      let query = supabase
        .from("categories")
        .select("id, slug, parent_id")
        .order("sort_order", { ascending: true });

      if (includeIsActiveFilter) {
        query = query.eq("is_active", true);
      }

      return query;
    });

    if (error) {
      console.error("Child categories fetch error:", error);
      return [category.slug];
    }

    const childrenByParent = new Map<string, Array<{ id: string; slug: string }>>();

    for (const item of data || []) {
      if (!item.parent_id || typeof item.slug !== "string" || item.slug.length === 0) {
        continue;
      }

      const siblings = childrenByParent.get(item.parent_id) || [];
      siblings.push({
        id: item.id,
        slug: item.slug,
      });
      childrenByParent.set(item.parent_id, siblings);
    }

    const visitedIds = new Set<string>([category.id]);
    const collectedSlugs = new Set<string>([category.slug]);
    const queue = [category.id];

    while (queue.length > 0) {
      const parentId = queue.shift();
      if (!parentId) {
        continue;
      }

      for (const child of childrenByParent.get(parentId) || []) {
        if (visitedIds.has(child.id)) {
          continue;
        }

        visitedIds.add(child.id);
        queue.push(child.id);

        if (child.slug) {
          collectedSlugs.add(child.slug);
        }
      }
    }

    return Array.from(collectedSlugs);
  } catch (error) {
    console.error("Unexpected error fetching child categories:", error);
    return [category.slug];
  }
}

function transformVariant(
  variant: DBVariant,
  rules: ProductDiscountRule[] = [],
): ProductVariant {
  const pricing = resolveVariantDisplayPricing(
    {
      price: Number(variant.price || 0),
      originalPrice: variant.original_price ? Number(variant.original_price) : undefined,
    },
    rules,
  );

  return {
    id: variant.id,
    name: variant.name,
    weight: variant.weight ?? "0",
    price: pricing.price,
    originalPrice: pricing.originalPrice,
    stock: Number(variant.stock || 0),
    sku: variant.sku || "",
    barcode: variant.barcode || undefined,
    groupName: variant.group_name || undefined,
    images: variant.images || [],
    attributes: variant.attributes,
    raw_attributes: variant.raw_attributes,
    unit: (variant.unit as ProductVariant["unit"]) || "adet",
  };
}

function resolveProductCategorySlugs(product: DBProduct) {
  const storedHierarchy = readCelebixCategoryHierarchyMetadata(product.shopify_metadata);
  const pathSlugs = storedHierarchy.path
    .map((segment) => segment.slug)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  const category = product.category || storedHierarchy.categorySlug || pathSlugs[0] || "";
  const subcategory =
    inferLegacySubcategorySlug({
      category: category || storedHierarchy.categorySlug,
      subcategory: product.subcategory,
      name: product.name,
      slug: product.slug,
      tags: product.tags,
      metadata: product.shopify_metadata,
    }) ||
    (pathSlugs.length > 1 ? pathSlugs[pathSlugs.length - 1] || "" : "");
  const normalizedPathSlugs =
    pathSlugs.length > 0
      ? pathSlugs
      : [category, ...(subcategory && subcategory !== category ? [subcategory] : [])].filter(Boolean);

  return {
    category,
    subcategory,
    pathSlugs: normalizedPathSlugs,
  };
}

function transformProduct(
  product: DBProduct,
  attributeRegistry: Awaited<ReturnType<typeof getVariantAttributeRegistry>>,
  rules: ProductDiscountRule[] = [],
): Product {
  const resolvedHierarchy = resolveProductCategorySlugs(product);
  const hydratedVariants = hydrateProductVariantSnapshots(product.variants || [], attributeRegistry);

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    shortDescription: product.short_description || "",
    category: ((resolvedHierarchy.category || "genel") as unknown) as Product["category"],
    subcategory: ((resolvedHierarchy.subcategory || "genel") as unknown) as Product["subcategory"],
    variants: hydratedVariants.map((variant) => transformVariant(variant, rules)),
    images:
      product.images && product.images.length > 0
        ? product.images
        : (product.images_v2 || [])
            .map((image) => (typeof image === "string" ? image : image?.url || ""))
            .filter((image) => image.length > 0),
    tags: product.tags || [],
    vegan: Boolean(product.vegan),
    glutenFree: Boolean(product.gluten_free),
    sugarFree: Boolean(product.sugar_free),
    highProtein: Boolean(product.high_protein),
    rating: Number(product.rating || 0),
    reviewCount: Number(product.review_count || 0),
    featured: Boolean(product.is_featured),
    new: Boolean(product.is_new),
    isActive: product.is_active !== false,
    seoTitle: product.seo_title || undefined,
    seoDescription: product.seo_description || undefined,
    isBestseller: Boolean(product.is_bestseller),
  };
}

async function getProductsByCategory(category: Category, locale: StorefrontLocale): Promise<Product[]> {
  const supabase = createServerClient();
  const categorySlugs = await getCollectionSlugs(category);
  const categorySet = new Set(categorySlugs);

  try {
    const [{ data, error }, attributeRegistry, productListingOrder] = await Promise.all([
      runProductsQuery((includeIsActiveFilter) => {
        let query = supabase
          .from("products")
          .select("*, variants:product_variants(*, raw_attributes:attributes)");

        if (includeIsActiveFilter) {
          query = query.eq("is_active", true);
        }

        return query.or("status.eq.published,status.is.null").order("created_at", { ascending: false });
      }),
      getVariantAttributeRegistry(),
      getProductListingOrderPositions(),
    ]);

    if (error || !data) {
      console.error("Products fetch error:", error);
      return [];
    }

    const matchingProducts = (data as DBProduct[])
      .filter((product) => {
        const resolvedHierarchy = resolveProductCategorySlugs(product);
        return (
          resolvedHierarchy.pathSlugs.some((slug) => categorySet.has(slug)) ||
          categorySet.has(resolvedHierarchy.category) ||
          categorySet.has(resolvedHierarchy.subcategory)
        );
      });

    const orderedProducts = sortProductsByListingOrder(matchingProducts, productListingOrder);
    const discountRulesMap = await getProductDiscountRulesMap(
      supabase,
      orderedProducts.map((product) => product.id),
    );

    const translatedProducts = await translateProductCollection(orderedProducts as DBProduct[], locale);

    return translatedProducts
      .map((product) => transformProduct(product as DBProduct, attributeRegistry, discountRulesMap[String(product.id)] || []))
      .filter((product) => product.variants.length > 0);
  } catch (error) {
    console.error("Unexpected error fetching products:", error);
    return [];
  }
}

function generateBreadcrumbSchema(
  category: Category,
  locale: StorefrontLocale,
  copy: ReturnType<typeof getLocalizedCopy>,
  origin: string,
  routing: ResolvedLocaleRouting,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: copy.breadcrumbHome,
        item: buildAbsoluteUrl("/", locale, origin, routing),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: copy.breadcrumbProducts,
        item: buildAbsoluteUrl("/urunler", locale, origin, routing),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: category.name,
        item: buildAbsoluteUrl(`/${category.slug}`, locale, origin, routing),
      },
    ],
  };
}

function generateCollectionSchema(
  category: Category,
  products: Product[],
  locale: StorefrontLocale,
  origin: string,
  routing: ResolvedLocaleRouting,
) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.seo_title || category.name,
    description: category.seo_description || category.description || category.name,
    url: buildAbsoluteUrl(`/${category.slug}`, locale, origin, routing),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: buildAbsoluteUrl(`/urunler/${product.slug}`, locale, origin, routing),
      })),
    },
  };
}

function generateFaqSchema(faq: CategoryFAQ[] | null) {
  if (!faq || faq.length === 0) {
    return null;
  }

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function generateOrganizationSchema(origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Alpler Spor",
    url: origin,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return buildStorePageMetadata({
      locale,
      pathname: `/${slug}`,
      title: copy.missingCategoryTitle,
      description: copy.missingCategoryDescription,
      noIndex: true,
    });
  }

  const translatedCategory = await translateCategoryRecord(category, locale);

  return buildStorePageMetadata({
    locale,
    pathname: `/${category.slug}`,
    title: translatedCategory.seo_title || translatedCategory.name,
    description:
      translatedCategory.seo_description ||
      translatedCategory.description ||
      `Alpler Spor ${translatedCategory.name} koleksiyonundaki ürünleri, stok ve teslimat bilgileriyle keşfedin.`,
    keywords: category.seo_keywords,
    image: translatedCategory.image,
    type: "website",
  });
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const translatedCategory = await translateCategoryRecord(category, locale);

  const [products, requestOrigin, routing] = await Promise.all([
    getProductsByCategory(category, locale),
    getRequestOrigin(),
    getLocaleRoutingConfig(),
  ]);

  const breadcrumbSchema = generateBreadcrumbSchema(
    translatedCategory,
    locale,
    copy,
    requestOrigin,
    routing,
  );
  const collectionSchema = generateCollectionSchema(
    translatedCategory,
    products,
    locale,
    requestOrigin,
    routing,
  );
  const faqSchema = generateFaqSchema(translatedCategory.faq);
  const organizationSchema = generateOrganizationSchema(requestOrigin);

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      {faqSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      ) : null}

      <nav className="border-b border-black/5 bg-white" aria-label="Breadcrumb">
        <div className="container-premium py-3">
          <ol className="flex items-center gap-2 text-sm text-neutral-500">
            <li>
              <Link
                href={buildLocalizedPath("/", locale, routing)}
                className="transition-colors hover:text-neutral-900"
              >
                {copy.breadcrumbHome}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={buildLocalizedPath("/urunler", locale, routing)}
                className="transition-colors hover:text-neutral-900"
              >
                {copy.breadcrumbProducts}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-neutral-900" aria-current="page">
              {translatedCategory.name}
            </li>
          </ol>
        </div>
      </nav>

      <main className="container-premium py-10 md:py-12">
        <CollectionProductsClient products={products} />
      </main>

      {translatedCategory.faq && translatedCategory.faq.length > 0 ? (
        <section className="mt-2 border-t border-neutral-200 bg-white">
          <div className="container-premium py-12">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-900">
              {copy.faqHeading}
            </h2>
            <div className="max-w-3xl space-y-4">
              {translatedCategory.faq.map((item, index) => (
                <details key={index} className="rounded-2xl border border-neutral-200 bg-[#F8FAFC] p-5">
                  <summary className="cursor-pointer list-none font-medium text-neutral-900">
                    {item.question}
                  </summary>
                  <p className="mt-3 leading-relaxed text-neutral-600">{item.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
