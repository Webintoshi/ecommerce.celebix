"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
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
    <section className="bg-white py-14 lg:py-22">
      <div className="container-premium">
        <div className="mb-10 flex flex-col gap-4 lg:mb-14 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-[#FF6A00]">{eyebrow}</p>
            <h2 className="max-w-2xl text-3xl font-black tracking-tight text-[#111827] lg:text-4xl">{heading}</h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-[#6B7280]">
            Dinamik kategoriler kullanicinin aradigi ayakkabi, giyim veya ekipmana en kisa yoldan ulasmasini saglar.
          </p>
        </div>

        <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:px-0 lg:pb-0">
          {displayCategories.map((category) => (
            <Link
              key={category.id}
              href={category.link}
              className="group relative block aspect-[3/2] w-[72vw] shrink-0 overflow-hidden rounded-[1.75rem] bg-[#EEF2F7] shadow-sm sm:w-[44vw] lg:w-auto"
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
                <div className="absolute inset-0 bg-gradient-to-br from-[#111827] to-[#1E3A8A]" aria-hidden="true" />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F14]/78 via-[#0B0F14]/18 to-transparent transition-colors duration-300 group-hover:from-[#0B0F14]/85" />

              <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 lg:p-6">
                <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#B6FF00]">
                  Kesfet
                </p>
                <p className="category-card-title" style={{ color: "#ffffff" }}>{category.name}</p>
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
