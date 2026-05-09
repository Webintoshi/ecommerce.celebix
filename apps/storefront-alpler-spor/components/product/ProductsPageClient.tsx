"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUpDown,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ActiveFilters, FilterCategoryOption, FilterSidebar, FilterState } from "@/components/product/FilterSidebar";
import { FilterDrawer } from "@/components/product/FilterDrawer";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Product } from "@/types/product";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

type SortOption = "recommended" | "newest" | "price-asc" | "price-desc" | "popular" | "discounted";

const ITEMS_PER_LOAD = 12;

function getLowestPricedVariant(product: Product) {
  return [...(product.variants || [])]
    .filter((variant) => typeof variant.price === "number")
    .sort((left, right) => left.price - right.price)[0];
}

function hasDiscount(product: Product) {
  return (product.variants || []).some(
    (variant) =>
      typeof variant.originalPrice === "number" &&
      typeof variant.price === "number" &&
      variant.originalPrice > variant.price,
  );
}

function hasStock(product: Product) {
  return (product.variants || []).some((variant) => Number(variant.stock || 0) > 0);
}

function normalizeText(value?: string | null) {
  return String(value || "").toLocaleLowerCase("tr-TR");
}

function formatCategoryLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function buildCategoryOptions(products: Product[], categoryCounts: Record<string, number>): FilterCategoryOption[] {
  const categoryMap = new Map<string, number>();

  products.forEach((product) => {
    if (product.category) {
      categoryMap.set(product.category, (categoryMap.get(product.category) || 0) + 1);
    }
  });

  Object.entries(categoryCounts).forEach(([category, count]) => {
    if (category) categoryMap.set(category, count);
  });

  return Array.from(categoryMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0], "tr"))
    .map(([value, count]) => ({
      value,
      label: formatCategoryLabel(value),
      count,
    }));
}

function getMaxPrice(products: Product[]) {
  const prices = products.flatMap((product) =>
    (product.variants || [])
      .map((variant) => Number(variant.originalPrice || variant.price || 0))
      .filter((price) => Number.isFinite(price) && price > 0),
  );
  const max = prices.length ? Math.max(...prices) : 5000;
  return Math.max(500, Math.ceil(max / 500) * 500);
}

function createDefaultFilters(maxPrice: number): FilterState {
  return {
    categories: [],
    priceRange: [0, maxPrice],
    vegan: false,
    sugarFree: false,
    highProtein: false,
    glutenFree: false,
    inStock: false,
    onSale: false,
    isNew: false,
  };
}

function productMatchesSearch(product: Product, query: string) {
  if (!query) return true;

  const haystack = [
    product.name,
    product.shortDescription,
    product.category,
    product.subcategory,
    product.brand,
    ...(product.tags || []),
  ]
    .map(normalizeText)
    .join(" ");

  return haystack.includes(query);
}

function productMatchesFilters(product: Product, filters: FilterState, maxPrice: number) {
  const variant = getLowestPricedVariant(product);
  const price = Number(variant?.price || 0);
  const categoryMatches =
    filters.categories.length === 0 ||
    filters.categories.includes(product.category) ||
    filters.categories.includes(product.subcategory);

  return (
    categoryMatches &&
    price >= filters.priceRange[0] &&
    price <= (filters.priceRange[1] || maxPrice) &&
    (!filters.vegan || product.vegan) &&
    (!filters.sugarFree || product.sugarFree) &&
    (!filters.highProtein || product.highProtein) &&
    (!filters.glutenFree || product.glutenFree) &&
    (!filters.inStock || hasStock(product)) &&
    (!filters.onSale || hasDiscount(product)) &&
    (!filters.isNew || product.new)
  );
}

function sortProducts(products: Product[], sort: SortOption, originalOrder: Product[]) {
  const originalIndex = new Map(originalOrder.map((product, index) => [product.id, index]));
  const sortable = [...products];

  if (sort === "price-asc") {
    return sortable.sort((left, right) => (getLowestPricedVariant(left)?.price || 0) - (getLowestPricedVariant(right)?.price || 0));
  }

  if (sort === "price-desc") {
    return sortable.sort((left, right) => (getLowestPricedVariant(right)?.price || 0) - (getLowestPricedVariant(left)?.price || 0));
  }

  if (sort === "discounted") {
    return sortable.sort((left, right) => Number(hasDiscount(right)) - Number(hasDiscount(left)));
  }

  if (sort === "newest") {
    return sortable.sort((left, right) => Number(Boolean(right.new)) - Number(Boolean(left.new)));
  }

  if (sort === "popular") {
    return sortable.sort(
      (left, right) =>
        Number(Boolean(right.isBestseller)) - Number(Boolean(left.isBestseller)) ||
        Number(right.sales_count || 0) - Number(left.sales_count || 0) ||
        Number(right.rating || 0) - Number(left.rating || 0),
    );
  }

  return sortable.sort((left, right) => (originalIndex.get(left.id) || 0) - (originalIndex.get(right.id) || 0));
}

function ProductsPageContent({
  initialProducts,
  categoryCounts = {},
}: ProductsPageClientProps) {
  const maxPrice = React.useMemo(() => getMaxPrice(initialProducts), [initialProducts]);
  const categoryOptions = React.useMemo(
    () => buildCategoryOptions(initialProducts, categoryCounts),
    [categoryCounts, initialProducts],
  );
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sort, setSort] = React.useState<SortOption>("recommended");
  const [filters, setFilters] = React.useState<FilterState>(() => createDefaultFilters(maxPrice));
  const loadMoreRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setFilters((current) => ({
      ...current,
      priceRange: [
        Math.min(current.priceRange[0], maxPrice),
        current.priceRange[1] === 5000 ? maxPrice : Math.min(current.priceRange[1], maxPrice),
      ],
    }));
  }, [maxPrice]);

  const normalizedQuery = normalizeText(searchQuery.trim());
  const filteredProducts = React.useMemo(() => {
    const filtered = initialProducts.filter(
      (product) =>
        productMatchesSearch(product, normalizedQuery) &&
        productMatchesFilters(product, filters, maxPrice),
    );

    return sortProducts(filtered, sort, initialProducts);
  }, [filters, initialProducts, maxPrice, normalizedQuery, sort]);

  React.useEffect(() => {
    setDisplayCount(ITEMS_PER_LOAD);
  }, [filters, normalizedQuery, sort]);

  React.useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          displayCount < filteredProducts.length &&
          !isLoadingMore
        ) {
          setIsLoadingMore(true);
          window.setTimeout(() => {
            setDisplayCount((prev) => Math.min(prev + ITEMS_PER_LOAD, filteredProducts.length));
            setIsLoadingMore(false);
          }, 220);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [displayCount, filteredProducts.length, isLoadingMore]);

  const visibleProducts = filteredProducts.slice(0, displayCount);
  const hasMore = displayCount < filteredProducts.length;
  const updateFilters = (nextFilters: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...nextFilters }));
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSort("recommended");
    setFilters(createDefaultFilters(maxPrice));
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <section className="container-premium py-6 sm:py-8 lg:py-10">
        <div className="mb-6 rounded-[2rem] border border-[#E5E7EB] bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_170px]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Ürün, marka veya kategori ara"
                className="h-12 w-full rounded-2xl border border-[#D1D5DB] bg-white pl-12 pr-4 text-sm font-semibold text-[#111827] outline-none transition focus:border-[#FF6A00] focus:ring-4 focus:ring-[#FF6A00]/15"
              />
            </label>

            <label className="relative block">
              <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
                className="h-12 w-full appearance-none rounded-2xl border border-[#D1D5DB] bg-white pl-11 pr-4 text-sm font-bold text-[#111827] outline-none transition focus:border-[#FF6A00] focus:ring-4 focus:ring-[#FF6A00]/15"
              >
                <option value="recommended">Onerilen</option>
                <option value="newest">Yeni Gelenler</option>
                <option value="price-asc">En Dusuk Fiyat</option>
                <option value="price-desc">En Yuksek Fiyat</option>
                <option value="popular">Cok Satanlar</option>
                <option value="discounted">İndirimdekiler</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#111827] px-4 text-sm font-bold text-white transition hover:bg-[#1F2937] lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4 text-[#FF6A00]" />
              Filtrele
            </button>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <FilterSidebar
                filters={filters}
                onFilterChange={updateFilters}
                categoryCounts={categoryCounts}
                categoryOptions={categoryOptions}
                maxPrice={maxPrice}
              />
            </div>
          </aside>

          <div className="min-w-0">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#374151]">
                  {filteredProducts.length} urun listeleniyor
                </p>
                <p className="mt-1 text-xs text-[#6B7280]">
                  Filtre, stok ve fiyat bilgileri mevcut urun verisi uzerinden hesaplanir.
                </p>
              </div>
              <ActiveFilters
                filters={filters}
                onFilterChange={updateFilters}
                categoryOptions={categoryOptions}
                maxPrice={maxPrice}
              />
            </div>

            {visibleProducts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-[2rem] border border-[#E5E7EB] bg-white px-5 py-20 text-center shadow-sm"
              >
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-[#EEF2F7]">
                  <Package className="h-8 w-8 text-[#6B7280]" />
                </div>
                <h3 className="mb-2 text-xl font-black text-[#111827]">
                  Bu filtrelere uygun urun bulunamadi.
                </h3>
                <p className="mx-auto max-w-lg text-sm leading-7 text-[#6B7280]">
                  Arama kelimesini veya filtreleri degistirerek Alpler Spor urunlerini tekrar tarayin.
                </p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-6 rounded-full bg-[#FF6A00] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#E85F00]"
                >
                  Filtreleri temizle
                </button>
              </motion.div>
            ) : (
              <>
                <motion.div
                  layout
                  className="mx-auto grid max-w-[1240px] grid-cols-1 gap-x-4 gap-y-7 sm:grid-cols-2 sm:gap-x-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 xl:gap-x-6 xl:gap-y-9"
                >
                  <AnimatePresence mode="popLayout">
                    {visibleProducts.map((product, index) => (
                      <motion.div
                        key={product.id}
                        layout
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ delay: Math.min(index * 0.02, 0.2) }}
                      >
                        <ProductCard product={product} index={index} cardVariant="catalog" />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>

                <div ref={loadMoreRef} className="mt-12 flex justify-center">
                  {hasMore ? (
                    <div className="flex items-center gap-2 text-[#6B7280]">
                      <Loader2 className="h-5 w-5 animate-spin text-[#FF6A00]" />
                      <span className="text-sm">Daha fazla urun yukleniyor...</span>
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <FilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFilterChange={updateFilters}
        categoryCounts={categoryCounts}
        categoryOptions={categoryOptions}
        maxPrice={maxPrice}
      />
    </div>
  );
}

export function ProductsPageClient(props: ProductsPageClientProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#F5F7FA]">
          <section className="bg-[#111827] py-16">
            <div className="container-premium">
              <div className="mb-4 h-4 w-36 animate-pulse rounded-full bg-white/15" />
              <div className="mb-4 h-12 w-72 max-w-full animate-pulse rounded bg-white/15" />
              <div className="h-6 w-96 max-w-full animate-pulse rounded bg-white/10" />
            </div>
          </section>
          <div className="container-premium py-8 sm:py-12">
            <div className="mx-auto grid max-w-[1240px] grid-cols-1 gap-x-4 gap-y-8 sm:grid-cols-2 sm:gap-x-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-7 lg:gap-y-10">
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
