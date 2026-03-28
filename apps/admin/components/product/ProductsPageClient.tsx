"use client";

import { useSearchParams } from "next/navigation";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";
import { FilterSidebar, FilterState } from "@/components/product/FilterSidebar";
import { FilterDrawer } from "@/components/product/FilterDrawer";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { Search, SlidersHorizontal, ChevronLeft, ChevronRight, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
}

const SORT_OPTIONS = [
  { value: "featured", label: "Öne Çıkanlar" },
  { value: "newest", label: "En Yeni" },
  { value: "price-asc", label: "Fiyat: Düşük → Yüksek" },
  { value: "price-desc", label: "Fiyat: Yüksek → Düşük" },
  { value: "rating", label: "En Çok Puanlanan" },
  { value: "popular", label: "En Popüler" },
];

const ITEMS_PER_PAGE = 12;

type ProductSortOption = "featured" | "newest" | "price-asc" | "price-desc" | "rating" | "popular";

function parseFiltersFromParams(searchParams: URLSearchParams): {
  filters: FilterState;
  sort: ProductSortOption;
  search: string;
  page: number;
} {
  const categories = searchParams.get("categories")?.split(",").filter(Boolean) || [];
  const priceMin = Number(searchParams.get("priceMin")) || 0;
  const priceMax = Number(searchParams.get("priceMax")) || 500;
  
  return {
    filters: {
      categories,
      priceRange: [priceMin, priceMax] as [number, number],
      vegan: searchParams.get("vegan") === "true",
      sugarFree: searchParams.get("sugarFree") === "true",
      highProtein: searchParams.get("highProtein") === "true",
      glutenFree: searchParams.get("glutenFree") === "true",
      inStock: searchParams.get("inStock") === "true",
      onSale: searchParams.get("onSale") === "true",
      isNew: searchParams.get("isNew") === "true",
    },
    sort: (searchParams.get("sort") as ProductSortOption) || "featured",
    search: searchParams.get("q") || "",
    page: Number(searchParams.get("page")) || 1,
  };
}

function ProductsPageContent({ initialProducts, categoryCounts }: ProductsPageClientProps) {
  const searchParams = useSearchParams();
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [showMobileFilters, setShowMobileFilters] = React.useState(false);

  const initialState = React.useMemo(() => parseFiltersFromParams(searchParams), [searchParams]);

  const [searchQuery, setSearchQuery] = React.useState(initialState.search);
  const [sortOption, setSortOption] = React.useState<ProductSortOption>(initialState.sort);
  const [filters, setFilters] = React.useState<FilterState>(initialState.filters);
  const [currentPage, setCurrentPage] = React.useState(initialState.page);

  React.useEffect(() => {
    setIsInitialized(true);
  }, []);

  React.useEffect(() => {
    setSearchQuery(initialState.search);
    setSortOption(initialState.sort);
    setFilters(initialState.filters);
    setCurrentPage(initialState.page);
  }, [initialState]);

  const filteredProducts = React.useMemo(() => {
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

    if (filters.categories.length > 0) {
      products = products.filter((p) => filters.categories.includes(p.category));
    }

    if (filters.priceRange[0] > 0 || filters.priceRange[1] < 500) {
      products = products.filter((p) => {
        const minPrice = Math.min(...p.variants.map((v) => v.price));
        return minPrice >= filters.priceRange[0] && minPrice <= filters.priceRange[1];
      });
    }

    if (filters.vegan) products = products.filter((p) => p.vegan);
    if (filters.sugarFree) products = products.filter((p) => p.sugarFree);
    if (filters.highProtein) products = products.filter((p) => p.highProtein);
    if (filters.glutenFree) products = products.filter((p) => p.glutenFree);
    if (filters.inStock) products = products.filter((p) => p.variants.some((v) => v.stock > 0));
    if (filters.onSale) products = products.filter((p) => p.variants.some((v) => v.originalPrice && v.originalPrice > v.price));
    if (filters.isNew) products = products.filter((p) => p.new);

    switch (sortOption) {
      case "newest":
        products.sort((a, b) => (b.new ? 1 : 0) - (a.new ? 1 : 0));
        break;
      case "price-asc":
        products.sort((a, b) => Math.min(...a.variants.map((v) => v.price)) - Math.min(...b.variants.map((v) => v.price)));
        break;
      case "price-desc":
        products.sort((a, b) => Math.min(...b.variants.map((v) => v.price)) - Math.min(...a.variants.map((v) => v.price)));
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
  }, [initialProducts, searchQuery, filters, sortOption]);

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
  const paginatedProducts = filteredProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const activeFiltersCount = [
    ...filters.categories,
    filters.vegan && "vegan",
    filters.sugarFree && "sugarFree",
    filters.highProtein && "highProtein",
    filters.glutenFree && "glutenFree",
    filters.inStock && "inStock",
    filters.onSale && "onSale",
    filters.isNew && "isNew",
  ].filter(Boolean).length + (filters.priceRange[0] > 0 || filters.priceRange[1] < 500 ? 1 : 0);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setCurrentPage(1);
  };

  const clearAllFilters = () => {
    setFilters({
      categories: [],
      priceRange: [0, 500],
      vegan: false,
      sugarFree: false,
      highProtein: false,
      glutenFree: false,
      inStock: false,
      onSale: false,
      isNew: false,
    });
    setSearchQuery("");
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!isInitialized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#FFF5F5]">
      {/* Minimal Hero */}
      <section className="pt-20 pb-8 md:pt-28 md:pb-12">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-2xl mx-auto"
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#7B1113]/10 text-[#7B1113] text-sm font-medium mb-4">
              <Package className="w-4 h-4" />
              {initialProducts.length} Ürün
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-[#7B1113] mb-4 tracking-tight">
              Tüm Ürünler
            </h1>
            <p className="text-[#6b4b4c] text-lg">
              Doğal ve katkısız ürünlerimizi keşfedin
            </p>
          </motion.div>
        </div>
      </section>

      {/* Controls Bar */}
      <section className="sticky top-0 z-40 bg-[#FFF5F5]/95 backdrop-blur-md border-b border-[#7B1113]/10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#7B1113]/40" />
              <input
                type="text"
                placeholder="Ürün ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white rounded-xl border border-[#7B1113]/10 text-[#7B1113] placeholder:text-[#7B1113]/40 focus:outline-none focus:ring-2 focus:ring-[#7B1113]/20 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#F3E0E1] text-[#7B1113] flex items-center justify-center hover:bg-[#7B1113] hover:text-white transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-3">
              {/* Sort Dropdown */}
              <div className="relative">
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as ProductSortOption)}
                  className="appearance-none bg-white px-4 py-3 pr-10 rounded-xl border border-[#7B1113]/10 text-[#7B1113] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#7B1113]/20 cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#7B1113]/40 rotate-90 pointer-events-none" />
              </div>

              {/* Filter Button (Mobile) */}
              <button
                onClick={() => setShowMobileFilters(true)}
                className="lg:hidden flex items-center gap-2 px-4 py-3 bg-white rounded-xl border border-[#7B1113]/10 text-[#7B1113] font-medium text-sm hover:bg-[#7B1113]/5 transition-colors"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Filtrele
                {activeFiltersCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-[#7B1113] text-white text-xs flex items-center justify-center">
                    {activeFiltersCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Active Filters */}
          {activeFiltersCount > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-[#7B1113]/10"
            >
              <span className="text-sm text-[#6b4b4c]">Aktif Filtreler:</span>
              {filters.categories.map((cat) => (
                <span
                  key={cat}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#7B1113] text-white text-sm rounded-full"
                >
                  {cat}
                  <button
                    onClick={() =>
                      handleFilterChange({
                        categories: filters.categories.filter((c) => c !== cat),
                      })
                    }
                    className="hover:bg-white/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {filters.vegan && (
                <FilterTag label="Vegan" onRemove={() => handleFilterChange({ vegan: false })} />
              )}
              {filters.sugarFree && (
                <FilterTag label="Şekersiz" onRemove={() => handleFilterChange({ sugarFree: false })} />
              )}
              {filters.glutenFree && (
                <FilterTag label="Glutensiz" onRemove={() => handleFilterChange({ glutenFree: false })} />
              )}
              {filters.highProtein && (
                <FilterTag label="Protein" onRemove={() => handleFilterChange({ highProtein: false })} />
              )}
              {filters.inStock && (
                <FilterTag label="Stokta" onRemove={() => handleFilterChange({ inStock: false })} />
              )}
              {filters.onSale && (
                <FilterTag label="İndirimli" onRemove={() => handleFilterChange({ onSale: false })} />
              )}
              {filters.isNew && (
                <FilterTag label="Yeni" onRemove={() => handleFilterChange({ isNew: false })} />
              )}
              {(filters.priceRange[0] > 0 || filters.priceRange[1] < 500) && (
                <FilterTag
                  label={`${filters.priceRange[0]}₺ - ${filters.priceRange[1]}₺`}
                  onRemove={() => handleFilterChange({ priceRange: [0, 500] })}
                />
              )}
              <button
                onClick={clearAllFilters}
                className="text-sm text-[#7B1113] underline hover:no-underline ml-2"
              >
                Temizle
              </button>
            </motion.div>
          )}
        </div>
      </section>

      {/* Main Content */}
      <section className="container mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Sidebar Filters - Desktop */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <div className="sticky top-32">
              <FilterSidebar
                filters={filters}
                onFilterChange={handleFilterChange}
                categoryCounts={categoryCounts}
              />
            </div>
          </aside>

          {/* Products Grid */}
          <main className="flex-1 min-w-0">
            {/* Results Count */}
            <div className="flex items-center justify-between mb-6">
              <p className="text-[#6b4b4c]">
                <span className="font-semibold text-[#7B1113]">{filteredProducts.length}</span> ürün bulundu
              </p>
            </div>

            {paginatedProducts.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-20 bg-white rounded-3xl border border-[#7B1113]/10"
              >
                <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-[#F3E0E1] flex items-center justify-center">
                  <Package className="w-10 h-10 text-[#7B1113]/40" />
                </div>
                <h3 className="text-xl font-semibold text-[#7B1113] mb-2">
                  Ürün Bulunamadı
                </h3>
                <p className="text-[#6b4b4c] mb-6">
                  Farklı filtreler denemeyi veya arama yapmayı deneyin
                </p>
                <button
                  onClick={clearAllFilters}
                  className="px-6 py-3 bg-[#7B1113] text-white rounded-full font-medium hover:bg-[#5d0e0f] transition-colors"
                >
                  Filtreleri Temizle
                </button>
              </motion.div>
            ) : (
              <>
                <motion.div
                  layout
                  className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6"
                >
                  <AnimatePresence mode="popLayout">
                    {paginatedProducts.map((product, index) => (
                      <motion.div
                        key={product.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <ProductCard product={product} index={index} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="mt-12 flex items-center justify-center gap-2">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="w-10 h-10 flex items-center justify-center rounded-full border border-[#7B1113]/20 text-[#7B1113] hover:bg-[#7B1113] hover:text-white hover:border-[#7B1113] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        if (totalPages <= 5) return true;
                        if (page === 1 || page === totalPages) return true;
                        if (Math.abs(page - currentPage) <= 1) return true;
                        return false;
                      })
                      .map((page, index, array) => (
                        <React.Fragment key={page}>
                          {index > 0 && array[index - 1] !== page - 1 && (
                            <span className="text-[#7B1113]/40">...</span>
                          )}
                          <button
                            onClick={() => handlePageChange(page)}
                            className={cn(
                              "w-10 h-10 rounded-full font-medium transition-all",
                              currentPage === page
                                ? "bg-[#7B1113] text-white"
                                : "border border-[#7B1113]/20 text-[#7B1113] hover:bg-[#7B1113]/10"
                            )}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      ))}

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="w-10 h-10 flex items-center justify-center rounded-full border border-[#7B1113]/20 text-[#7B1113] hover:bg-[#7B1113] hover:text-white hover:border-[#7B1113] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </section>

      {/* Mobile Filter Drawer */}
      <FilterDrawer
        isOpen={showMobileFilters}
        onClose={() => setShowMobileFilters(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        categoryCounts={categoryCounts}
      />
    </div>
  );
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#F3E0E1] text-[#7B1113] text-sm rounded-full">
      {label}
      <button
        onClick={onRemove}
        className="hover:bg-[#7B1113]/20 rounded-full p-0.5 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

export function ProductsPageClient({ initialProducts, categoryCounts }: ProductsPageClientProps) {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen bg-[#FFF5F5]">
          <section className="pt-20 pb-8 md:pt-28 md:pb-12">
            <div className="container mx-auto px-4">
              <div className="text-center max-w-2xl mx-auto">
                <div className="h-8 w-32 bg-[#F3E0E1] rounded-full mx-auto mb-4 animate-pulse" />
                <div className="h-12 w-64 bg-[#F3E0E1] rounded-lg mx-auto mb-4 animate-pulse" />
                <div className="h-6 w-96 bg-[#F3E0E1] rounded mx-auto animate-pulse" />
              </div>
            </div>
          </section>
          <div className="container mx-auto px-4 py-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">
              {[...Array(8)].map((_, i) => (
                <ProductCardSkeleton key={i} />
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
