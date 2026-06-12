import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, FolderOpen, Sparkles } from "lucide-react";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
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
  const category = BLOG_CATEGORIES.find((item) => item.id === post.category);

  if (imageUrl) {
    return (
      <div className={`relative overflow-hidden ${className || ""}`}>
        <Image
          src={imageUrl}
          alt={post.title}
          fill
          priority={priority}
          unoptimized
          className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#140D08]/85 via-[#140D08]/15 to-transparent" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(191,137,74,0.28),_transparent_52%),linear-gradient(135deg,#1B1410_0%,#2F1D14_45%,#8A6847_100%)] text-[4rem] text-white ${className || ""}`}
    >
      <div className="flex flex-col items-center gap-3">
        <span>{category?.icon || "•"}</span>
        <span className="text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
          {category?.name || "Blog"}
        </span>
      </div>
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
  const categorySummaries = buildCategorySummaries(posts);
  const activeCategory = activeCategorySlug
    ? categorySummaries.find((category) => category.slug === activeCategorySlug) || null
    : null;
  const featuredPost = posts[0] || null;
  const supportingPosts = posts.slice(1, 4);
  const archivePosts = posts.slice(4);

  const eyebrow = activeCategory ? `${activeCategory.name} arsivi` : `${profile.name} Journal`;
  const title = activeCategory
    ? `${activeCategory.name} yazilari`
    : "Marka notlari, urun rehberleri ve editor yazilari";
  const description = activeCategory
    ? activeCategory.description
    : `${profile.name} tarafinda yayinlanan blog yazilari, koleksiyon hikayeleri ve karar surecini kolaylastiran editor notlari burada toplanir.`;

  return (
    <div className="min-h-screen bg-[#F6F1EB] text-[#1A120D]">
      <section className="relative overflow-hidden border-b border-black/5 bg-[linear-gradient(180deg,#F8F1E8_0%,#F6F1EB_100%)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(138,104,71,0.16),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(30,20,14,0.09),_transparent_34%)]" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-12 px-6 py-16 lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.38em] text-[#8A6847]">
              {eyebrow}
            </p>
            <h1 className="mt-5 max-w-4xl font-serif text-5xl leading-[0.94] tracking-[-0.05em] text-[#140D08] sm:text-6xl">
              {title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-[#5F5147] sm:text-lg">
              {description}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[24px] border border-black/5 bg-white/80 px-5 py-4 shadow-[0_24px_60px_-48px_rgba(24,17,11,0.45)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.32em] text-[#8A6847]">Yazi Sayisi</p>
              <p className="mt-3 font-serif text-4xl text-[#140D08]">{posts.length}</p>
            </div>
            <div className="rounded-[24px] border border-black/5 bg-white/80 px-5 py-4 shadow-[0_24px_60px_-48px_rgba(24,17,11,0.45)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.32em] text-[#8A6847]">Kategori</p>
              <p className="mt-3 font-serif text-4xl text-[#140D08]">{categorySummaries.length}</p>
            </div>
            <div className="rounded-[24px] border border-black/5 bg-white/80 px-5 py-4 shadow-[0_24px_60px_-48px_rgba(24,17,11,0.45)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.32em] text-[#8A6847]">Odak</p>
              <p className="mt-3 text-sm leading-7 text-[#5F5147]">{profile.tagline}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/blog"
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              !activeCategory
                ? "border-[#140D08] bg-[#140D08] text-white"
                : "border-black/10 bg-white text-[#5F5147] hover:border-[#140D08] hover:text-[#140D08]"
            }`}
          >
            Tum yazilar
          </Link>
          {categorySummaries.map((category) => (
            <Link
              key={category.id}
              href={`/blog/kategori/${category.slug}`}
              className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory?.slug === category.slug
                  ? "border-[#140D08] bg-[#140D08] text-white"
                  : "border-black/10 bg-white text-[#5F5147] hover:border-[#140D08] hover:text-[#140D08]"
              }`}
            >
              {category.icon} {category.name} <span className="ml-2 text-xs opacity-70">{category.count}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 pb-20 lg:px-8">
        {posts.length === 0 ? (
          <div className="rounded-[32px] border border-dashed border-black/10 bg-white/70 px-8 py-20 text-center shadow-[0_24px_80px_-58px_rgba(24,17,11,0.35)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#8A6847]/10 text-[#8A6847]">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="mt-6 font-serif text-4xl tracking-[-0.04em] text-[#140D08]">
              Henuz yayinlanmis yazi yok
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#5F5147]">
              Blog yazilari admin panelinde yayinlandiginda bu alan otomatik dolar. Ilk yazi yayinlandiginda kategori ve editorial akisi da beraber gelir.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/urunler" className="rounded-full bg-[#140D08] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A1B13]">
                Urunleri incele
              </Link>
              <Link href="/iletisim" className="rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-[#140D08] transition-colors hover:border-[#140D08]">
                Iletisime gec
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-16">
            {featuredPost ? (
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
                <article className="group overflow-hidden rounded-[34px] border border-black/5 bg-white shadow-[0_28px_90px_-60px_rgba(24,17,11,0.45)]">
                  <Link href={`/blog/${featuredPost.slug}`} className="grid h-full lg:grid-cols-[1.08fr_minmax(0,0.92fr)]">
                    <BlogCover post={featuredPost} priority className="min-h-[340px]" />
                    <div className="flex flex-col justify-between p-7">
                      <div>
                        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.28em] text-[#8A6847]">
                          <span>{BLOG_CATEGORIES.find((item) => item.id === featuredPost.category)?.name || "Blog"}</span>
                          <span className="h-1 w-1 rounded-full bg-[#8A6847]/50" />
                          <span>One cikan yazi</span>
                        </div>
                        <h2 className="mt-5 font-serif text-4xl leading-[1] tracking-[-0.05em] text-[#140D08]">
                          {featuredPost.title}
                        </h2>
                        <p className="mt-5 text-sm leading-7 text-[#5F5147]">{featuredPost.excerpt}</p>
                      </div>
                      <div className="mt-8 space-y-6">
                        <div className="flex flex-wrap items-center gap-4 text-sm text-[#5F5147]">
                          <span className="inline-flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-[#8A6847]" />
                            {formatDate(featuredPost.publishedAt)}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Clock3 className="h-4 w-4 text-[#8A6847]" />
                            {featuredPost.readTime} dk
                          </span>
                        </div>
                        <div className="flex items-center justify-between border-t border-black/5 pt-5">
                          <div>
                            <p className="text-xs uppercase tracking-[0.28em] text-[#8A6847]">Yazar</p>
                            <p className="mt-2 text-sm font-semibold text-[#140D08]">{featuredPost.author.name}</p>
                          </div>
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-[#140D08]">
                            Yaziyi ac
                            <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </article>

                <div className="space-y-5">
                  {supportingPosts.map((post) => (
                    <article key={post.id} className="group overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_24px_72px_-58px_rgba(24,17,11,0.35)]">
                      <Link href={`/blog/${post.slug}`} className="grid min-h-[220px] grid-cols-[160px_minmax(0,1fr)]">
                        <BlogCover post={post} className="h-full min-h-[220px]" />
                        <div className="flex flex-col justify-between p-5">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.28em] text-[#8A6847]">
                              {BLOG_CATEGORIES.find((item) => item.id === post.category)?.name || "Blog"}
                            </p>
                            <h3 className="mt-3 font-serif text-2xl leading-tight tracking-[-0.04em] text-[#140D08]">
                              {post.title}
                            </h3>
                            <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#5F5147]">
                              {post.excerpt}
                            </p>
                          </div>
                          <div className="mt-5 flex items-center justify-between text-xs text-[#5F5147]">
                            <span>{formatDate(post.publishedAt)}</span>
                            <span className="inline-flex items-center gap-1 font-semibold text-[#140D08]">
                              Oku <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                            </span>
                          </div>
                        </div>
                      </Link>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {archivePosts.length > 0 ? (
              <div className="space-y-8">
                <div className="flex items-end justify-between gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#8A6847]">Arsiv</p>
                    <h2 className="mt-3 font-serif text-4xl tracking-[-0.05em] text-[#140D08]">Daha fazla yazi</h2>
                  </div>
                  <p className="max-w-xl text-sm leading-7 text-[#5F5147]">
                    Blog akisi admin panelindeki yayinlanan yazilarla otomatik beslenir. Bu alan ek editorial yazilar geldikce kendiliginden buyur.
                  </p>
                </div>
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {archivePosts.map((post) => (
                    <article key={post.id} className="group overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-[0_24px_70px_-56px_rgba(24,17,11,0.28)]">
                      <Link href={`/blog/${post.slug}`}>
                        <BlogCover post={post} className="aspect-[1.15/0.82]" />
                      </Link>
                      <div className="p-6">
                        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[#8A6847]">
                          <FolderOpen className="h-3.5 w-3.5" />
                          <span>{BLOG_CATEGORIES.find((item) => item.id === post.category)?.name || "Blog"}</span>
                        </div>
                        <Link href={`/blog/${post.slug}`}>
                          <h3 className="mt-4 font-serif text-[1.85rem] leading-[1.02] tracking-[-0.045em] text-[#140D08] transition-colors group-hover:text-[#8A6847]">
                            {post.title}
                          </h3>
                        </Link>
                        <p className="mt-4 line-clamp-3 text-sm leading-7 text-[#5F5147]">{post.excerpt}</p>
                        <div className="mt-6 flex items-center justify-between border-t border-black/5 pt-4 text-xs text-[#5F5147]">
                          <span>{formatDate(post.publishedAt)}</span>
                          <span>{post.readTime} dk</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
