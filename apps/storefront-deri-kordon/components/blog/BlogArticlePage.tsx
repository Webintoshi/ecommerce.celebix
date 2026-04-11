"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock3, CalendarDays } from "lucide-react";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { formatDate } from "@/lib/utils";
import type { StorefrontProfile } from "@/lib/storefront-profile";
import type { BlogPost } from "@/types/blog";

export function BlogArticlePage({
  post,
  relatedPosts,
  profile,
}: {
  post: BlogPost;
  relatedPosts: BlogPost[];
  profile: StorefrontProfile;
}) {
  const category = BLOG_CATEGORIES.find((item) => item.id === post.category);
  const imageUrl = resolveStorefrontAssetUrl(post.coverImage);

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="border-b border-neutral-100">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link 
            href="/blog" 
            className="inline-flex items-center gap-2 text-sm text-neutral-500 transition-colors hover:text-neutral-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Blog
          </Link>
          <Link 
            href="/urunler" 
            className="text-sm text-neutral-500 transition-colors hover:text-neutral-900"
          >
            Ürünler
          </Link>
        </div>
      </nav>

      {/* Article Header */}
      <header className="mx-auto max-w-4xl px-6 pt-16 pb-8">
        <div className="flex items-center gap-3 text-xs text-neutral-400">
          <span className="font-medium uppercase tracking-wider text-neutral-900">
            {category?.name || "Blog"}
          </span>
          <span>•</span>
          <span>{formatDate(post.publishedAt)}</span>
          <span>•</span>
          <span className="flex items-center gap-1">
            <Clock3 className="h-3 w-3" />
            {post.readTime} dk
          </span>
        </div>

        <h1 className="mt-6 text-3xl font-light tracking-tight text-neutral-900 sm:text-4xl lg:text-5xl">
          {post.title}
        </h1>

        <p className="mt-6 text-lg leading-relaxed text-neutral-500">
          {post.excerpt}
        </p>
      </header>

      {/* Hero Image */}
      {imageUrl && (
        <div className="mx-auto max-w-5xl px-6">
          <div className="relative aspect-[2/1] overflow-hidden rounded-lg">
            <Image
              src={imageUrl}
              alt={post.title}
              fill
              priority
              unoptimized
              className="object-cover"
            />
          </div>
        </div>
      )}

      {/* Article Content */}
      <article className="mx-auto max-w-3xl px-6 py-16">
        <div
          className="prose prose-lg max-w-none prose-headings:font-normal prose-headings:tracking-tight prose-headings:text-neutral-900 prose-p:text-neutral-600 prose-p:leading-relaxed prose-a:text-neutral-900 prose-a:no-underline hover:prose-a:underline prose-strong:text-neutral-900 prose-li:text-neutral-600 prose-blockquote:border-l-neutral-200 prose-blockquote:text-neutral-500 prose-code:text-neutral-900 prose-code:bg-neutral-100"
          dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(post.content || "") }}
        />

        {/* Author */}
        <div className="mt-16 flex items-center gap-4 border-t border-neutral-100 pt-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-sm font-medium text-white">
            {post.author.name.charAt(0)}
          </div>
          <div>
            <p className="font-medium text-neutral-900">{post.author.name}</p>
            <p className="text-sm text-neutral-500">{post.author.role}</p>
          </div>
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span 
                key={tag} 
                className="rounded-full bg-neutral-50 px-3 py-1 text-xs text-neutral-600"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </article>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="border-t border-neutral-100">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-400">
              İlgili Yazılar
            </p>
            <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {relatedPosts.map((relatedPost) => {
                const relatedImage = resolveStorefrontAssetUrl(relatedPost.coverImage);
                const relatedCategory = BLOG_CATEGORIES.find((item) => item.id === relatedPost.category);
                
                return (
                  <article key={relatedPost.id} className="group">
                    <Link href={`/blog/${relatedPost.slug}`} className="block">
                      {relatedImage ? (
                        <div className="relative aspect-[3/2] overflow-hidden rounded-lg">
                          <Image
                            src={relatedImage}
                            alt={relatedPost.title}
                            fill
                            unoptimized
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                      ) : (
                        <div className="aspect-[3/2] rounded-lg bg-neutral-100" />
                      )}
                      <div className="mt-4">
                        <div className="flex items-center gap-2 text-xs text-neutral-400">
                          <span className="font-medium uppercase tracking-wider text-neutral-500">
                            {relatedCategory?.name}
                          </span>
                          <span>•</span>
                          <span>{formatDate(relatedPost.publishedAt)}</span>
                        </div>
                        <h3 className="mt-2 text-lg font-medium tracking-tight text-neutral-900 line-clamp-2">
                          {relatedPost.title}
                        </h3>
                      </div>
                    </Link>
                  </article>
                );
              })}
            </div>          </div>
        </section>
      )}
    </div>
  );
}
