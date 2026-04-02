"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Package, Loader2 } from "lucide-react";

interface ProductsPageClientProps {
  initialProducts: Product[];
}

const ITEMS_PER_LOAD = 12;

function ProductsPageContent({ initialProducts }: ProductsPageClientProps) {
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  const sortedProducts = React.useMemo(() => {
    // Sort by featured first, then by newest
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
            setDisplayCount((prev) =>
              Math.min(prev + ITEMS_PER_LOAD, sortedProducts.length)
            );
            setIsLoadingMore(false);
          }, 300);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [displayCount, sortedProducts.length, isLoadingMore]);

  const visibleProducts = sortedProducts.slice(0, displayCount);
  const hasMore = displayCount < sortedProducts.length;

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      {/* Product Grid */}
      <section className="container-premium py-8 sm:py-12">
        {visibleProducts.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-20 bg-white border border-neutral-200 rounded-2xl"
          >
            <div className="w-20 h-20 mx-auto mb-5 bg-neutral-100 rounded-full flex items-center justify-center">
              <Package className="w-8 h-8 text-neutral-400" />
            </div>
            <h3 className="text-xl font-medium text-neutral-900 mb-2">
              Ürün Bulunamadı
            </h3>
            <p className="text-neutral-500">
              Yakında yeni ürünler eklenecek.
            </p>
          </motion.div>
        ) : (
          <>
            <motion.div
              layout
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8"
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

            {/* Infinite Scroll Trigger / Loader */}
            <div ref={loadMoreRef} className="mt-12 flex justify-center">
              {hasMore && (
                <div className="flex items-center gap-2 text-neutral-500">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Daha fazla ürün yükleniyor...</span>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function ProductsPageClient({
  initialProducts,
}: ProductsPageClientProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F8F8]">
          <section className="pt-20 pb-10 sm:pt-28 sm:pb-12">
            <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
              <div className="h-4 w-32 bg-neutral-200 rounded mx-auto mb-6 animate-pulse" />
              <div className="h-12 w-64 bg-neutral-200 rounded mx-auto mb-4 animate-pulse" />
              <div className="h-6 w-96 bg-neutral-200 rounded mx-auto animate-pulse" />
            </div>
          </section>
          <div className="container-premium py-8 sm:py-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {[...Array(9)].map((_, i) => (
                <ProductCardSkeleton key={i} />
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
