"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Package } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
}

const ITEMS_PER_LOAD = 12;

function ProductsPageContent({ initialProducts }: ProductsPageClientProps) {
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  const sortedProducts = React.useMemo(() => {
    return [...initialProducts].sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return (b.new ? 1 : 0) - (a.new ? 1 : 0);
    });
  }, [initialProducts]);

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
            setDisplayCount((prev) => Math.min(prev + ITEMS_PER_LOAD, sortedProducts.length));
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
    <div className="min-h-screen bg-[#F8F8F8]">
      <section className="container-premium py-8 sm:py-12">
        {visibleProducts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-[28px] border border-neutral-200 bg-white py-20 text-center shadow-[0_18px_48px_-36px_rgba(42,28,15,0.18)]"
          >
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-neutral-100">
              <Package className="h-8 w-8 text-neutral-400" />
            </div>
            <h3 className="mb-2 text-xl font-medium text-neutral-900">Urun vitrini hazir</h3>
            <p className="mx-auto max-w-lg text-sm leading-7 text-neutral-500">
              Adminde yayinlanan ilk urunler geldigi anda bu alan premium urun kartlariyla otomatik dolar.
            </p>
          </motion.div>
        ) : (
          <>
            <motion.div
              layout
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8"
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

export function ProductsPageClient({ initialProducts }: ProductsPageClientProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F8F8]">
          <section className="pt-20 pb-10 sm:pt-28 sm:pb-12">
            <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
              <div className="mx-auto mb-6 h-4 w-32 animate-pulse rounded bg-neutral-200" />
              <div className="mx-auto mb-4 h-12 w-64 animate-pulse rounded bg-neutral-200" />
              <div className="mx-auto h-6 w-96 max-w-full animate-pulse rounded bg-neutral-200" />
            </div>
          </section>
          <div className="container-premium py-8 sm:py-12">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-8">
              {[...Array(9)].map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <ProductsPageContent initialProducts={initialProducts} />
    </React.Suspense>
  );
}
