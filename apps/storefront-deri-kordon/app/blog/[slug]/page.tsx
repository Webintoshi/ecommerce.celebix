import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Clock, Eye, Share2 } from "lucide-react";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { getRelatedPosts, mapBlogRow, mapBlogRows } from "@/lib/blog-content";
import { getPostBySlug, getPublishedPosts } from "@/lib/db/blog";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { formatDate } from "@/lib/utils";

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await getPostBySlug(slug);

  if (!row) {
    notFound();
  }

  const post = mapBlogRow(row);
  const relatedPosts = getRelatedPosts(mapBlogRows(await getPublishedPosts()), post);
  const category = BLOG_CATEGORIES.find((item) => item.id === post.category);

  return (
    <div className="min-h-screen">
      <div className="bg-gray-50 py-4">
        <div className="container mx-auto px-4">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-gray-600 transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Blog&apos;a Don
          </Link>
        </div>
      </div>

      <article className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-4">
            <Link
              href={`/blog/kategori/${category?.slug ?? "haberler"}`}
              className="inline-block rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {category?.icon} {category?.name ?? "Blog"}
            </Link>
          </div>

          <h1 className="mb-6 text-4xl font-bold text-gray-900 md:text-5xl">{post.title}</h1>

          <div className="mb-8 flex flex-wrap items-center gap-6 text-gray-600">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <span>{formatDate(post.publishedAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              <span>{post.readTime} dakika okuma</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              <span>{post.views} goruntulenme</span>
            </div>
          </div>

          <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-8">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
                {post.author.name.charAt(0)}
              </div>
              <div>
                <p className="text-lg font-semibold text-gray-900">{post.author.name}</p>
                <p className="text-gray-600">{post.author.role}</p>
              </div>
            </div>
            <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 transition-colors hover:bg-gray-50">
              <Share2 className="h-4 w-4" />
              Paylas
            </button>
          </div>

          <div className="mb-12 flex aspect-video items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 text-8xl">
            {category?.icon ?? "📰"}
          </div>

          <div
            className="prose prose-lg mb-12 max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(post.content || "") }}
          />

          {post.tags.length > 0 && (
            <div className="mb-12 flex flex-wrap gap-2 border-b border-gray-200 pb-12">
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {relatedPosts.length > 0 && (
            <div>
              <h2 className="mb-6 text-2xl font-bold text-gray-900">Ilgili Yazilar</h2>
              <div className="grid gap-6 md:grid-cols-3">
                {relatedPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost.id}
                    href={`/blog/${relatedPost.slug}`}
                    className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 text-4xl">
                      {BLOG_CATEGORIES.find((item) => item.id === relatedPost.category)?.icon ?? "📰"}
                    </div>
                    <div className="p-4">
                      <h3 className="mb-2 line-clamp-2 font-semibold text-gray-900">{relatedPost.title}</h3>
                      <p className="line-clamp-2 text-sm text-gray-600">{relatedPost.excerpt}</p>
                      <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        <span>{relatedPost.readTime} dk</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
