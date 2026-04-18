"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";

interface HomepageCategory {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
}

interface CategoriesSectionProps {
  initialCategories?: HomepageCategory[];
  eyebrow?: string;
  heading?: string;
}

export function CategoriesSection({
  initialCategories = [],
  eyebrow = "Koleksiyonlar",
  heading = "Kategoriler",
}: CategoriesSectionProps) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const displayCategories = initialCategories
    .filter((category) => category.slug && category.name)
    .map((category) => {
      const resolvedImage = resolveStorefrontAssetUrl(category.image);

      return {
        id: category.id,
        name: category.name,
        link: ROUTES.category(category.slug),
        image: resolvedImage || null,
        usesProxiedImage: resolvedImage ? isProxiedStorefrontAssetUrl(resolvedImage) : false,
      };
    });

  if (displayCategories.length === 0) {
    return null;
  }

  return (
    <section className="py-20 lg:py-28">
      <div className="container-premium">
        <div className="mb-12 grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="editorial-kicker">{eyebrow}</p>
            <h2 className="mt-5 max-w-xl font-serif text-4xl leading-[0.95] tracking-[-0.045em] text-[#1d1715] lg:text-6xl">
              {heading}
            </h2>
          </div>
          <p className="editorial-copy max-w-2xl text-sm sm:text-base">
            Her kategori, Butik Waya gardirobunun farkli bir ritmini aciyor: gun icinde kolay
            tasinan siluetler, aksam ustu sertlesen hatlar ve yumusak luks detaylar tek vitrinde
            bir araya geliyor.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12 lg:grid-rows-2">
          {displayCategories.slice(0, 5).map((category, index) => {
            const isFeatured = index === 0;

            return (
              <Link
                key={category.id}
                href={category.link}
                className={`group relative overflow-hidden rounded-[2rem] border border-[rgba(35,24,21,0.08)] ${
                  isFeatured
                    ? "min-h-[460px] lg:col-span-7 lg:row-span-2"
                    : "min-h-[220px] lg:col-span-5"
                }`}
              >
                {category.image && !imageErrors[category.id] ? (
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-[1.04]"
                    sizes={
                      isFeatured
                        ? "(max-width: 1024px) 100vw, 58vw"
                        : "(max-width: 1024px) 100vw, 34vw"
                    }
                    unoptimized={category.usesProxiedImage}
                    onError={() =>
                      setImageErrors((current) => ({
                        ...current,
                        [category.id]: true,
                      }))
                    }
                  />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,#e7d9cd,#cfae98)]" />
                )}

                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,12,10,0.04),rgba(20,12,10,0.7))]" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_38%)] opacity-70" />

                <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                  <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-black/20 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/75 backdrop-blur">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span>Waya Selection</span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <h3 className="max-w-[12ch] font-serif text-3xl leading-[0.9] tracking-[-0.04em] text-white sm:text-4xl">
                        {category.name}
                      </h3>
                      <p className="mt-3 max-w-md text-sm text-white/78">
                        {isFeatured
                          ? "Vitrinin merkezinde duran ve tum koleksiyon dilini tasiyan ana kategori."
                          : "Butik Waya gardirobunda stil gecisini tamamlayan secili alan."}
                      </p>
                    </div>
                    <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition-transform duration-300 group-hover:-translate-y-1">
                      <ArrowUpRight className="h-5 w-5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
