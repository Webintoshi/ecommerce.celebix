import type { Metadata } from "next";
import { BlogLandingPage } from "@/components/blog/BlogLandingPage";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";
import { buildStorePageMetadata } from "@/lib/seo-metadata";
import { getRequestLocale } from "@/lib/request-locale";
import { getStorefrontProfile } from "@/lib/storefront-profile";
import { translateSeoStrings } from "@/lib/translation";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const profile = await getStorefrontProfile();
  const [title, description] = await translateSeoStrings(
    [
      `${profile.name} Blog | Deri Bakimi ve Saat Kayisi Rehberleri`,
      "Hakiki deri bakimi, Apple Watch kayisi secimi, atolye notlari ve premium aksesuar rehberleri.",
    ],
    locale,
    "blog-index-seo",
  );

  return buildStorePageMetadata({
    locale,
    pathname: "/blog",
    title,
    description,
    keywords: [
      "deri bakimi",
      "apple watch kayisi rehberi",
      "hakiki deri bakim rehberi",
      "deri aksesuar blog",
    ],
  });
}

export default async function BlogPage() {
  const [rows, profile] = await Promise.all([
    getPublishedPosts(),
    getStorefrontProfile(),
  ]);
  const posts = mapBlogRows(rows);

  return <BlogLandingPage posts={posts} profile={profile} />;
}
