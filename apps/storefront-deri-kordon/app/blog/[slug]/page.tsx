import { notFound } from "next/navigation";
import { BlogArticlePage } from "@/components/blog/BlogArticlePage";
import { getRelatedPosts, mapBlogRow, mapBlogRows } from "@/lib/blog-content";
import { getPostBySlug, getPublishedPosts } from "@/lib/db/blog";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

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
