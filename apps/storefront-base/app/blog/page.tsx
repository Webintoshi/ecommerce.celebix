import Link from "next/link";
import { Calendar, Clock, Eye, ArrowRight } from "lucide-react";
import { getBlogPosts, BLOG_CATEGORIES } from "@/lib/blog";
import { formatDate } from "@/lib/utils";

export default function BlogPage() {
  const posts = getBlogPosts();

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="bg-primary text-primary-foreground py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Blog</h1>
            <p className="text-xl text-primary-foreground/90">
              Sağlıklı yaşam, beslenme ve lezzetli tarifler hakkında her şey
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
        {/* Categories */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-primary mb-6">Kategoriler</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {BLOG_CATEGORIES.map((category) => (
              <Link
                key={category.id}
                href={`/blog/kategori/${category.slug}`}
                className="bg-white rounded-xl p-6 text-center shadow-sm border border-gray-200 hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-3">{category.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {category.name}
                </h3>
                <p className="text-xs text-gray-600">{category.description}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Blog Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {posts.map((post) => (
            <article
              key={post.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Cover Image */}
              <Link href={`/blog/${post.slug}`}>
                <div className="aspect-video bg-gradient-to-br from-primary/10 to-secondary/10 flex items-center justify-center text-6xl">
                  {post.category === "saglik" && "❤️"}
                  {post.category === "tarifler" && "🍽️"}
                  {post.category === "beslenme" && "🥗"}
                  {post.category === "yasam" && "🌟"}
                  {post.category === "haberler" && "📰"}
                </div>
              </Link>

              {/* Content */}
              <div className="p-6">
                {/* Category Badge */}
                <div className="mb-3">
                  <span className="inline-block px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                    {BLOG_CATEGORIES.find((c) => c.id === post.category)?.name}
                  </span>
                </div>

                {/* Title */}
                <Link href={`/blog/${post.slug}`}>
                  <h2 className="text-xl font-bold text-gray-900 mb-3 hover:text-primary transition-colors line-clamp-2">
                    {post.title}
                  </h2>
                </Link>

                {/* Excerpt */}
                <p className="text-gray-600 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>

                {/* Meta Info */}
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    <span>{formatDate(post.publishedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{post.readTime} dk</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    <span>{post.views}</span>
                  </div>
                </div>

                {/* Author */}
                <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
                  <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-semibold">
                    {post.author.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">
                      {post.author.name}
                    </p>
                    <p className="text-xs text-gray-500">{post.author.role}</p>
                  </div>
                </div>

                {/* Read More */}
                <Link
                  href={`/blog/${post.slug}`}
                  className="mt-4 inline-flex items-center gap-2 text-primary font-medium hover:gap-3 transition-all"
                >
                  Devamını Oku
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
