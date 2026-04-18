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
      <div className="relative aspect-[1.7/1] overflow-hidden rounded-[30px] border border-black/5">
        <Image src={imageUrl} alt={post.title} fill priority unoptimized className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#130D08]/85 via-[#130D08]/18 to-transparent" />
      </div>
    );
  }

  return (
    <div className="flex aspect-[1.7/1] items-center justify-center rounded-[30px] border border-black/5 bg-[radial-gradient(circle_at_top,_rgba(138,104,71,0.24),_transparent_48%),linear-gradient(135deg,#1B1410_0%,#2F1D14_40%,#8A6847_100%)] text-[5rem] text-white">
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
    <div className="min-h-screen bg-[#F6F1EB] text-[#222222]">
      <div className="border-b border-black/5 bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm font-medium text-[#222222] transition-colors hover:text-[#222222]">
            <ArrowLeft className="h-4 w-4" />
            Blog'a don
          </Link>
          <Link href="/urunler" className="text-sm font-medium text-[#222222] transition-colors hover:text-[#222222]">
            Urunleri kesfet
          </Link>
        </div>
      </div>

      <article className="mx-auto max-w-6xl px-6 py-12 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.32em] text-[#222222]">
            <Link
              href={`/blog/kategori/${category?.slug || "guncellemeler"}`}
              className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-4 py-2 text-[11px] font-semibold transition-colors hover:border-[#222222] hover:text-[#222222]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {category?.name || "Blog"}
            </Link>
            <span>{formatDate(post.publishedAt)}</span>
          </div>

          <h1 className="mt-6 font-serif text-5xl leading-[0.94] tracking-[-0.055em] text-[#222222] sm:text-6xl">
            {post.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-9 text-[#222222]">{post.excerpt}</p>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-[#222222]">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-[#222222]" />
              {formatDate(post.publishedAt)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[#222222]" />
              {post.readTime} dakika okuma
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#140D08] text-xs font-semibold text-white">
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
              className="prose prose-lg max-w-none prose-headings:font-serif prose-headings:tracking-[-0.03em] prose-headings:text-[#222222] prose-p:text-[#222222] prose-p:leading-8 prose-a:text-[#222222] prose-a:no-underline hover:prose-a:text-[#222222] prose-strong:text-[#222222] prose-li:text-[#222222] prose-blockquote:border-l-[#8A6847] prose-blockquote:text-[#222222]"
              dangerouslySetInnerHTML={{ __html: renderBlogContentToHtml(post.content || "") }}
            />

            {post.tags.length > 0 ? (
              <div className="mt-12 flex flex-wrap gap-2 border-t border-black/5 pt-8">
                {post.tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-medium text-[#222222]">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_70px_-58px_rgba(24,17,11,0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#222222]">Editor Notu</p>
              <p className="mt-4 font-serif text-3xl leading-tight tracking-[-0.04em] text-[#222222]">{profile.name}</p>
              <p className="mt-4 text-sm leading-7 text-[#222222]">{profile.tagline}</p>
              <Link href="/iletisim" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#222222]">
                Iletisime gec
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="rounded-[28px] border border-black/5 bg-white p-6 shadow-[0_24px_70px_-58px_rgba(24,17,11,0.35)]">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#222222]">Sonraki adim</p>
              <p className="mt-4 text-sm leading-7 text-[#222222]">
                Yaziyi bitirdikten sonra ilgili urun grubunu veya iletisim sayfasini acarak ziyaretciyi dogru aksiyona tasiyin.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link href="/urunler" className="rounded-full bg-[#140D08] px-4 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-[#2A1B13]">
                  Urunleri incele
                </Link>
                <Link href="/blog" className="rounded-full border border-black/10 bg-white px-4 py-3 text-center text-sm font-semibold text-[#222222] transition-colors hover:border-[#222222]">
                  Diger yazilari gor
                </Link>
              </div>
            </div>
          </aside>
        </div>

        {relatedPosts.length > 0 ? (
          <section className="mx-auto mt-20 max-w-6xl">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#222222]">Ilgili yazilar</p>
              <h2 className="mt-3 font-serif text-4xl tracking-[-0.05em] text-[#222222]">Okumaya devam et</h2>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {relatedPosts.map((relatedPost) => (
                <article key={relatedPost.id} className="group overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_24px_70px_-56px_rgba(24,17,11,0.28)]">
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
                        <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#1B1410_0%,#2F1D14_45%,#8A6847_100%)] text-4xl text-white">
                          {BLOG_CATEGORIES.find((item) => item.id === relatedPost.category)?.icon || "•"}
                        </div>
                      )}
                    </div>
                  </Link>
                  <div className="p-6">
                    <p className="text-[11px] uppercase tracking-[0.28em] text-[#222222]">
                      {BLOG_CATEGORIES.find((item) => item.id === relatedPost.category)?.name || "Blog"}
                    </p>
                    <Link href={`/blog/${relatedPost.slug}`}>
                      <h3 className="mt-3 font-serif text-2xl leading-tight tracking-[-0.04em] text-[#222222]">{relatedPost.title}</h3>
                    </Link>
                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#222222]">{relatedPost.excerpt}</p>
                    <div className="mt-5 flex items-center justify-between text-xs text-[#222222]">
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
