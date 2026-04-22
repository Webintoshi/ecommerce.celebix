"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3 } from "lucide-react";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { formatDate } from "@/lib/utils";
import type { StorefrontProfile } from "@/lib/storefront-profile";
import type { BlogPost } from "@/types/blog";

type CategorySummary = {
  id: BlogPost["category"];
  slug: string;
  name: string;
  icon: string;
  description: string;
  count: number;
};

function buildCategorySummaries(posts: BlogPost[]): CategorySummary[] {
  return BLOG_CATEGORIES.map((category) => ({
    ...category,
    count: posts.filter((post) => post.category === category.id).length,
  })).filter((category) => category.count > 0);
}

function BlogCover({
  post,
  priority = false,
  className,
}: {
  post: BlogPost;
  priority?: boolean;
  className?: string;
}) {
  const imageUrl = resolveStorefrontAssetUrl(post.coverImage);

  if (imageUrl) {
    return (
      <div className={`relative overflow-hidden ${className || ""}`}>
        <Image
          src={imageUrl}
          alt={post.title}
          fill
          priority={priority}
          unoptimized
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-neutral-100 ${className || ""}`}
    >
      <span className="text-4xl text-neutral-300">•</span>
    </div>
  );
}

export function BlogLandingPage({
  posts,
  profile,
  activeCategorySlug,
}: {
  posts: BlogPost[];
  profile: StorefrontProfile;
  activeCategorySlug?: string;
}) {
  const { locale } = useStorefrontRoute();
  const categorySummaries = buildCategorySummaries(posts);
  const activeCategory = activeCategorySlug
    ? categorySummaries.find((category) => category.slug === activeCategorySlug) || null
    : null;
  
  const featuredPost = posts.find((post) => post.featured) || posts[0] || null;
  const otherPosts = posts.filter((post) => post.id !== featuredPost?.id);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="border-b border-neutral-100">
        <div className="mx-auto max-w-6xl px-6 py-20 lg:px-8 lg:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              {activeCategory ? activeCategory.name : profile.name}
            </p>
            <h1 className="mt-4 text-4xl font-light tracking-tight text-neutral-900 sm:text-5xl lg:text-6xl">
              {activeCategory ? `${activeCategory.name}` : "Journal"}
            </h1>
            <p className="mt-6 text-base leading-relaxed text-neutral-500">
              {activeCategory 
                ? activeCategory.description 
                : "Deri işçiliği, ürün bakımı ve marka hikayeleri."}
            </p>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      {categorySummaries.length > 0 && (
        <section className="border-b border-neutral-100">
          <div className="mx-auto max-w-6xl px-6 py-6 lg:px-8">
            <div className="flex flex-wrap gap-2">
              <Link
                href={buildLocalizedPath("/blog", locale)}
                className={`rounded-full px-4 py-2 text-sm transition-colors ${
                  !activeCategory
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                Tümü
              </Link>
              {categorySummaries.map((category) => (
                <Link
                  key={category.id}
                  href={buildLocalizedPath(`/blog/kategori/${category.slug}`, locale)}
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    activeCategory?.slug === category.slug
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-50 text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Content */}
      <section className="mx-auto max-w-6xl px-6 py-16 lg:px-8 lg:py-20">
        {posts.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-neutral-400">Henüz yayınlanmış yazı bulunmuyor.</p>
          </div>
        ) : (
          <div className="space-y-20">
            {/* Featured Post */}
            {featuredPost && (
              <article className="group">
                <Link href={buildLocalizedPath(`/blog/${featuredPost.slug}`, locale)} className="block">
                  <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
                    <BlogCover 
                      post={featuredPost} 
                      priority 
                      className="aspect-[4/3] rounded-lg"
                    />
                    <div className="flex flex-col justify-center">
                      <div className="flex items-center gap-3 text-xs text-neutral-400">
                        <span className="font-medium uppercase tracking-wider text-neutral-900">
                          {BLOG_CATEGORIES.find((item) => item.id === featuredPost.category)?.name}
                        </span>
                        <span>•</span>
                        <span>{formatDate(featuredPost.publishedAt)}</span>
                      </div>
                      <h2 className="mt-4 text-3xl font-light tracking-tight text-neutral-900 sm:text-4xl">
                        {featuredPost.title}
                      </h2>
                      <p className="mt-4 text-base leading-relaxed text-neutral-500 line-clamp-3">
                        {featuredPost.excerpt}
                      </p>
                      <div className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-neutral-900">
                        <span>Devamını oku</span>
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </div>
                    </div>
                  </div>
                </Link>
              </article>
            )}

            {/* Other Posts Grid */}
            {otherPosts.length > 0 && (
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {otherPosts.map((post) => (
                  <article key={post.id} className="group">
                    <Link href={buildLocalizedPath(`/blog/${post.slug}`, locale)} className="block">
                      <BlogCover 
                        post={post} 
                        className="aspect-[3/2] rounded-lg"
                      />
                      <div className="mt-5">
                        <div className="flex items-center gap-2 text-xs text-neutral-400">
                          <span className="font-medium uppercase tracking-wider text-neutral-500">
                            {BLOG_CATEGORIES.find((item) => item.id === post.category)?.name}
                          </span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock3 className="h-3 w-3" />
                            {post.readTime} dk
                          </span>
                        </div>
                        <h3 className="mt-3 text-lg font-medium tracking-tight text-neutral-900 line-clamp-2">
                          {post.title}
                        </h3>
                        <p className="mt-2 text-sm leading-relaxed text-neutral-500 line-clamp-2">
                          {post.excerpt}
                        </p>
                      </div>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
