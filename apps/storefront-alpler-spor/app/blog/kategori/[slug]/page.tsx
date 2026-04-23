import { notFound } from "next/navigation";
import { BlogLandingPage } from "@/components/blog/BlogLandingPage";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

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
