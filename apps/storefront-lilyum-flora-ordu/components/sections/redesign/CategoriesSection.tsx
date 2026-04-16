"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { resolveStorefrontAssetUrl, isProxiedStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { SectionHeader } from "./SectionHeader";

interface HomepageCategory {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  productCount?: number;
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
  const { locale } = useStorefrontRoute();
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const displayCategories = useMemo(
    () =>
      initialCategories
        .filter((category) => category.slug && category.name)
        .map((category) => {
          const resolvedImage = resolveStorefrontAssetUrl(category.image);

          return {
            id: category.id,
            name: category.name,
            href: buildLocalizedPath(ROUTES.category(category.slug), locale),
            productCount: category.productCount || 0,
            image: resolvedImage || null,
            usesProxiedImage: resolvedImage ? isProxiedStorefrontAssetUrl(resolvedImage) : false,
          };
        }),
    [initialCategories, locale],
  );

  if (displayCategories.length === 0) {
    return null;
  }

  const featuredCategory = displayCategories[0];
  const secondaryCategories = displayCategories.slice(1, 7);

  return (
    <section className="section-shell">
      <div className="container-premium">
        <SectionHeader
          eyebrow={eyebrow}
          title={heading}
          action={
            <Link href={buildLocalizedPath(ROUTES.products, locale)} className="cta-secondary">
              Tümünü Gör
            </Link>
          }
        />

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr] lg:gap-5">
          <Link
            href={featuredCategory.href}
            className="group relative overflow-hidden rounded-[28px] border border-[var(--store-border)] bg-[var(--store-panel)] shadow-[var(--store-shadow-soft)]"
          >
            <div className="relative aspect-[5/5.8] sm:aspect-[16/11]">
              {featuredCategory.image && !imageErrors[featuredCategory.id] ? (
                <Image
                  src={featuredCategory.image}
                  alt={featuredCategory.name}
                  fill
                  className="object-cover transition duration-700 group-hover:scale-[1.03]"
                  sizes="(max-width: 1024px) 100vw, 58vw"
                  unoptimized={featuredCategory.usesProxiedImage}
                  onError={() =>
                    setImageErrors((current) => ({
                      ...current,
                      [featuredCategory.id]: true,
                    }))
                  }
                />
              ) : (
                <div className="absolute inset-0 bg-[linear-gradient(135deg,#eef2f5_0%,#ffffff_100%)]" />
              )}

              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(80,94,113,0.08)_0%,rgba(80,94,113,0.58)_100%)]" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                <p className="section-eyebrow text-white/78">Editör Seçimi</p>
                <h3 className="mt-3 font-[var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
                  {featuredCategory.name}
                </h3>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--store-accent)]">
                  Koleksiyona Git
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </div>
          </Link>

          <div className="grid gap-4 sm:grid-cols-2">
            {secondaryCategories.map((category) => (
              <Link
                key={category.id}
                href={category.href}
                className="group relative overflow-hidden rounded-[28px] border border-[var(--store-border)] bg-white shadow-[var(--store-shadow-soft)]"
              >
                <div className="relative aspect-[4/4.4]">
                  {category.image && !imageErrors[category.id] ? (
                    <Image
                      src={category.image}
                      alt={category.name}
                      fill
                      className="object-cover transition duration-700 group-hover:scale-[1.03]"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 22vw"
                      unoptimized={category.usesProxiedImage}
                      onError={() =>
                        setImageErrors((current) => ({
                          ...current,
                          [category.id]: true,
                        }))
                      }
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,#ffffff_0%,#e8edf2_100%)]" />
                  )}

                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(80,94,113,0.46)_100%)]" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/72">
                      {category.productCount > 0 ? `${category.productCount} ürün` : "Seçili vitrin"}
                    </p>
                    <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">
                      {category.name}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
