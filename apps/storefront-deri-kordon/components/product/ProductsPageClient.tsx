"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Search, X, Loader2, ArrowUpDown } from "lucide-react";

interface ProductsPageClientProps {
  initialProducts: Product[];
}

const SORT_OPTIONS = [
  { value: "featured", label: "Öne Çıkanlar" },
  { value: "newest", label: "En Yeni" },
  { value: "price-asc", label: "Fiyat: Düşük → Yüksek" },
  { value: "price-desc", label: "Fiyat: Yüksek → Düşük" },
  { value: "rating", label: "En Çok Puanlanan" },
  { value: "popular", label: "En Popüler" },
];

const ITEMS_PER_LOAD = 12;

type ProductSortOption =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "popular";

function ProductsPageContent({ initialProducts }: ProductsPageClientProps) {
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortOption, setSortOption] =
    React.useState<ProductSortOption>("featured");
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  const sortedProducts = React.useMemo(() => {
    let products = [...initialProducts];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.description?.toLowerCase().includes(query) ||
          p.tags?.some((t) => t.toLowerCase().includes(query))
      );
    }

    switch (sortOption) {
      case "newest":
        products.sort((a, b) => (b.new ? 1 : 0) - (a.new ? 1 : 0));
        break;
      case "price-asc":
        products.sort(
          (a, b) =>
            Math.min(...a.variants.map((v) => v.price)) -
            Math.min(...b.variants.map((v) => v.price))
        );
        break;
      case "price-desc":
        products.sort(
          (a, b) =>
            Math.min(...b.variants.map((v) => v.price)) -
            Math.min(...a.variants.map((v) => v.price))
        );
        break;
      case "rating":
        products.sort((a, b) => b.rating - a.rating);
        break;
      case "popular":
        products.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case "featured":
      default:
        products.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
        break;
    }

    return products;
  }, [initialProducts, searchQuery, sortOption]);

  React.useEffect(() => {
    setDisplayCount(ITEMS_PER_LOAD);
  }, [searchQuery, sortOption]);

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
      {/* Hero */}
      <section className="pt-20 pb-12 sm:pt-28 sm:pb-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-block text-xs text-neutral-400 uppercase tracking-[0.2em] mb-6"
          >
            Koleksiyon
          </motion.span>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl lg:text-6xl font-medium text-neutral-900 mb-6 tracking-tight"
          >
            Tüm Ürünler
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-neutral-500 leading-relaxed max-w-2xl mx-auto"
          >
            El yapımı premium deri aksesuar koleksiyonumuzu keşfedin.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-white border border-neutral-200 rounded-full text-neutral-600 text-sm"
          >
            <Package className="w-4 h-4" />
            {initialProducts.length} Ürün
          </motion.div>
        </div>
      </section>

      {/* Controls */}
      <section className="sticky top-0 z-40 bg-[#F8F8F8]/95 backdrop-blur-md border-b border-neutral-200">
        <div className="container-premium py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
              <input
                type="text"
                placeholder="Ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-10 py-3 bg-white border border-neutral-200 rounded-xl text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-neutral-100 text-neutral-600 rounded-full flex items-center justify-center hover:bg-neutral-200 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="relative">
              <select
                value={sortOption}
                onChange={(e) =>
                  setSortOption(e.target.value as ProductSortOption)
                }
                className="appearance-none bg-white px-4 py-3 pr-10 border border-neutral-200 rounded-xl text-neutral-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-neutral-200 cursor-pointer"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg
                  className="w-4 h-4 text-neutral-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </section>

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
            <p className="text-neutral-500 mb-6">
              Farklı bir arama terimi deneyin.
            </p>
            <button
              onClick={() => setSearchQuery("")}
              className="px-6 py-3 bg-neutral-900 text-white font-medium rounded-xl hover:bg-neutral-800 transition-colors"
            >
              Aramayı Temizle
            </button>
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
          <section className="pt-20 pb-12 sm:pt-28 sm:pb-16">
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
