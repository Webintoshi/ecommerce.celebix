"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import type { HomepageCategory } from "@/lib/homepage";

interface CategoriesSectionProps {
  initialCategories?: HomepageCategory[];
  eyebrow?: string;
  heading?: string;
  description?: string;
}

export function CategoriesSection({
  initialCategories = [],
  eyebrow = "Koleksiyonlar",
  heading = "Kategoriler",
  description = "Saat kordonlarindan cuzdan ve aksesuarlara uzanan seckiyi, malzeme ve kullanim amacina gore hizlica ayirin.",
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
    <section className="bg-[#F8F8F8F8] py-20 lg:py-28">
      <div className="container-premium">
        <div className="mb-10 flex flex-col gap-5 text-center lg:mb-14 lg:flex-row lg:items-end lg:justify-between lg:text-left">
          <div className="max-w-xl">
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-[#8A6847]">{eyebrow}</p>
            <h2 className="font-serif text-3xl font-medium text-neutral-900 lg:text-4xl">{heading}</h2>
          </div>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-neutral-600 lg:mx-0 lg:text-right">
            {description}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 lg:gap-6">
          {displayCategories.map((category, index) => (
            <Link
              key={category.id}
              href={category.link}
              className="group relative block aspect-[0.92] overflow-hidden rounded-[28px] border border-white/80 bg-[#E9DED1] shadow-[0_22px_60px_-42px_rgba(53,35,18,0.35)] sm:aspect-[3/2]"
            >
              {category.image && !imageErrors[category.id] ? (
                <Image
                  src={category.image}
                  alt={category.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  unoptimized={category.usesProxiedImage}
                  onError={() =>
                    setImageErrors((current) => ({
                      ...current,
                      [category.id]: true,
                    }))
                  }
                />
              ) : (
                <div className="absolute inset-0 bg-neutral-100" aria-hidden="true" />
              )}

              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,8,5,0.02)_0%,rgba(11,8,5,0.14)_42%,rgba(11,8,5,0.58)_100%)] transition-opacity duration-300 group-hover:opacity-90" />
              <div className="absolute inset-0 ring-1 ring-inset ring-black/8" />

              <div className="absolute left-4 top-4 rounded-full border border-white/20 bg-white/14 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.24em] text-white/90 backdrop-blur">
                {`0${index + 1}`}
              </div>

              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 sm:p-5 lg:p-6">
                <div className="min-w-0">
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.22em] text-white/72">
                    Deri seckisi
                  </p>
                  <p className="category-card-title" style={{ color: "#ffffff" }}>
                    {category.name}
                  </p>
                </div>
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/16 bg-white/12 text-white backdrop-blur transition-transform duration-300 group-hover:-translate-y-1">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .category-card-title {
          max-width: 100%;
          font-size: 15px !important;
          font-weight: 600;
          line-height: 1.05 !important;
          text-wrap: balance;
          text-shadow: 0 6px 22px rgba(0, 0, 0, 0.26);
          -webkit-text-size-adjust: none;
          text-size-adjust: none;
        }

        @media (min-width: 768px) {
          .category-card-title {
            font-size: 16px !important;
          }
        }

        @media (min-width: 1024px) {
          .category-card-title {
            font-size: 22px !important;
          }
        }

        @media (min-width: 1280px) {
          .category-card-title {
            font-size: 28px !important;
          }
        }
      `}</style>
    </section>
  );
}
