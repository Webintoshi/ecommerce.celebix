"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface ShortcutCategory {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  productCount?: number;
}

interface TrustStripProps {
  categories?: ShortcutCategory[];
  eyebrow?: string;
  heading?: string;
  viewAllLabel?: string;
}

export function TrustStrip({
  categories = [],
  eyebrow = "Kategoriler",
  heading = "Bugunun cicek secimleri",
  viewAllLabel = "Tumunu Gor",
}: TrustStripProps) {
  const { locale } = useStorefrontRoute();
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const displayCategories = useMemo(
    () =>
      categories
        .filter((category) => category.slug && category.name)
        .slice(0, 6)
        .map((category) => {
          const resolvedImage = resolveStorefrontAssetUrl(category.image);

          return {
            id: category.id,
            name: category.name,
            href: buildLocalizedPath(ROUTES.category(category.slug), locale),
            image: resolvedImage || null,
            productCount: category.productCount || 0,
            usesProxiedImage: resolvedImage ? isProxiedStorefrontAssetUrl(resolvedImage) : false,
          };
        }),
    [categories, locale],
  );

  if (displayCategories.length === 0) {
    return null;
  }

  return (
    <section className="section-shell pt-6 sm:pt-8">
      <div className="container-premium">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="section-eyebrow">{eyebrow}</p>
            <h2 className="mt-2 text-[clamp(1.5rem,2.8vw,2.2rem)] font-semibold tracking-[-0.04em] text-[var(--store-ink)]">
              {heading}
            </h2>
          </div>
          <Link
            href={buildLocalizedPath(ROUTES.products, locale)}
            className="hidden rounded-full border border-[var(--store-border)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--store-ink-soft)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)] md:inline-flex"
          >
            {viewAllLabel}
          </Link>
        </div>

        <div className="mt-7 md:hidden">
          <div className="-mx-5 overflow-x-auto px-5 scrollbar-hide">
            <div className="flex snap-x snap-mandatory gap-4 pb-2">
              {displayCategories.map((category) => (
                <Link
                  key={category.id}
                  href={category.href}
                  className="min-w-[calc(50%-0.5rem)] flex-[0_0_calc(50%-0.5rem)] snap-start"
                >
                  <article className="flex flex-col items-center text-center">
                    <div className="relative aspect-square w-full max-w-[156px] overflow-hidden rounded-full border border-[var(--store-border)] bg-white shadow-[var(--store-shadow-soft)]">
                      {category.image && !imageErrors[category.id] ? (
                        <Image
                          src={category.image}
                          alt={category.name}
                          fill
                          className="object-cover transition duration-500"
                          sizes="(max-width: 767px) 42vw, 156px"
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
                    </div>
                    <h3 className="mt-4 line-clamp-2 text-sm font-semibold text-[var(--store-ink)]">
                      {category.name}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--store-muted)]">
                      {category.productCount > 0 ? `${category.productCount} urun` : "Koleksiyona git"}
                    </p>
                  </article>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 hidden md:grid md:grid-cols-4 md:gap-x-4 md:gap-y-6 lg:grid-cols-6">
          {displayCategories.map((category) => (
            <Link
              key={category.id}
              href={category.href}
              className="group flex flex-col items-center text-center"
            >
              <div className="relative aspect-square w-full max-w-[168px] overflow-hidden rounded-full border border-[var(--store-border)] bg-white shadow-[var(--store-shadow-soft)] transition group-hover:-translate-y-1 group-hover:border-[var(--store-accent)]">
                {category.image && !imageErrors[category.id] ? (
                  <Image
                    src={category.image}
                    alt={category.name}
                    fill
                    className="object-cover transition duration-700 group-hover:scale-[1.04]"
                    sizes="(max-width: 1023px) 22vw, 160px"
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
              </div>
              <h3 className="mt-4 line-clamp-2 text-sm font-semibold text-[var(--store-ink)] transition group-hover:text-[var(--store-accent)]">
                {category.name}
              </h3>
              <p className="mt-1 text-xs text-[var(--store-muted)]">
                {category.productCount > 0 ? `${category.productCount} urun` : "Koleksiyona git"}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
