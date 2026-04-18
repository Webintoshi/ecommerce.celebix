"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  ProductListingExperience,
  ProductListingExperienceSkeleton,
} from "@/components/product/ProductListingExperience";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

function humanizeSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ProductsPageContent({
  initialProducts,
  categoryCounts = {},
}: ProductsPageClientProps) {
  const categoryHighlights = React.useMemo(
    () =>
      Object.entries(categoryCounts)
        .sort(([, left], [, right]) => right - left)
        .slice(0, 6),
    [categoryCounts],
  );

  return (
    <div className="min-h-screen">
      <section className="container-premium pt-8 sm:pt-10">
        <div className="grid gap-6 border-b border-[rgba(35,24,21,0.08)] pb-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)] lg:items-end lg:pb-10">
          <div>
            <p className="editorial-kicker">Waya Wardrobe</p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.88] tracking-[-0.06em] text-[#1d1715] sm:text-6xl">
              Tum gorunumler
            </h1>
            <p className="editorial-copy mt-5 max-w-xl text-sm sm:text-base">
              Tum urunler deneyimi artik editorial bir vitrinde solda filtreler, sagda genis
              image-first grid ve temiz siralama hiyerarsisi ile ilerler.
            </p>
          </div>

          <div className="lg:justify-self-end lg:max-w-[26rem]">
            <p className="text-[11px] uppercase tracking-[0.24em] text-[#8d644d]">
              Category mix
            </p>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
              {categoryHighlights.length > 0 ? (
                categoryHighlights.map(([name, count]) => (
                  <span
                    key={name}
                    className="text-[11px] uppercase tracking-[0.18em] text-[#5f524a]"
                  >
                    {humanizeSlug(name)} / {count}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[#5f524a]">
                  Koleksiyonlar urunlerle birlikte gorunecek.
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="container-premium py-8 sm:py-12">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <ProductListingExperience
            products={initialProducts}
            emptyTitle="Vitrin hazir"
            emptyDescription="Adminde yayinlanan ilk urunler geldigi anda bu alan Butik Waya kartlariyla otomatik olarak dolar."
            chipMode="categories"
          />
        </motion.div>
      </section>
    </div>
  );
}

export function ProductsPageClient({
  initialProducts,
  categoryCounts,
}: ProductsPageClientProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen">
          <section className="container-premium pt-8 sm:pt-10">
            <div className="border-b border-[rgba(35,24,21,0.08)] px-1 py-10">
              <div className="mb-6 h-4 w-32 animate-pulse rounded bg-neutral-200" />
              <div className="mb-4 h-16 w-72 animate-pulse rounded bg-neutral-200" />
              <div className="h-6 w-[32rem] max-w-full animate-pulse rounded bg-neutral-200" />
            </div>
          </section>
          <div className="container-premium py-8 sm:py-12">
            <ProductListingExperienceSkeleton />
          </div>
        </div>
      }
    >
      <ProductsPageContent initialProducts={initialProducts} categoryCounts={categoryCounts} />
    </React.Suspense>
  );
}
