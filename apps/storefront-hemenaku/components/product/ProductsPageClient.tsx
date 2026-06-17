"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Package, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { DEFAULT_DEMO_PRODUCT_CARDS } from "@/lib/default-demo-theme";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

const ITEMS_PER_LOAD = 12;

function ProductsPageContent({ initialProducts }: ProductsPageClientProps) {
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

  return (
    <div className="min-h-screen bg-[#F7FAF9]">
      <section className="border-b border-[#DDE7E4] bg-white">
        <div className="container-premium py-12 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-[#0F766E]">Urunler</p>
              <h1 className="mt-3 text-4xl font-semibold leading-tight text-[#111827] sm:text-5xl">
                Hemenaku vitrini
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#526B66] sm:text-base">
                Secili urunleri, net fiyat bilgisini ve sepet adimlarini sade bir alisveris akisi icinde inceleyin.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-lg border border-[#DDE7E4] bg-[#F0FDFA] p-4">
                <ShieldCheck className="h-5 w-5 text-[#0F766E]" />
                <p className="mt-2 text-sm font-semibold text-[#111827]">Guvenli odeme akisi</p>
              </div>
              <div className="rounded-lg border border-[#F6C99C] bg-[#FFF7ED] p-4">
                <Truck className="h-5 w-5 text-[#EA580C]" />
                <p className="mt-2 text-sm font-semibold text-[#111827]">Teslimat ve iade destegi</p>
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
            className="rounded-lg border border-[#DDE7E4] bg-white px-5 py-16 text-center shadow-sm sm:px-8 sm:py-20"
          >
            <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#F0FDFA]">
              <Package className="h-8 w-8 text-[#0F766E]" />
            </div>
            <h3 className="mb-2 text-2xl font-semibold text-[#111827]">
              Urun secimi hazirlaniyor
            </h3>
            <p className="mx-auto max-w-lg text-sm leading-7 text-[#526B66]">
              Hemenaku secimleri yakinda burada listelenecek. Bu surecte iletisim sayfasindan destek alabilir veya vitrin rotalarini inceleyebilirsiniz.
            </p>
            <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
              {DEFAULT_DEMO_PRODUCT_CARDS.map((card) => (
                <div key={card.id} className="overflow-hidden rounded-lg border border-[#DDE7E4] bg-white text-left">
                  <div className="aspect-square">
                    <DefaultDemoPlaceholder id={card.placeholder} label={card.title} compact />
                  </div>
                  <div className="p-4">
                    <p className="text-[10px] font-semibold uppercase text-[#0F766E]">
                      {card.eyebrow}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-[#111827]">{card.title}</p>
                    <p className="mt-1 text-xs text-[#EA580C]">{card.priceLabel}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/iletisim"
                className="inline-flex items-center justify-center rounded-full bg-[#0F766E] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#115E59]"
              >
                Iletisime Gec
              </Link>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#DDE7E4] px-5 py-3 text-sm font-semibold text-[#111827] transition hover:border-[#0F766E] hover:text-[#0F766E]"
              >
                Ana Sayfaya Don
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        ) : (
          <>
            <motion.div
              layout
              className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6"
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
                  <span className="text-sm">Daha fazla ürün yükleniyor...</span>
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 lg:gap-6">
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
