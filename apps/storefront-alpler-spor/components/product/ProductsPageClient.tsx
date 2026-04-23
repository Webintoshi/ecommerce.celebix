"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Package, ShieldCheck, SlidersHorizontal, Truck } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

const ITEMS_PER_LOAD = 12;

function ProductsPageContent({
  initialProducts,
  categoryCounts = {},
}: ProductsPageClientProps) {
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  const sortedProducts = React.useMemo(() => initialProducts, [initialProducts]);

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
  const categoryTotal = Object.keys(categoryCounts).length;

  return (
    <div className="min-h-screen bg-[#F7F8F5]">
      <section className="border-b border-black/5 bg-white">
        <div className="container-premium py-8 sm:py-12 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)] lg:items-end">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-[#F26A21]">
                Alpler Spor Vitrini
              </p>
              <h1 className="max-w-4xl text-4xl font-bold leading-[1.02] text-[#121713] sm:text-5xl lg:text-6xl">
                Performansa hazir spor urunleri
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-[#5E6B62]">
                Antrenman, outdoor ve gunluk spor ihtiyaclari icin secili urunleri hizli
                tarayin; stok, fiyat ve teslimat bilgisini karar aninda gorun.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[
                { icon: SlidersHorizontal, label: "Kategori", value: categoryTotal || "Canli" },
                { icon: Package, label: "Urun", value: initialProducts.length },
                { icon: Truck, label: "Teslimat", value: "2-4 gun" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="border border-black/5 bg-[#F7F8F5] p-3 sm:p-4">
                    <Icon className="mb-3 h-4 w-4 text-[#173D32]" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#66746B]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-lg font-bold text-[#121713]">{item.value}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#173D32]">
            <span className="inline-flex items-center gap-2 bg-[#E7F2EC] px-3 py-2">
              <ShieldCheck className="h-3.5 w-3.5" />
              Guvenli odeme
            </span>
            <span className="bg-[#F4EEE7] px-3 py-2">Kolay iade</span>
            <span className="bg-[#FFF0E8] px-3 py-2 text-[#B54D17]">Hizli kargo</span>
          </div>
        </div>
      </section>

      <section className="container-premium py-8 sm:py-12">
        {visibleProducts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="border border-black/5 bg-white px-5 py-20 text-center"
          >
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center bg-[#E7F2EC]">
              <Package className="h-8 w-8 text-[#173D32]" />
            </div>
            <h3 className="mb-2 text-xl font-medium text-neutral-900">
              Urun vitrini hazir
            </h3>
            <p className="mx-auto max-w-lg text-sm leading-7 text-neutral-500">
              Alpler Spor panelinde yayinlanan ilk urunler burada performans odakli
              kartlarla otomatik sergilenir.
            </p>
          </motion.div>
        ) : (
          <>
            <motion.div
              layout
              className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7 lg:gap-y-10"
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
                <div className="flex items-center gap-2 text-neutral-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Daha fazla urun yukleniyor...</span>
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function ProductsPageClient(props: ProductsPageClientProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#F7F8F5]">
          <section className="pt-20 pb-10 sm:pt-28 sm:pb-12">
            <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
              <div className="mx-auto mb-6 h-4 w-32 animate-pulse rounded bg-neutral-200" />
              <div className="mx-auto mb-4 h-12 w-64 animate-pulse rounded bg-neutral-200" />
              <div className="mx-auto h-6 w-96 max-w-full animate-pulse rounded bg-neutral-200" />
            </div>
          </section>
          <div className="container-premium py-8 sm:py-12">
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7 lg:gap-y-10">
              {[...Array(8)].map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <ProductsPageContent {...props} />
    </React.Suspense>
  );
}
