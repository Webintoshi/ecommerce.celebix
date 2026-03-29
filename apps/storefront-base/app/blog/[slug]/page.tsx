import { notFound } from "next/navigation";
import Link from "next/link";
import { Calendar, Clock, Eye, ArrowLeft, Share2 } from "lucide-react";
import { getPostBySlug, getRelatedPosts, BLOG_CATEGORIES } from "@/lib/blog";
import { formatDate } from "@/lib/utils";
import { use } from "react";

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getRelatedPosts(post);
  const category = BLOG_CATEGORIES.find((c) => c.id === post.category);

  return (
    <div className="min-h-screen">
      {/* Back Button */}
      <div className="bg-gray-50 py-4">
        <div className="container mx-auto px-4">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-primary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Blog'a Dön
          </Link>
        </div>
      </div>

      {/* Article Header */}
      <article className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {/* Category */}
          <div className="mb-4">
            <Link
              href={`/blog/kategori/${category?.slug}`}
              className="inline-block px-3 py-1 bg-primary/10 text-primary text-sm font-medium rounded-full hover:bg-primary/20 transition-colors"
            >
              {category?.icon} {category?.name}
            </Link>
          </div>

          {/* Title */}
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            {post.title}
          </h1>

          {/* Meta Info */}
          <div className="flex flex-wrap items-center gap-6 text-gray-600 mb-8">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              <span>{formatDate(post.publishedAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              <span>{post.readTime} dakika okuma</span>
            </div>
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              <span>{post.views} görüntülenme</span>
            </div>
          </div>

          {/* Author */}
          <div className="flex items-center justify-between mb-8 pb-8 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xl">
                {post.author.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-lg">
                  {post.author.name}
                </p>
                <p className="text-gray-600">{post.author.role}</p>
              </div>
            </div>

            {/* Share Button */}
            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              <Share2 className="w-4 h-4" />
              Paylaş
            </button>
          </div>

          {/* Cover Image */}
          <div className="aspect-video bg-gradient-to-br from-primary/10 to-secondary/10 rounded-xl mb-12 flex items-center justify-center text-8xl">
            {category?.icon}
          </div>

          {/* Content */}
          <div className="prose prose-lg max-w-none mb-12">
            <div
              dangerouslySetInnerHTML={{
                __html: post.content.replace(/\n/g, "<br />"),
              }}
              className="whitespace-pre-wrap"
            />
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-12 pb-12 border-b border-gray-200">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>

          {/* Related Posts */}
          {relatedPosts.length > 0 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                İlgili Yazılar
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {relatedPosts.map((relatedPost) => (
                  <Link
                    key={relatedPost.id}
                    href={`/blog/${relatedPost.slug}`}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="aspect-video bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center text-4xl">
                      {BLOG_CATEGORIES.find((c) => c.id === relatedPost.category)
                        ?.icon}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                        {relatedPost.title}
                      </h3>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {relatedPost.excerpt}
                      </p>
                      <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
                        <Clock className="w-3 h-3" />
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
