import { BlogLandingPage } from "@/components/blog/BlogLandingPage";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";
import { getStorefrontProfile } from "@/lib/storefront-profile";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  const [rows, profile] = await Promise.all([
    getPublishedPosts(),
    getStorefrontProfile(),
  ]);
  const posts = mapBlogRows(rows);

  return <BlogLandingPage posts={posts} profile={profile} />;
}
