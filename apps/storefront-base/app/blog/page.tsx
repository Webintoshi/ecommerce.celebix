import Link from "next/link";
import { Calendar, Clock, Eye, ArrowRight } from "lucide-react";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { mapBlogRows } from "@/lib/blog-content";
import { getPublishedPosts } from "@/lib/db/blog";
import { formatDate } from "@/lib/utils";

export default async function BlogPage() {
  const posts = mapBlogRows(await getPublishedPosts());

  return (
    <div className="min-h-screen">
      <div className="bg-primary py-16 text-primary-foreground">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="mb-6 text-4xl font-bold md:text-5xl">Blog</h1>
            <p className="text-xl text-primary-foreground/90">
              Saglikli yasam, beslenme ve lezzetli tarifler hakkinda her sey
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        <div className="mb-12">
          <h2 className="mb-6 text-2xl font-bold text-primary">Kategoriler</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
            {BLOG_CATEGORIES.map((category) => (
              <Link
                key={category.id}
                href={`/blog/kategori/${category.slug}`}
                className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 text-4xl">{category.icon}</div>
                <h3 className="mb-1 font-semibold text-gray-900">{category.name}</h3>
                <p className="text-xs text-gray-600">{category.description}</p>
              </Link>
            ))}
          </div>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center text-gray-600">
            Henuz yayinlanmis blog yazisi yok.
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <article
                key={post.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <Link href={`/blog/${post.slug}`}>
                  <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-primary/10 to-secondary/10 text-6xl">
                    {post.category === "saglik" && "❤"}
                    {post.category === "tarifler" && "🍽️"}
                    {post.category === "beslenme" && "🥗"}
                    {post.category === "yasam" && "🌟"}
                    {post.category === "haberler" && "📰"}
                  </div>
                </Link>

                <div className="p-6">
                  <div className="mb-3">
                    <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                      {BLOG_CATEGORIES.find((category) => category.id === post.category)?.name}
                    </span>
                  </div>

                  <Link href={`/blog/${post.slug}`}>
                    <h2 className="mb-3 line-clamp-2 text-xl font-bold text-gray-900 transition-colors hover:text-primary">
                      {post.title}
                    </h2>
                  </Link>

                  <p className="mb-4 line-clamp-3 text-gray-600">{post.excerpt}</p>

                  <div className="mb-4 flex items-center gap-4 text-sm text-gray-500">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(post.publishedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      <span>{post.readTime} dk</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      <span>{post.views}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                      {post.author.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{post.author.name}</p>
                      <p className="text-xs text-gray-500">{post.author.role}</p>
                    </div>
                  </div>

                  <Link
                    href={`/blog/${post.slug}`}
                    className="mt-4 inline-flex items-center gap-2 font-medium text-primary transition-all hover:gap-3"
                  >
                    Devamini Oku
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
