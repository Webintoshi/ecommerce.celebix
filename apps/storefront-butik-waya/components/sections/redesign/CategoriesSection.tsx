"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
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

const FASHION_CATEGORY_PRIORITY = [
  ["yeni", "new", "new-arrivals", "newin"],
  ["elbise", "dress", "dresses"],
  ["takim", "set", "suit", "suits"],
  ["dis-giyim", "outerwear", "ceket", "jacket", "blazer", "coat", "kaban"],
  ["gomlek", "shirt", "bluz", "top", "ust-giyim"],
  ["triko", "knit", "kazak"],
  ["pantolon", "etek", "jean", "bottom", "alt-giyim"],
  ["aksesuar", "accessory", "canta", "bag", "ayakkabi", "shoe"],
];

function normalizeCategoryKey(value?: string | null) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCategoryPriority(category: HomepageCategory) {
  const searchable = `${category.slug || ""} ${category.name || ""}`;
  const normalized = normalizeCategoryKey(searchable);
  const index = FASHION_CATEGORY_PRIORITY.findIndex((keywords) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  );

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export function CategoriesSection({
  initialCategories = [],
  eyebrow = "Koleksiyonlar",
  heading = "Kategoriler",
}: CategoriesSectionProps) {
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const displayCategories = useMemo(
    () =>
      initialCategories
        .filter((category) => category.slug && category.name)
        .map((category, index) => {
          const resolvedImage = resolveStorefrontAssetUrl(category.image);

          return {
            id: category.id,
            name: category.name,
            link: ROUTES.category(category.slug),
            image: resolvedImage || null,
            usesProxiedImage: resolvedImage ? isProxiedStorefrontAssetUrl(resolvedImage) : false,
            originalIndex: index,
            priority: getCategoryPriority(category),
          };
        })
        .sort((left, right) => {
          if (Boolean(left.image) !== Boolean(right.image)) {
            return Number(Boolean(right.image)) - Number(Boolean(left.image));
          }

          if (left.priority !== right.priority) {
            return left.priority - right.priority;
          }

          return left.originalIndex - right.originalIndex;
        })
        .slice(0, 4),
    [initialCategories],
  );

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
            Kategori akisi, butun sayfayi kalabaliklastirmadan secili bolumleri one cikariyor.
            Gorseller ilk bakista koleksiyon duygusunu kuruyor, isimler ise sakin ve net bir
            hiyerarsiyle alt satirda devam ediyor.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {displayCategories.map((category, index) => (
            <Link key={category.id} href={category.link} className="group block">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[1.9rem] border border-[rgba(26,26,26,0.08)] bg-[#ECE8E3]">
                {category.image && !imageErrors[category.id] ? (
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-[1.03]"
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 50vw, 24vw"
                    unoptimized={category.usesProxiedImage}
                    onError={() =>
                      setImageErrors((current) => ({
                        ...current,
                        [category.id]: true,
                      }))
                    }
                  />
                ) : (
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,#ECE8E3,#D9D3CC)]" />
                )}
              </div>

              <div className="mt-4 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">
                    {index === 0 ? "One cikan kategori" : "Kategori"}
                  </p>
                  <h3 className="mt-2 font-serif text-[2rem] leading-[0.92] tracking-[-0.04em] text-[#000000]">
                    {category.name}
                  </h3>
                </div>
                <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(26,26,26,0.1)] bg-white/72 text-[#000000] transition-transform duration-300 group-hover:-translate-y-0.5">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
