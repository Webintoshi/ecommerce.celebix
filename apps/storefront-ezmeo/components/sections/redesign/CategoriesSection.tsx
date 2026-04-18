"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface HomepageCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
  productCount?: number;
}

interface CategoriesSectionProps {
  initialCategories?: HomepageCategory[];
  eyebrow?: string;
  heading?: string;
}

const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  "fistik-ezmesi": "/fistik_ezmesi_kategori_gorsel.webp",
  "findik-ezmesi": "/Findik_Ezmeleri_Kategorisi.webp",
  "badem-ezmesi": "/fistik_ezmesi_kategori_gorsel.webp",
};

function getCategoryFallbackDescription(slug: string) {
  if (slug.includes("fistik")) {
    return "Sekersiz, balli ve hurmali yorumlarla daha canli bir fistik vitrini.";
  }
  if (slug.includes("findik")) {
    return "Kremamsi, kavruk ve daha yuvarlak findik profilleri icin secili kavanozlar.";
  }
  if (slug.includes("badem")) {
    return "Daha temiz ve daha dengeli bir badem cizgisi icin premium secim.";
  }

  return "Urunu one alan, gereksiz kalabaliktan uzak bir koleksiyon secimi.";
}

export function CategoriesSection({
  initialCategories = [],
  eyebrow = "Koleksiyonlar",
  heading = "Fistik, findik ve badem etrafinda kurulan secili koleksiyonlar",
}: CategoriesSectionProps) {
  const { locale } = useStorefrontRoute();

  const displayCategories = initialCategories
    .filter((category) => category.slug && category.name)
    .slice(0, 5)
    .map((category) => {
      const fallbackImage = CATEGORY_FALLBACK_IMAGES[category.slug] || "/fistik_ezmesi_kategori_gorsel.webp";
      const resolvedImage = resolveStorefrontAssetUrl(category.image || fallbackImage);

      return {
        id: category.id,
        name: category.name,
        link: buildLocalizedPath(`/${category.slug}`, locale),
        image: resolvedImage || fallbackImage,
        usesProxiedImage: resolvedImage ? isProxiedStorefrontAssetUrl(resolvedImage) : false,
        description: category.description || getCategoryFallbackDescription(category.slug),
        productCount: Number(category.productCount || 0),
      };
    });

  if (displayCategories.length === 0) {
    return null;
  }

  return (
    <section className="pt-14 lg:pt-18">
      <div className="container-premium">
        <div className="mb-8 max-w-3xl lg:mb-10">
          <p className="editorial-kicker">{eyebrow}</p>
          <h2 className="mt-5 max-w-3xl text-[var(--foreground)]">{heading}</h2>
        </div>

        <div className="grid gap-4 lg:grid-cols-3 lg:auto-rows-[18rem]">
          {displayCategories.map((category, index) => {
            const isHeroTile = index === 0;

            return (
              <Link
                key={category.id}
                href={category.link}
                className={`group relative overflow-hidden rounded-[2rem] ${
                  isHeroTile ? "lg:col-span-2 lg:row-span-2" : ""
                }`}
              >
                <div className="absolute inset-0">
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes={
                      isHeroTile
                        ? "(max-width: 1024px) 100vw, 66vw"
                        : "(max-width: 1024px) 100vw, 33vw"
                    }
                    unoptimized={category.usesProxiedImage}
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-[rgba(28,16,10,0.84)] via-[rgba(28,16,10,0.26)] to-transparent" />

                <div className="relative flex h-full flex-col justify-between p-5 md:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="chip-dark">
                      {category.productCount > 0 ? `${category.productCount} urun` : "Editorial secim"}
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/16 bg-white/10 text-white transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1">
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </div>

                  <div className="max-w-xl">
                    <h3 className={`text-white ${isHeroTile ? "text-4xl md:text-5xl" : "text-2xl md:text-3xl"}`}>
                      {category.name}
                    </h3>
                    <p className="mt-3 max-w-lg text-sm leading-7 text-white/78 md:text-base">
                      {category.description}
                    </p>
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
