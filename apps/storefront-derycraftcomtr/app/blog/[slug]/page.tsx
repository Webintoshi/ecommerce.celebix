import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticlePage } from "@/components/blog/BlogArticlePage";
import { getRelatedPosts, mapBlogRow, mapBlogRows } from "@/lib/blog-content";
import { getPostBySlug, getPublishedPosts } from "@/lib/db/blog";
import { getRequestLocale } from "@/lib/request-locale";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const locale = await getRequestLocale();
  const { slug } = await params;
  const row = await getPostBySlug(slug);

  if (!row) {
    return buildStorePageMetadata({
      locale,
      pathname: `/blog/${slug}`,
      title: "Blog yazisi bulunamadi",
      description: "Talep edilen blog yazisi su anda yayinda degil.",
      noIndex: true,
    });
  }

  const post = mapBlogRow(row);

  return buildStorePageMetadata({
    locale,
    pathname: `/blog/${post.slug}`,
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    image: row.featured_image,
    type: "article",
    publishedTime: row.published_at || row.created_at,
    modifiedTime: row.published_at || row.created_at,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const row = await getPostBySlug(slug);

  if (!row) {
    notFound();
  }

  const post = mapBlogRow(row);
  const [allRows, profile] = await Promise.all([
    getPublishedPosts(),
    getStorefrontProfile(),
  ]);
  const relatedPosts = getRelatedPosts(mapBlogRows(allRows), post);

  return <BlogArticlePage post={post} relatedPosts={relatedPosts} profile={profile} />;
}
