import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogLandingPage } from "@/components/blog/BlogLandingPage";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";
import { getRequestLocale } from "@/lib/request-locale";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { translateSeoStrings } from "@/lib/translation";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const { slug } = await params;
  const category = BLOG_CATEGORIES.find((item) => item.slug === slug);

  if (!category) {
    return buildStorePageMetadata({
      locale,
      pathname: `/blog/kategori/${slug}`,
      title: `${profile.name} Blog`,
      description: `${profile.name} blog kategorisi bulunamadi.`,
      noIndex: true,
    });
  }

  const [title, description] = await translateSeoStrings(
    [
      `${category.name} Yazilari | ${profile.name} Blog`,
      category.description,
    ],
    locale,
    `blog-category-${category.slug}-seo`,
  );

  return buildStorePageMetadata({
    locale,
    pathname: `/blog/kategori/${category.slug}`,
    title,
    description,
    keywords: [category.name, category.slug, `${profile.name} blog`],
  });
}

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [rows, profile] = await Promise.all([
    getPublishedPosts(),
    getStorefrontProfile(),
  ]);
  const posts = mapBlogRows(rows);
  const category = BLOG_CATEGORIES.find((item) => item.slug === slug);

  if (!category) {
    notFound();
  }

  const filteredPosts = posts.filter((post) => post.category === category.id);

  if (filteredPosts.length === 0) {
    notFound();
  }

  return <BlogLandingPage posts={filteredPosts} profile={profile} activeCategorySlug={slug} />;
}
