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
    <section className="bg-[#F5F7FA] py-16 lg:py-20">
      <div className="container-premium">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase text-[#0F766E]">
              Hemenaku Rehberi
            </span>
            <h2 className="text-3xl font-semibold text-[#0B1220] sm:text-4xl">
              Akü seçimini kolaylaştıran rehberler
            </h2>
          </div>
          <Link
            href="/blog"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-[#0F766E]"
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
                  className="group overflow-hidden rounded-lg border border-[#DDE7E4] bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
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
                    <p className="text-[11px] font-semibold uppercase text-[#0F766E]">
                      {index === 0 ? "One cikan" : getCategoryName(post)}
                    </p>
                    <h3 className="mt-3 line-clamp-2 text-2xl font-semibold leading-tight text-[#111827]">
                      {post.title}
                    </h3>
                    <p className="mt-3 line-clamp-3 text-sm leading-7 text-[#526B66]">
                      {post.excerpt}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="grid items-stretch overflow-hidden rounded-lg border border-[#DDE7E4] bg-white shadow-sm lg:grid-cols-[0.42fr_0.58fr]">
            <div className="min-h-[260px]">
              <DefaultDemoPlaceholder id="placeholder-11" label="Blog rehberi" />
            </div>
            <div className="flex flex-col justify-center p-8 lg:p-10">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#0F766E]/20 bg-[#F0FDFA] px-4 py-2 text-[11px] font-semibold uppercase text-[#0F766E]">
                <Sparkles className="h-3.5 w-3.5" />
                Rehberler yakında
              </span>
              <h3 className="mt-5 text-3xl font-semibold leading-tight text-[#0B1220] sm:text-4xl">
                Hemenaku notları için temiz bir okuma alanı hazır
              </h3>
              <p className="mt-4 max-w-xl text-sm leading-7 text-[#526176]">
                Akü seçimi, araç uyumluluğu ve alışveriş ipuçları yayınlandıkça burada öne çıkar.
                Şimdilik ziyaretçi ürün ve iletişim rotalarına net şekilde ulaşır.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
