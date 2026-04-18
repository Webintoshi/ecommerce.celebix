"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  resolveStorefrontAssetUrl,
  isProxiedStorefrontAssetUrl,
} from "@/lib/asset-url";
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
    return "Sekersiz, balli ve hurmali yorumlari ayni rafine cizgide toplar.";
  }
  if (slug.includes("findik")) {
    return "Daha kremamsi, daha yuvarlak ve kahvaltiya yakin bir lezzet profili sunar.";
  }
  if (slug.includes("badem")) {
    return "Temiz icerik diliyle daha dengeli ve daha hafif bir pantry secimi kurar.";
  }

  return "Urunu merkeze alan, daha sade ve daha hizli taranan bir koleksiyon akisi.";
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
      const fallbackImage =
        CATEGORY_FALLBACK_IMAGES[category.slug] || "/fistik_ezmesi_kategori_gorsel.webp";
      const resolvedImage = resolveStorefrontAssetUrl(category.image || fallbackImage);

      return {
        id: category.id,
        name: category.name,
        link: buildLocalizedPath(`/${category.slug}`, locale),
        image: resolvedImage || fallbackImage,
        usesProxiedImage: resolvedImage
          ? isProxiedStorefrontAssetUrl(resolvedImage)
          : false,
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
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between lg:mb-10">
          <div className="max-w-3xl">
            <p className="editorial-kicker">{eyebrow}</p>
            <h2 className="mt-5 max-w-3xl text-[var(--foreground)]">{heading}</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
            Her koleksiyon, kampanya agirligi yerine kavanozun lezzet profiline ve kullanima gore netlesen bir hiyerarsiyle sunulur.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {displayCategories.map((category, index) => (
            <Link
              key={category.id}
              href={category.link}
              className={`group overflow-hidden rounded-[1.85rem] border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-1 ${
                index === 0 ? "xl:col-span-2" : ""
              }`}
            >
              <div className="relative aspect-[1/1.04] overflow-hidden bg-[var(--background-strong)] md:aspect-[1/1.1]">
                <Image
                  src={category.image}
                  alt={category.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes={
                    index === 0
                      ? "(max-width: 1280px) 100vw, 62vw"
                      : "(max-width: 1024px) 100vw, 32vw"
                  }
                  unoptimized={category.usesProxiedImage}
                />
              </div>

              <div className="flex items-start justify-between gap-4 px-5 py-5 md:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip">
                      {category.productCount > 0 ? `${category.productCount} urun` : "Secili raf"}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[var(--foreground)]">{category.name}</h3>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
                    {category.description}
                  </p>
                </div>

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
