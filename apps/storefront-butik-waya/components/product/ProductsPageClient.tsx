"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Package } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

const ITEMS_PER_LOAD = 12;

function ProductsPageContent({ initialProducts, categoryCounts = {} }: ProductsPageClientProps) {
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  const sortedProducts = React.useMemo(() => initialProducts, [initialProducts]);
  const categoryHighlights = React.useMemo(
    () =>
      Object.entries(categoryCounts)
        .sort(([, left], [, right]) => right - left)
        .slice(0, 4),
    [categoryCounts],
  );

  React.useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          displayCount < sortedProducts.length &&
          !isLoadingMore
        ) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setDisplayCount((prev) =>
              Math.min(prev + ITEMS_PER_LOAD, sortedProducts.length),
            );
            setIsLoadingMore(false);
          }, 300);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [displayCount, sortedProducts.length, isLoadingMore]);

  const visibleProducts = sortedProducts.slice(0, displayCount);
  const hasMore = displayCount < sortedProducts.length;

  return (
    <div className="min-h-screen">
      <section className="container-premium pt-8 sm:pt-10">
        <div className="grid gap-8 rounded-[2.25rem] border border-[rgba(35,24,21,0.08)] bg-[rgba(255,250,244,0.88)] px-6 py-8 shadow-[0_30px_90px_-60px_rgba(27,18,14,0.55)] lg:grid-cols-[0.85fr_1.15fr] lg:px-8 lg:py-10">
          <div>
            <p className="editorial-kicker">Waya Wardrobe</p>
            <h1 className="mt-5 font-serif text-5xl leading-[0.88] tracking-[-0.06em] text-[#1d1715] sm:text-6xl">
              Tum gorunumler
            </h1>
            <p className="editorial-copy mt-5 max-w-xl text-sm sm:text-base">
              Koleksiyon sayfasi, yeni sezon dokulari ile gunluk akisin kolay parcalarini ayni
              cizgide bir araya getiriyor. Her urun gercek veri akisi korunarak vitrine tasiniyor.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-[1.75rem] bg-[#1d1715] p-5 text-white">
              <p className="text-[11px] uppercase tracking-[0.24em] text-white/58">Inventory</p>
              <p className="mt-4 font-serif text-5xl leading-none tracking-[-0.05em]">
                {sortedProducts.length}
              </p>
              <p className="mt-3 text-sm leading-7 text-white/70">Yayinda olan secili urun</p>
            </div>

            <div className="rounded-[1.75rem] border border-[rgba(35,24,21,0.08)] bg-white/70 p-5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#8d644d]">Collection mix</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {categoryHighlights.length > 0 ? (
                  categoryHighlights.map(([name, count]) => (
                    <span
                      key={name}
                      className="rounded-full border border-[rgba(35,24,21,0.08)] bg-white px-3 py-2 text-xs uppercase tracking-[0.16em] text-[#1d1715]"
                    >
                      {name} / {count}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-[#5f524a]">Koleksiyonlar urunlerle birlikte gorunecek.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container-premium py-8 sm:py-12">
        {visibleProducts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[2rem] border border-[rgba(35,24,21,0.08)] bg-[rgba(255,250,244,0.88)] py-20 text-center shadow-[0_24px_70px_-50px_rgba(27,18,14,0.55)]"
          >
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#eadfd5]">
              <Package className="h-8 w-8 text-[#8d644d]" />
            </div>
            <h3 className="mb-2 font-serif text-4xl leading-none tracking-[-0.04em] text-[#1d1715]">
              Vitrin hazir
            </h3>
            <p className="mx-auto max-w-lg text-sm leading-7 text-[#5f524a]">
              Adminde yayinlanan ilk urunler geldigi anda bu alan Butik Waya kartlariyla
              otomatik olarak dolar.
            </p>
          </motion.div>
        ) : (
          <>
            <motion.div
              layout
              className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8"
            >
              <AnimatePresence mode="popLayout">
                {visibleProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  >
                    <ProductCard product={product} index={index} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>

            <div ref={loadMoreRef} className="mt-12 flex justify-center">
              {hasMore ? (
                <div className="flex items-center gap-3 rounded-full border border-[rgba(35,24,21,0.08)] bg-white/72 px-5 py-3 text-[#5f524a]">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm uppercase tracking-[0.18em]">Daha fazla urun yukleniyor</span>
                </div>
              ) : null}
            </div>
          </>
        )}
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
            <div className="rounded-[2.25rem] border border-[rgba(35,24,21,0.08)] bg-[rgba(255,250,244,0.88)] px-6 py-10">
              <div className="mb-6 h-4 w-32 animate-pulse rounded bg-neutral-200" />
              <div className="mb-4 h-16 w-72 animate-pulse rounded bg-neutral-200" />
              <div className="h-6 w-[32rem] max-w-full animate-pulse rounded bg-neutral-200" />
            </div>
          </section>
          <div className="container-premium py-8 sm:py-12">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {[...Array(9)].map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <ProductsPageContent initialProducts={initialProducts} categoryCounts={categoryCounts} />
    </React.Suspense>
  );
}
