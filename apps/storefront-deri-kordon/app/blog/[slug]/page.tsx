import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticlePage } from "@/components/blog/BlogArticlePage";
import { getRelatedPosts, mapBlogRow, mapBlogRows } from "@/lib/blog-content";
import { getPostBySlug, getPublishedPosts } from "@/lib/db/blog";
import { buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { buildAbsoluteRequestUrl } from "@/lib/request-origin";
import { getRequestLocale } from "@/lib/request-locale";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { resolveStorefrontDirectAssetUrl } from "@/lib/asset-url";
import { STOREFRONT_RUNTIME } from "@/lib/storefront-runtime";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const { slug } = await params;
  const row = await getPostBySlug(slug);

  if (!row) {
    return buildStorePageMetadata({
      locale,
      pathname: `/blog/${slug}`,
      title: `${profile.name} Blog`,
      description: "Aradiginiz blog yazisi bulunamadi.",
      noIndex: true,
    });
  }

  const post = mapBlogRow(row);

  return buildStorePageMetadata({
    locale,
    pathname: `/blog/${post.slug}`,
    title: `${post.title} | ${profile.name} Blog`,
    description: post.excerpt,
    keywords: [...post.tags, post.primaryKeyword],
    image: resolveStorefrontDirectAssetUrl(post.coverImage) || post.coverImage,
    type: "article",
    publishedTime: row.published_at || row.created_at,
    modifiedTime: row.updated_at || row.published_at || row.created_at,
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const locale = await getRequestLocale();
  const copy = getLocalizedCopy(locale);
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
  const [homeUrl, blogUrl, postUrl] = await Promise.all([
    buildAbsoluteRequestUrl(buildLocalizedPath("/", locale)),
    buildAbsoluteRequestUrl(buildLocalizedPath("/blog", locale)),
    buildAbsoluteRequestUrl(buildLocalizedPath(`/blog/${post.slug}`, locale)),
  ]);
  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    image: resolveStorefrontDirectAssetUrl(post.coverImage) || undefined,
    datePublished: row.published_at || row.created_at,
    dateModified: row.updated_at || row.published_at || row.created_at,
    mainEntityOfPage: postUrl,
    author: {
      "@type": "Person",
      name: post.author.name,
    },
    publisher: {
      "@type": "Organization",
      name: profile.name,
      url: STOREFRONT_RUNTIME.siteUrl,
    },
  };
  const breadcrumbSchema = {
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
        name: "Blog",
        item: blogUrl,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.title,
        item: postUrl,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <BlogArticlePage post={post} relatedPosts={relatedPosts} profile={profile} />
    </>
  );
}
