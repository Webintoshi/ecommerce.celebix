"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
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
        <SectionHeading label={heading} className="mb-10" />

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {displayCategories.map((category) => (
            <Link key={category.id} href={category.link} className="group block">
              <div className="relative aspect-[16/10] overflow-hidden rounded-[1.9rem] border border-[rgba(26,26,26,0.08)] bg-[#ECE8E3]">
                {category.image && !imageErrors[category.id] ? (
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-[1.03]"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 24vw"
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
                <span className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/78 text-[#000000] shadow-[0_12px_34px_-24px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:-translate-y-0.5">
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
