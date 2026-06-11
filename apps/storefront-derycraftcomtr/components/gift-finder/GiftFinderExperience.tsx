"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { GiftFinderDropdown } from "@/components/gift-finder/GiftFinderDropdown";
import { buildStorefrontTransformedImageUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import {
  DEFAULT_GIFT_FINDER_FILTERS,
  GIFT_BUDGET_OPTIONS,
  GIFT_CATEGORY_LABELS,
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

const HERO_IMAGE = "/Hero_banner_Bir.jpg";

export function GiftFinderExperience({ products }: GiftFinderExperienceProps) {
  const { buildPath } = useStorefrontRoute();
  const [filters, setFilters] = useState<GiftFinderFilters>(DEFAULT_GIFT_FINDER_FILTERS);
  const [openFilter, setOpenFilter] = useState<OpenFilterKey>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const heroImageSrc =
    buildStorefrontTransformedImageUrl(HERO_IMAGE, { width: 960, quality: 80 }) || HERO_IMAGE;

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
      <section className="overflow-hidden border border-[#E8DFD3] bg-white">
        <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.65fr)] xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.55fr)]">
          <div className="flex flex-col justify-center px-5 py-7 sm:px-8 sm:py-9 lg:px-9 lg:py-10 xl:px-10">
            <div className="mb-5 lg:mb-6 xl:mb-0 xl:flex xl:items-end xl:justify-between xl:gap-8">
              <div className="shrink-0 xl:max-w-[280px]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-neutral-600">
                  Kalıcı ve unutulmaz
                </p>
                <h1 className="mt-2 font-serif text-[1.65rem] font-medium leading-tight text-[#8B6914] sm:text-[1.9rem] lg:text-[2rem]">
                  Bir hediye arıyorum
                </h1>
              </div>

              <div className="mt-5 flex flex-1 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end xl:mt-0 xl:justify-end xl:gap-x-4 xl:gap-y-3">
              <GiftFinderDropdown
                label="Kim için"
                value={filters.recipient}
                options={GIFT_RECIPIENT_OPTIONS}
                isOpen={openFilter === "recipient"}
                onOpen={() => setOpenFilter("recipient")}
                onClose={() => setOpenFilter(null)}
                onChange={(value) =>
                  setFilters((current) => ({ ...current, recipient: value as GiftFinderFilters["recipient"] }))
                }
              />
              <GiftFinderDropdown
                label="Bütçe"
                value={filters.budget}
                options={GIFT_BUDGET_OPTIONS}
                isOpen={openFilter === "budget"}
                onOpen={() => setOpenFilter("budget")}
                onClose={() => setOpenFilter(null)}
                onChange={(value) =>
                  setFilters((current) => ({ ...current, budget: value as GiftFinderFilters["budget"] }))
                }
              />
              <GiftFinderDropdown
                label="Hediye nedeni"
                value={filters.occasion}
                options={GIFT_OCCASION_OPTIONS}
                isOpen={openFilter === "occasion"}
                onOpen={() => setOpenFilter("occasion")}
                onClose={() => setOpenFilter(null)}
                onChange={(value) =>
                  setFilters((current) => ({ ...current, occasion: value as GiftFinderFilters["occasion"] }))
                }
              />

              <button
                type="button"
                onClick={handleFindGift}
                className="inline-flex min-h-11 shrink-0 items-center justify-center border border-neutral-900 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-neutral-900 transition-colors hover:border-[#8B6914] hover:bg-[#8B6914] hover:text-white sm:px-7"
              >
                Hediyemi bul
              </button>
              </div>
            </div>

            {errorMessage ? (
              <p className="mt-4 text-sm text-[#8B6914] xl:mt-5" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <div className="relative min-h-[200px] bg-[#f3efe8] sm:min-h-[220px] lg:min-h-[260px] lg:max-h-[300px]">
            <Image
              src={heroImageSrc}
              alt="DeryCraft deri hediye koleksiyonu"
              fill
              priority
              className="object-cover object-center"
              sizes="(max-width: 1024px) 100vw, 40vw"
            />
            <span className="absolute bottom-4 left-4 border border-white/50 bg-neutral-900/45 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur-sm">
              El yapımı deri
            </span>
          </div>
        </div>
      </section>

      {hasSearched ? (
        <section className="border border-[#E8DFD3] bg-[#FBF8F4] px-5 py-8 sm:px-8 sm:py-10">
          <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-serif text-2xl font-medium text-neutral-950">Önerilen hediyeler</h2>
              <p className="mt-2 text-sm text-neutral-600">{summaryLabels}</p>
            </div>
            {results.length > 0 ? (
              <Link
                href={collectionHref}
                className="inline-flex min-h-11 items-center justify-center border border-neutral-900 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white"
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
            <div className="rounded-2xl border border-dashed border-[#E8DFD3] bg-white px-6 py-10 text-center">
              <p className="font-serif text-xl text-neutral-900">Bu kriterlere uygun ürün bulunamadı</p>
              <p className="mt-3 text-sm leading-7 text-neutral-600">
                Bütçeyi artırmayı veya farklı bir hediye nedeni seçmeyi deneyin. Tüm koleksiyonumuzu da
                inceleyebilirsiniz.
              </p>
              <Link
                href={buildPath(ROUTES.products)}
                className={cn(
                  "mt-6 inline-flex min-h-11 items-center justify-center border border-neutral-900 px-6 py-3",
                  "text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-900 transition-colors hover:bg-neutral-900 hover:text-white",
                )}
              >
                Tüm ürünler
              </Link>
            </div>
          )}

          {results.length > 0 ? (
            <p className="mt-6 text-xs text-neutral-500">
              Öne çıkan kategoriler:{" "}
              {[...new Set(results.map(getPrimaryGiftCategorySlug).filter(Boolean))]
                .map((slug) => GIFT_CATEGORY_LABELS[slug] ?? slug)
                .join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
