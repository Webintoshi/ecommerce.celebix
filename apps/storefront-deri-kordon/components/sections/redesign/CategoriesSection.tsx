"use client";

import Image from "next/image";
import Link from "next/link";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import type { HomepageCategory } from "@/lib/homepage";

interface CategoriesSectionProps {
  initialCategories?: HomepageCategory[];
}

export function CategoriesSection({ initialCategories = [] }: CategoriesSectionProps) {
  const displayCategories = initialCategories
    .filter((category) => category.slug && category.name)
    .map((category) => {
      const resolvedImage = resolveStorefrontAssetUrl(category.image);

      return {
        id: category.id,
        name: category.name,
        description: category.description || "",
        link: ROUTES.category(category.slug),
        image: resolvedImage || "/placeholder.svg",
        usesProxiedImage: isProxiedStorefrontAssetUrl(resolvedImage),
      };
    });

  if (displayCategories.length === 0) {
    return null;
  }

  return (
    <section className="bg-[#F8F8F8F8] py-20 lg:py-28">
      <div className="container-premium">
        <div className="mb-12 text-center lg:mb-16">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-neutral-400">KOLEKSİYONLAR</p>
          <h2 className="font-serif text-3xl font-medium text-neutral-900 lg:text-4xl">Kategoriler</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
          {displayCategories.map((category) => (
            <Link
              key={category.id}
              href={category.link}
              className="group relative block aspect-[3/2] overflow-hidden"
            >
              <Image
                src={category.image}
                alt={category.name}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                unoptimized={category.usesProxiedImage}
              />

              <div className="absolute inset-0 bg-black/25 transition-colors duration-300 group-hover:bg-black/35" />

              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <h3 className="text-lg font-medium leading-tight text-[#F8F8F8F8] drop-shadow-lg md:text-xl lg:text-2xl">
                  {category.name}
                </h3>
                {category.description ? (
                  <p className="mt-3 line-clamp-2 max-w-sm text-sm text-[#F8F8F8F8]/85 drop-shadow-md">
                    {category.description}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
