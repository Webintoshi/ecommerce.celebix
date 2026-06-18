import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, Clock3, FolderOpen } from "lucide-react";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { renderBlogContentToHtml } from "@/lib/blog-rich-text";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { formatDate } from "@/lib/utils";
import type { StorefrontProfile } from "@/lib/storefront-profile";
import type { BlogPost } from "@/types/blog";

function BlogHeroImage({ post }: { post: BlogPost }) {
  const imageUrl = resolveStorefrontAssetUrl(post.coverImage);
  const category = BLOG_CATEGORIES.find((item) => item.id === post.category);

  if (imageUrl) {
    return (
      <div className="relative aspect-[1.7/1] overflow-hidden rounded-lg border border-[#D7DEE8]">
        <Image src={imageUrl} alt={post.title} fill priority unoptimized className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B1220]/85 via-[#0B1220]/18 to-transparent" />
      </div>
    );
  }

  return (
    <div className="flex aspect-[1.7/1] items-center justify-center rounded-lg border border-[#D7DEE8] bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.22),_transparent_48%),linear-gradient(135deg,#0B1220_0%,#1E293B_44%,#14532D_100%)] text-[5rem] text-white">
      <div className="text-center">
        <div>{category?.icon || "•"}</div>
        <p className="mt-4 text-xs uppercase tracking-[0.38em] text-white/70">
          {category?.name || "Blog"}
        </p>
      </div>
    </div>
  );
}

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

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#0B1220]">
      <div className="border-b border-[#D7DEE8] bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-[#526176] transition-colors hover:text-[#0B1220]">
            <ArrowLeft className="h-4 w-4" />
            Blog'a don
          </Link>
          <Link href="/urunler" className="text-sm font-medium text-[#166534] transition-colors hover:text-[#0B1220]">
            Ürünleri keşfet
          </Link>
        </div>
      </div>

      <article className="mx-auto max-w-6xl px-6 py-12 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.32em] text-[#0F766E]">
            <Link
              href={`/blog/kategori/${category?.slug || "guncellemeler"}`}
              className="inline-flex items-center gap-2 rounded-lg border border-[#D7DEE8] bg-white px-4 py-2 text-[11px] font-semibold transition-colors hover:border-[#22C55E] hover:text-[#166534]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {category?.name || "Blog"}
            </Link>
            <span>{formatDate(post.publishedAt)}</span>
          </div>

          <h1 className="mt-6 text-5xl font-semibold leading-[0.98] text-[#0B1220] sm:text-6xl">
            {post.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-9 text-[#526B66]">{post.excerpt}</p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[#526B66]">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#0F766E]" />
              {formatDate(post.publishedAt)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#0F766E]" />
              {post.readTime} dakika okuma
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111827] text-xs font-semibold text-white">
                {post.author.name.charAt(0)}
              </span>
              {post.author.name}
            </span>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-5xl">
          <BlogHeroImage post={post} />
        </div>

        <div className="mx-auto mt-12 grid max-w-6xl gap-12 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <div
              className="prose prose-lg max-w-none prose-headings:font-semibold prose-headings:text-[#0B1220] prose-p:text-[#526176] prose-p:leading-8 prose-a:text-[#166534] prose-a:no-underline hover:prose-a:text-[#0B1220] prose-strong:text-[#0B1220] prose-li:text-[#526176] prose-blockquote:border-l-[#22C55E] prose-blockquote:text-[#526176]"
              dangerouslySetInnerHTML={{ __html: renderBlogContentToHtml(post.content || "") }}
            />

            {post.tags.length > 0 ? (
              <div className="mt-12 flex flex-wrap gap-2 border-t border-black/5 pt-8">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[#526B66]">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="space-y-5">
            <div className="rounded-lg border border-[#D7DEE8] bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#166534]">Editör Notu</p>
              <p className="mt-4 text-3xl font-semibold leading-tight text-[#0B1220]">{profile.name}</p>
              <p className="mt-4 text-sm leading-7 text-[#526B66]">{profile.tagline}</p>
              <Link href="/iletisim" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#111827]">
                İletişime geç
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-lg border border-[#D7DEE8] bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#166534]">Sonraki adım</p>
              <p className="mt-4 text-sm leading-7 text-[#526B66]">
                Yazıyı bitirdikten sonra ilgili ürün grubunu veya iletişim sayfasını açarak doğru aksiyona geçin.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link href="/urunler" className="rounded-lg bg-[#0F172A] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#1E293B]">
                  Ürünleri incele
                </Link>
                <Link href="/blog" className="rounded-lg border border-[#D7DEE8] bg-white px-4 py-3 text-center text-sm font-semibold text-[#0B1220] transition-colors hover:border-[#22C55E] hover:text-[#166534]">
                  Diğer yazıları gör
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {relatedPosts.length > 0 ? (
          <section className="mx-auto mt-20 max-w-6xl">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#166534]">İlgili yazılar</p>
              <h2 className="mt-3 text-4xl font-semibold text-[#0B1220]">Okumaya devam et</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {relatedPosts.map((relatedPost) => (
                <article key={relatedPost.id} className="group overflow-hidden rounded-lg border border-[#D7DEE8] bg-white shadow-sm">
                  <Link href={`/blog/${relatedPost.slug}`}>
                    <div className="relative aspect-[1.18/0.82] overflow-hidden">
                      {resolveStorefrontAssetUrl(relatedPost.coverImage) ? (
                        <Image
                          src={resolveStorefrontAssetUrl(relatedPost.coverImage)}
                          alt={relatedPost.title}
                          fill
                          unoptimized
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#0B1220_0%,#1E293B_45%,#14532D_100%)] text-4xl text-white">
                          {BLOG_CATEGORIES.find((item) => item.id === relatedPost.category)?.icon || "•"}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="p-6">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[#0F766E]">
                      {BLOG_CATEGORIES.find((item) => item.id === relatedPost.category)?.name || "Blog"}
                    </p>
                    <Link href={`/blog/${relatedPost.slug}`}>
                      <h3 className="mt-3 text-2xl font-semibold leading-tight text-[#0B1220]">{relatedPost.title}</h3>
                    </Link>
                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#526B66]">{relatedPost.excerpt}</p>
                    <div className="mt-5 flex items-center justify-between text-xs text-[#526B66]">
                      <span>{formatDate(relatedPost.publishedAt)}</span>
                      <span>{relatedPost.readTime} dk</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </div>
  );
}
