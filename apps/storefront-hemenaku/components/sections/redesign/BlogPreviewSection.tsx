import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { BLOG_CATEGORIES } from "@/lib/blog";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import type { BlogPost } from "@/types/blog";

interface BlogPreviewSectionProps {
  posts?: BlogPost[];
}

function getCategoryName(post: BlogPost) {
  return BLOG_CATEGORIES.find((category) => category.id === post.category)?.name || "Blog";
}

export function BlogPreviewSection({ posts = [] }: BlogPreviewSectionProps) {
  const visiblePosts = posts.slice(0, 3);

  return (
    <section className="bg-[#F6F1EB] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
              Journal
            </span>
            <h2 className="font-serif text-3xl font-medium tracking-[-0.04em] text-[#140D08] sm:text-4xl">
              Marka notlari ve rehberler
            </h2>
          </div>
          <Link
            href="/blog"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#140D08]"
          >
            Blogu ac
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {visiblePosts.length > 0 ? (
          <div className="grid gap-5 lg:grid-cols-3">
            {visiblePosts.map((post, index) => {
              const coverImage = resolveStorefrontAssetUrl(post.coverImage);

              return (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group overflow-hidden rounded-[30px] border border-black/5 bg-white shadow-[0_24px_72px_-58px_rgba(24,17,11,0.35)]"
                >
                  <div className="relative aspect-[16/10] overflow-hidden">
                    {coverImage ? (
                      <Image
                        src={coverImage}
                        alt={post.title}
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        sizes="(max-width: 1024px) 100vw, 33vw"
                      />
                    ) : (
                      <DefaultDemoPlaceholder
                        id="placeholder-11"
                        label={getCategoryName(post)}
                        compact
                      />
                    )}
                  </div>
                  <div className="p-6">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
                      {index === 0 ? "One cikan" : getCategoryName(post)}
                    </p>
                    <h3 className="mt-3 line-clamp-2 font-serif text-2xl leading-tight tracking-[-0.04em] text-[#140D08]">
                      {post.title}
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#5F5147]">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="grid items-stretch overflow-hidden rounded-[34px] border border-black/5 bg-white shadow-[0_24px_80px_-58px_rgba(24,17,11,0.35)] lg:grid-cols-[0.42fr_0.58fr]">
            <div className="min-h-[260px]">
              <DefaultDemoPlaceholder id="placeholder-11" label="Blog rehberi" />
            </div>
            <div className="flex flex-col justify-center p-8 lg:p-10">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#C7A985] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#8A6847]">
                <Sparkles className="h-3.5 w-3.5" />
                Icerik alani hazir
              </span>
              <h3 className="mt-5 font-serif text-4xl leading-[0.98] tracking-[-0.05em] text-[#140D08]">
                Ilk blog yazisi yayinlandiginda bu alan canli preview olur
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#5F5147]">
                Yeni storefront, blog tablosu veya yazi olmadan da 500 vermez;
                ziyaretciye hazir, temiz ve marka dostu bir rehber alani gosterir.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
