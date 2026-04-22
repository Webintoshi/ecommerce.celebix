import { MetadataRoute } from "next";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";
import { INDEXABLE_LOCALES, buildLocalizedPath } from "@/lib/i18n";
import { runCategoriesQuery } from "@/lib/categories-query-compat";
import { runProductsQuery } from "@/lib/products-query-compat";
import { getRequestOrigin } from "@/lib/request-origin";
import { createServerClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type PublicProductRow = {
  slug: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

type PublicCategoryRow = {
  slug: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

function buildUrl(
  pathname: string,
  locale: (typeof INDEXABLE_LOCALES)[number],
  origin: string,
) {
  return new URL(buildLocalizedPath(pathname, locale), origin).toString();
}

function getIsoDate(value?: string | null) {
  const parsedDate = value ? new Date(value) : null;
  return parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date();
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const requestOrigin = await getRequestOrigin();
  let categoriesResult: { data: PublicCategoryRow[] | null } = { data: [] };
  let productsResult: { data: PublicProductRow[] | null } = { data: [] };
  let blogRows: Awaited<ReturnType<typeof getPublishedPosts>> = [];

  try {
    const supabase = createServerClient();

    [categoriesResult, productsResult, blogRows] = await Promise.all([
      runCategoriesQuery((includeIsActiveFilter) => {
        let query = supabase
          .from("categories")
          .select("slug, updated_at, created_at")
          .order("updated_at", { ascending: false });

        if (includeIsActiveFilter) {
          query = query.eq("is_active", true);
        }

        return query;
      }),
      runProductsQuery((includeIsActiveFilter) => {
        let query = supabase
          .from("products")
          .select("slug, updated_at, created_at")
          .order("updated_at", { ascending: false });

        if (includeIsActiveFilter) {
          query = query.eq("is_active", true);
        }

        return query.or("status.eq.published,status.is.null");
      }),
      getPublishedPosts().catch(() => []),
    ]);
  } catch (error) {
    console.error("Failed to build dynamic sitemap entries", error);
  }

  const staticRoutes = [
    { path: "/", changeFrequency: "daily" as const, priority: 1 },
    { path: "/hakkimizda", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/magazalarimiz", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/iletisim", changeFrequency: "monthly" as const, priority: 0.6 },
    { path: "/kurumsal-urunler", changeFrequency: "monthly" as const, priority: 0.7 },
    { path: "/urunler", changeFrequency: "weekly" as const, priority: 0.9 },
    { path: "/blog", changeFrequency: "weekly" as const, priority: 0.7 },
    { path: "/sss", changeFrequency: "monthly" as const, priority: 0.6 },
  ];

  const staticPages: MetadataRoute.Sitemap = INDEXABLE_LOCALES.flatMap((locale) =>
    staticRoutes.map((route) => ({
      url: buildUrl(route.path, locale, requestOrigin),
      lastModified: new Date(),
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
  );

  const categories = ((categoriesResult.data as PublicCategoryRow[] | null) || []).filter(
    (category): category is PublicCategoryRow & { slug: string } =>
      typeof category?.slug === "string" && category.slug.length > 0,
  );

  const categoryPages: MetadataRoute.Sitemap = INDEXABLE_LOCALES.flatMap((locale) =>
    categories.map((category) => ({
      url: buildUrl(`/${category.slug}`, locale, requestOrigin),
      lastModified: getIsoDate(category.updated_at || category.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  );

  const products = ((productsResult.data as PublicProductRow[] | null) || []).filter(
    (product): product is PublicProductRow & { slug: string } =>
      typeof product?.slug === "string" && product.slug.length > 0,
  );

  const productPages: MetadataRoute.Sitemap = INDEXABLE_LOCALES.flatMap((locale) =>
    products.map((product) => ({
      url: buildUrl(`/urunler/${product.slug}`, locale, requestOrigin),
      lastModified: getIsoDate(product.updated_at || product.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  );

  const posts = Array.isArray(blogRows) ? blogRows : [];
  const mappedPosts = mapBlogRows(posts);
  const categoryLastModified = new Map<string, Date>();

  for (const post of mappedPosts) {
    const normalizedSlug = typeof post.slug === "string" ? post.slug.trim() : "";
    if (!normalizedSlug) {
      continue;
    }

    const matchedCategory =
      BLOG_CATEGORIES.find((item) => item.id === post.category) ||
      BLOG_CATEGORIES.find((item) => item.slug === post.category);

    if (!matchedCategory) {
      continue;
    }

    const nextDate = post.updatedAt;
    const previousDate = categoryLastModified.get(matchedCategory.slug);

    if (!previousDate || nextDate > previousDate) {
      categoryLastModified.set(matchedCategory.slug, nextDate);
    }
  }

  const blogCategoryPages: MetadataRoute.Sitemap = INDEXABLE_LOCALES.flatMap((locale) =>
    Array.from(categoryLastModified.entries()).map(([categorySlug, lastModified]) => ({
      url: buildUrl(`/blog/kategori/${categorySlug}`, locale, requestOrigin),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  );

  const blogPostPages: MetadataRoute.Sitemap = INDEXABLE_LOCALES.flatMap((locale) =>
    posts
      .filter(
        (post): post is typeof post & { slug: string } =>
          typeof post?.slug === "string" && post.slug.trim().length > 0,
      )
      .map((post) => ({
        url: buildUrl(`/blog/${post.slug}`, locale, requestOrigin),
        lastModified: getIsoDate(post.updated_at || post.published_at || post.created_at),
        changeFrequency: "monthly" as const,
        priority: 0.6,
      })),
  );

  return [
    ...staticPages,
    ...categoryPages,
    ...productPages,
    ...blogCategoryPages,
    ...blogPostPages,
  ];
}
