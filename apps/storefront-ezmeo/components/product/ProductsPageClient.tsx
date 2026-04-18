"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Package } from "lucide-react";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

const ITEMS_PER_LOAD = 12;

function humanizeCategory(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ProductsPageContent({
  initialProducts,
  categoryCounts,
}: ProductsPageClientProps) {
  const { locale } = useStorefrontRoute();
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  const categoryHighlights = React.useMemo(
    () =>
      Object.entries(categoryCounts || {})
        .sort((left, right) => right[1] - left[1])
        .slice(0, 5),
    [categoryCounts],
  );

  React.useEffect(() => {
    if (!loadMoreRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          displayCount < initialProducts.length &&
          !isLoadingMore
        ) {
          setIsLoadingMore(true);
          window.setTimeout(() => {
            setDisplayCount((prev) =>
              Math.min(prev + ITEMS_PER_LOAD, initialProducts.length),
            );
            setIsLoadingMore(false);
          }, 240);
        }
      },
      { rootMargin: "240px" },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [displayCount, initialProducts.length, isLoadingMore]);

  const visibleProducts = initialProducts.slice(0, displayCount);
  const hasMore = displayCount < initialProducts.length;

  return (
    <div className="pb-8">
      <section className="pt-4 md:pt-6">
        <div className="container-premium">
          <div className="surface-card px-5 py-6 md:px-7 md:py-7 lg:px-8">
            <p className="editorial-kicker">Tum urunler</p>
            <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-3xl">
                <h1 className="text-[var(--foreground)]">
                  Premium ezmeleri daha hizli taranan temiz bir katalog akisi ile kesfet.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-8 text-[var(--muted-foreground)] md:text-base">
                  Liste, urun gorseli, gramaj, fiyat ve tek bir karar cagrisi etrafinda kurulur. Mobilde once urun okunur, sonra kategori detayina gecilir.
                </p>
              </div>

              <div className="chip">{initialProducts.length} urun listeleniyor</div>
            </div>

            {categoryHighlights.length > 0 ? (
              <div className="mt-6 flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                {categoryHighlights.map(([key, count]) => (
                  <Link
                    key={key}
                    href={buildLocalizedPath(`/${key}`, locale)}
                    className="min-w-[13rem] rounded-[1.25rem] border border-[var(--border)] bg-[var(--muted)] px-4 py-4 transition hover:border-[rgba(36,25,21,0.18)] hover:bg-white"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      Koleksiyon
                    </p>
                    <p className="mt-2 text-base font-semibold text-[var(--foreground)]">
                      {humanizeCategory(key)}
                    </p>
                    <p className="mt-1 text-sm text-[var(--muted-foreground)]">{count} urun</p>
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="pt-8 md:pt-10">
        <div className="container-premium">
          {visibleProducts.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="surface-card py-16 text-center"
            >
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[rgba(36,25,21,0.05)]">
                <Package className="h-8 w-8 text-[var(--muted-foreground)]" />
              </div>
              <h3 className="mb-2 text-2xl text-[var(--foreground)]">
                Vitrin hazirlaniyor
              </h3>
              <p className="mx-auto max-w-lg text-sm leading-7 text-[var(--muted-foreground)]">
                Yayinlanan ilk urunler geldikce bu alan otomatik olarak katalog kartlariyla dolar.
              </p>
            </motion.div>
          ) : (
            <>
              <motion.div
                layout
                className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
              >
                <AnimatePresence mode="popLayout">
                  {visibleProducts.map((product, index) => (
                    <motion.div
                      key={product.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96 }}
                      transition={{ delay: Math.min(index * 0.03, 0.18) }}
                    >
                      <ProductCard product={product} index={index} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>

              <div ref={loadMoreRef} className="mt-10 flex justify-center">
                {hasMore ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 py-3 text-[var(--muted-foreground)]">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">
                      Daha fazla urun yukleniyor...
                    </span>
                  </div>
                ) : null}
              </div>

              {!hasMore && visibleProducts.length > 0 ? (
                <div className="mt-10 flex justify-center">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">
                    {initialProducts.length} urunun tamami listelendi
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
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
        <div className="pb-8">
          <section className="pt-4 md:pt-6">
            <div className="container-premium">
              <div className="surface-card px-5 py-10 md:px-7 lg:px-8">
                <div className="h-4 w-28 animate-pulse rounded-full bg-[rgba(36,25,21,0.08)]" />
                <div className="mt-5 h-16 w-full max-w-3xl animate-pulse rounded-3xl bg-[rgba(36,25,21,0.08)]" />
                <div className="mt-4 h-6 w-full max-w-2xl animate-pulse rounded-2xl bg-[rgba(36,25,21,0.08)]" />
              </div>
            </div>
          </section>
          <div className="container-premium pt-8 md:pt-10">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(9)].map((_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <ProductsPageContent
        initialProducts={initialProducts}
        categoryCounts={categoryCounts}
      />
    </React.Suspense>
  );
}
