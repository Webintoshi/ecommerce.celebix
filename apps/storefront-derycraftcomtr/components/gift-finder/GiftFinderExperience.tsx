"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { GiftFinderDropdown } from "@/components/gift-finder/GiftFinderDropdown";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import {
  DEFAULT_GIFT_FINDER_FILTERS,
  GIFT_BUDGET_OPTIONS,
  GIFT_CATEGORY_LABELS,
  GIFT_FINDER_HERO_IMAGE,
  GIFT_OCCASION_OPTIONS,
  GIFT_RECIPIENT_OPTIONS,
  type GiftFinderFilters,
} from "@/lib/gift-finder-config";
import { findGiftProducts, getPrimaryGiftCategorySlug } from "@/lib/gift-finder";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/product";

type GiftFinderExperienceProps = {
  products: Product[];
};

type OpenFilterKey = "recipient" | "budget" | "occasion" | null;

export function GiftFinderExperience({ products }: GiftFinderExperienceProps) {
  const { buildPath } = useStorefrontRoute();
  const [filters, setFilters] = useState<GiftFinderFilters>(DEFAULT_GIFT_FINDER_FILTERS);
  const [openFilter, setOpenFilter] = useState<OpenFilterKey>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const heroImageSrc = resolveStorefrontAssetUrl(GIFT_FINDER_HERO_IMAGE);
  const usesProxiedHeroImage = isProxiedStorefrontAssetUrl(heroImageSrc);

  const results = useMemo(() => {
    if (!hasSearched || !filters.recipient) {
      return [];
    }

    return findGiftProducts(products, filters, 8);
  }, [filters, hasSearched, products]);

  const summaryLabels = useMemo(() => {
    const recipient = GIFT_RECIPIENT_OPTIONS.find((option) => option.value === filters.recipient)?.label;
    const budget = GIFT_BUDGET_OPTIONS.find((option) => option.value === filters.budget)?.label;
    const occasion = GIFT_OCCASION_OPTIONS.find((option) => option.value === filters.occasion)?.label;
    return [recipient, budget, occasion].filter(Boolean).join(" · ");
  }, [filters]);

  const collectionHref = useMemo(() => {
    if (!filters.recipient) return buildPath(ROUTES.products);

    const primaryCategory = results[0] ? getPrimaryGiftCategorySlug(results[0]) : "";
    const params = new URLSearchParams();

    params.set("hediye-kime", filters.recipient);
    if (filters.budget) params.set("max-fiyat", filters.budget);
    params.set("neden", filters.occasion);

    const basePath = primaryCategory
      ? buildPath(ROUTES.category(primaryCategory))
      : buildPath(ROUTES.products);

    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  }, [buildPath, filters, results]);

  function openOnly(next: OpenFilterKey) {
    setOpenFilter((current) => (current === next ? null : next));
  }

  function handleFindGift() {
    if (!filters.recipient) {
      setErrorMessage("Lütfen hediyeyi kimin için aradığınızı seçin.");
      return;
    }

    setErrorMessage("");
    setHasSearched(true);
    setOpenFilter(null);
  }

  return (
    <div className="space-y-10 sm:space-y-12">
      <section className="relative overflow-visible border border-[#E5D9CA] bg-[linear-gradient(135deg,#FFFDFB_0%,#FFFFFF_48%,#F8F3EC_100%)] shadow-[0_28px_90px_rgba(18,16,13,0.07)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-[radial-gradient(circle_at_top_left,rgba(198,160,98,0.12),transparent_58%)]"
        />

        <div className="relative grid min-h-[300px] lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.72fr)] lg:min-h-[320px]">
          <div className="flex flex-col justify-center px-6 py-8 sm:px-9 sm:py-10 lg:px-10 lg:py-11">
            <div className="max-w-3xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B6914]">
                Kalıcı ve unutulmaz
              </p>
              <h1 className="mt-3 font-serif text-[1.85rem] font-medium leading-[1.08] tracking-tight text-neutral-950 sm:text-[2.15rem] lg:text-[2.35rem]">
                Bir hediye arıyorum
              </h1>
            </div>

            <div className="mt-8 flex flex-col gap-5 lg:mt-9">
              <div className="flex flex-col gap-5 md:flex-row md:flex-wrap md:items-end md:gap-x-6 md:gap-y-4">
                <GiftFinderDropdown
                  label="Kim için"
                  value={filters.recipient}
                  placeholder="Seçiniz"
                  options={GIFT_RECIPIENT_OPTIONS}
                  isOpen={openFilter === "recipient"}
                  onOpen={() => openOnly("recipient")}
                  onClose={() => setOpenFilter(null)}
                  onChange={(value) =>
                    setFilters((current) => ({ ...current, recipient: value as GiftFinderFilters["recipient"] }))
                  }
                />
                <GiftFinderDropdown
                  label="Bütçe"
                  value={filters.budget}
                  placeholder="Bütçe seçin"
                  options={GIFT_BUDGET_OPTIONS}
                  isOpen={openFilter === "budget"}
                  onOpen={() => openOnly("budget")}
                  onClose={() => setOpenFilter(null)}
                  onChange={(value) =>
                    setFilters((current) => ({ ...current, budget: value as GiftFinderFilters["budget"] }))
                  }
                />
                <GiftFinderDropdown
                  label="Hediye nedeni"
                  value={filters.occasion}
                  placeholder="Neden seçin"
                  options={GIFT_OCCASION_OPTIONS}
                  isOpen={openFilter === "occasion"}
                  onOpen={() => openOnly("occasion")}
                  onClose={() => setOpenFilter(null)}
                  onChange={(value) =>
                    setFilters((current) => ({ ...current, occasion: value as GiftFinderFilters["occasion"] }))
                  }
                />

                <button
                  type="button"
                  onClick={handleFindGift}
                  className="inline-flex min-h-12 shrink-0 items-center justify-center bg-neutral-950 px-8 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-white transition-colors hover:bg-[#8B6914] md:mb-0.5"
                >
                  Hediyemi bul
                </button>
              </div>

              {errorMessage ? (
                <p className="text-sm text-[#8B6914]" role="alert">
                  {errorMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-[240px] overflow-hidden bg-[#F0E8DC] sm:min-h-[260px] lg:min-h-full">
            <Image
              src={heroImageSrc}
              alt="DeryCraft deri ruj kutusu hediye koleksiyonu"
              fill
              priority
              unoptimized={usesProxiedHeroImage || heroImageSrc.startsWith("http")}
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 36vw"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,253,251,0.18),transparent_38%)]" />
            <span className="absolute bottom-5 left-5 border border-white/35 bg-neutral-950/50 px-3.5 py-2 text-[9px] font-semibold uppercase tracking-[0.22em] text-white backdrop-blur-[2px]">
              El yapımı deri
            </span>
          </div>
        </div>
      </section>

      {hasSearched ? (
        <section className="border border-[#E5D9CA] bg-[#FBF8F4] px-6 py-9 sm:px-9 sm:py-11">
          <div className="mb-7 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8B6914]">
                Seçili öneriler
              </p>
              <h2 className="mt-2 font-serif text-[1.75rem] font-medium text-neutral-950">Önerilen hediyeler</h2>
              <p className="mt-2 text-sm text-neutral-600">{summaryLabels}</p>
            </div>
            {results.length > 0 ? (
              <Link
                href={collectionHref}
                className="inline-flex min-h-11 items-center justify-center border border-neutral-900 px-6 py-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
              >
                Tümünü gör
              </Link>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">
              {results.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-[#D8C7AE] bg-white px-6 py-12 text-center">
              <p className="font-serif text-2xl text-neutral-950">Bu kriterlere uygun ürün bulunamadı</p>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-neutral-600">
                Bütçeyi artırmayı veya farklı bir hediye nedeni seçmeyi deneyin. Tüm koleksiyonumuzu da
                inceleyebilirsiniz.
              </p>
              <Link
                href={buildPath(ROUTES.products)}
                className={cn(
                  "mt-7 inline-flex min-h-11 items-center justify-center bg-neutral-950 px-7 py-3",
                  "text-[10px] font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:bg-[#8B6914]",
                )}
              >
                Tüm ürünler
              </Link>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
