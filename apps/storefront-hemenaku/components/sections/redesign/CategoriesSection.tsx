"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import {
  DEFAULT_DEMO_CATEGORIES,
  getCategoryPlaceholder,
  type DefaultPlaceholderId,
} from "@/lib/default-demo-theme";

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
  eyebrow = "Kategoriler",
  heading = "Akü seçenekleri",
}: CategoriesSectionProps) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const hasRealCategories = initialCategories.some((category) => category.slug && category.name);
  const sourceCategories = hasRealCategories ? initialCategories : DEFAULT_DEMO_CATEGORIES;
  const displayCategories = sourceCategories
    .filter((category) => category.slug && category.name)
    .map((category, index) => {
      const resolvedImage = resolveStorefrontAssetUrl("image" in category ? category.image : null);

      return {
        id: category.id,
        name: category.name,
        link: "href" in category ? category.href : ROUTES.category(category.slug),
        image: resolvedImage || null,
        usesProxiedImage: resolvedImage ? isProxiedStorefrontAssetUrl(resolvedImage) : false,
        placeholder: ("imagePlaceholder" in category
          ? category.imagePlaceholder
          : getCategoryPlaceholder(index)) as DefaultPlaceholderId,
        productCount: "productCount" in category ? category.productCount : undefined,
      };
    });

  return (
    <section className="bg-[#F3F6FA] py-12 lg:py-16">
      <div className="container-premium">
        <div className="mb-7 flex items-end justify-between gap-5 lg:mb-9">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-[#16A34A]">{eyebrow}</p>
            <h2 className="text-3xl font-semibold text-[#0B1220] lg:text-4xl">{heading}</h2>
          </div>
          <Link
            href={ROUTES.products}
            className="hidden rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-sm font-semibold text-[#0B1220] transition hover:border-[#22C55E] hover:text-[#166534] sm:inline-flex"
          >
            Tüm Ürünler
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 lg:gap-5">
          {displayCategories.map((category) => (
            <Link
              key={category.id}
              href={category.link}
              className="group relative block aspect-[4/5] overflow-hidden rounded-lg border border-[#D7DEE8] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#94A3B8] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22C55E] sm:aspect-[5/4] lg:aspect-[4/5]"
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
                <DefaultDemoPlaceholder
                  id={category.placeholder}
                  label={category.name}
                  compact
                  className="absolute inset-0"
                />
              )}

              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.08)_0%,rgba(15,23,42,0.72)_100%)] transition-colors duration-300 group-hover:bg-black/32" />

              <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center p-3 pb-4 text-center sm:p-5 sm:pb-6">
                {category.productCount ? (
                  <p className="mb-2 text-[10px] font-semibold uppercase text-[#FACC15]">
                    {category.productCount}+ urun
                  </p>
                ) : null}
                <p className="category-card-title" style={{ color: "#ffffff" }}>{category.name}</p>
                <span className="mt-3 hidden rounded-lg bg-white/14 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition group-hover:bg-[#FACC15] group-hover:text-[#0B1220] sm:inline-flex">
                  İncele
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .category-card-title {
          max-width: 82%;
          font-size: 13px !important;
          font-weight: 600;
          line-height: 1.08 !important;
          text-wrap: balance;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.28);
          -webkit-text-size-adjust: none;
          text-size-adjust: none;
        }

        @media (min-width: 768px) {
          .category-card-title {
            font-size: 14px !important;
          }
        }

        @media (min-width: 1024px) {
          .category-card-title {
            font-size: 18px !important;
          }
        }

        @media (min-width: 1280px) {
          .category-card-title {
            font-size: 24px !important;
          }
        }
      `}</style>
    </section>
  );
}
