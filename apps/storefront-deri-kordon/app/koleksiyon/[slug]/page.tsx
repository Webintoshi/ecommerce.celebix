import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { runCategoriesQuery } from "@/lib/categories-query-compat";
import { runProductsQuery } from "@/lib/products-query-compat";
import { createServerClient } from "@/lib/supabase";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";
import type { Category, CategoryFAQ } from "@/types/category";
import type { Product, ProductVariant } from "@/types/product";
import { inferLegacySubcategorySlug, readCelebixCategoryHierarchyMetadata } from "@celebix/platform-config";
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

function buildAbsoluteUrl(path: string) {
  return new URL(path, STOREFRONT_RUNTIME.siteUrl).toString();
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
        .select("slug")
        .eq("parent_id", category.id)
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

    const childSlugs = (data || [])
      .map((item) => item.slug)
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    return Array.from(new Set([category.slug, ...childSlugs]));
  } catch (error) {
    console.error("Unexpected error fetching child categories:", error);
    return [category.slug];
  }
}

function transformVariant(variant: DBVariant): ProductVariant {
  return {
    id: variant.id,
    name: variant.name,
    weight: variant.weight ?? "0",
    price: Number(variant.price || 0),
    originalPrice: variant.original_price ? Number(variant.original_price) : undefined,
    stock: Number(variant.stock || 0),
    sku: variant.sku || "",
    barcode: variant.barcode || undefined,
    groupName: variant.group_name || undefined,
    images: variant.images || [],
    unit: (variant.unit as ProductVariant["unit"]) || "adet",
  };
}

function resolveProductCategorySlugs(product: DBProduct) {
  const storedHierarchy = readCelebixCategoryHierarchyMetadata(product.shopify_metadata);
  return {
    category: product.category || storedHierarchy.categorySlug || "",
    subcategory:
      inferLegacySubcategorySlug({
        category: product.category || storedHierarchy.categorySlug,
        subcategory: product.subcategory,
        name: product.name,
        slug: product.slug,
        tags: product.tags,
        metadata: product.shopify_metadata,
      }) || "",
  };
}

function transformProduct(product: DBProduct): Product {
  const resolvedHierarchy = resolveProductCategorySlugs(product);
  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description || "",
    shortDescription: product.short_description || "",
    category: ((resolvedHierarchy.category || "genel") as unknown) as Product["category"],
    subcategory: ((resolvedHierarchy.subcategory || "genel") as unknown) as Product["subcategory"],
    variants: (product.variants || []).map(transformVariant),
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

async function getProductsByCategory(category: Category): Promise<Product[]> {
  const supabase = createServerClient();
  const categorySlugs = await getCollectionSlugs(category);
  const categorySet = new Set(categorySlugs);

  try {
    const { data, error } = await runProductsQuery((includeIsActiveFilter) => {
      let query = supabase
        .from("products")
        .select("*, variants:product_variants(*, raw_attributes:attributes)");

      if (includeIsActiveFilter) {
        query = query.eq("is_active", true);
      }

      return query
        .or("status.eq.published,status.is.null")
        .order("created_at", { ascending: false });
    });

    if (error || !data) {
      console.error("Products fetch error:", error);
      return [];
    }

    return (data as DBProduct[])
      .filter((product) => {
        const resolvedHierarchy = resolveProductCategorySlugs(product);
        const categorySlug = resolvedHierarchy.category;
        const subcategorySlug = resolvedHierarchy.subcategory;
        return categorySet.has(categorySlug) || categorySet.has(subcategorySlug);
      })
      .map(transformProduct)
      .filter((product) => product.variants.length > 0);
  } catch (error) {
    console.error("Unexpected error fetching products:", error);
    return [];
  }
}

function generateBreadcrumbSchema(category: Category) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Ana Sayfa",
        item: buildAbsoluteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Ürünler",
        item: buildAbsoluteUrl("/urunler"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: category.name,
        item: buildAbsoluteUrl(`/${category.slug}`),
      },
    ],
  };
}

function generateCollectionSchema(category: Category, products: Product[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.seo_title || category.name,
    description: category.seo_description || category.description || category.name,
    url: buildAbsoluteUrl(`/${category.slug}`),
    mainEntity: {
      "@type": "ItemList",
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: buildAbsoluteUrl(`/urunler/${product.slug}`),
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

function generateOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Deri Kordon",
    url: STOREFRONT_RUNTIME.siteUrl,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return {
      title: "Kategori Bulunamadı | Deri Kordon",
      robots: { index: false, follow: false },
    };
  }

  const title = category.seo_title || `${category.name} | Deri Kordon`;
  const description =
    category.seo_description || category.description || `${category.name} kategorisindeki ürünleri keşfedin.`;

  return {
    title,
    description,
    alternates: {
      canonical: buildAbsoluteUrl(`/${category.slug}`),
    },
    openGraph: {
      title,
      description,
      url: buildAbsoluteUrl(`/${category.slug}`),
      type: "website",
      locale: "tr_TR",
      siteName: "Deri Kordon",
      images: category.image
        ? [
            {
              url: category.image,
              alt: category.name,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: category.image ? [category.image] : undefined,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const products = await getProductsByCategory(category);
  const breadcrumbSchema = generateBreadcrumbSchema(category);
  const collectionSchema = generateCollectionSchema(category, products);
  const faqSchema = generateFaqSchema(category.faq);
  const organizationSchema = generateOrganizationSchema();

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
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

      <nav className="border-b border-neutral-200 bg-white" aria-label="Breadcrumb">
        <div className="container-premium py-3">
          <ol className="flex items-center gap-2 text-sm text-neutral-500">
            <li>
              <Link href="/" className="transition-colors hover:text-neutral-900">
                Ana Sayfa
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/urunler" className="transition-colors hover:text-neutral-900">
                Ürünler
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="font-medium text-neutral-900" aria-current="page">
              {category.name}
            </li>
          </ol>
        </div>
      </nav>

      <main className="container-premium py-10 md:py-12">
        <CollectionProductsClient products={products} />
      </main>

      {category.faq && category.faq.length > 0 ? (
        <section className="mt-8 border-t border-neutral-200 bg-white">
          <div className="container-premium py-12">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight text-neutral-900">
              Sıkça sorulan sorular
            </h2>
            <div className="max-w-3xl space-y-4">
              {category.faq.map((item, index) => (
                <details key={index} className="rounded-2xl border border-neutral-200 bg-[#F8F8F8] p-5">
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
