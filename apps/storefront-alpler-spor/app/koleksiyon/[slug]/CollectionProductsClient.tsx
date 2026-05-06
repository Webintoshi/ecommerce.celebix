"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { ActiveFilters, FilterSidebar, type FilterCategoryOption, type FilterState } from "@/components/product/FilterSidebar";
import { FilterDrawer } from "@/components/product/FilterDrawer";
import { Product } from "@/types/product";
import { getLocalizedCopy } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface CollectionProductsClientProps {
  products: Product[];
}

const ITEMS_PER_PAGE = 12;

const DEFAULT_FILTERS: FilterState = {
  categories: [],
  priceRange: [0, 5000],
  vegan: false,
  sugarFree: false,
  highProtein: false,
  glutenFree: false,
  inStock: false,
  onSale: false,
  isNew: false,
};

function getLowestPrice(product: Product) {
  const prices = product.variants.map((variant) => variant.price).filter((price) => Number.isFinite(price));
  return prices.length > 0 ? Math.min(...prices) : 0;
}

function hasDiscount(product: Product) {
  return product.variants.some(
    (variant) => typeof variant.originalPrice === "number" && variant.originalPrice > variant.price,
  ) || Boolean(product.discount && product.discount > 0);
}

function formatCategoryLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

export default function CollectionProductsClient({
  products,
}: CollectionProductsClientProps) {
  const { locale, buildPath } = useStorefrontRoute();
  const copy = getLocalizedCopy(locale);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recommended");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>(
    products.slice(0, ITEMS_PER_PAGE),
  );
  const [hasMore, setHasMore] = useState(products.length > ITEMS_PER_PAGE);
  const [isLoading, setIsLoading] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const maxPrice = useMemo(() => {
    const highest = Math.max(0, ...products.flatMap((product) => product.variants.map((variant) => variant.price || 0)));
    return highest > 0 ? Math.ceil(highest / 100) * 100 : 5000;
  }, [products]);

  const categoryOptions = useMemo<FilterCategoryOption[]>(() => {
    const counts = new Map<string, number>();

    products.forEach((product) => {
      const value = product.subcategory || product.category;
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([value, count]) => ({
      value,
      label: formatCategoryLabel(value),
      count,
    }));
  }, [products]);

  const categoryCounts = useMemo(
    () =>
      categoryOptions.reduce<Record<string, number>>((acc, category) => {
        acc[category.value] = category.count || 0;
        return acc;
      }, {}),
    [categoryOptions],
  );

  useEffect(() => {
    setFilters((current) => ({
      ...current,
      priceRange: [0, maxPrice],
    }));
  }, [maxPrice]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");

    const nextProducts = products.filter((product) => {
      if (normalizedQuery) {
        const haystack = [
          product.name,
          product.brand,
          product.category,
          product.subcategory,
          ...(product.tags || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("tr-TR");

        if (!haystack.includes(normalizedQuery)) return false;
      }

      if (filters.categories.length > 0) {
        const productCategory = product.subcategory || product.category;
        if (!filters.categories.includes(productCategory)) return false;
      }

      const lowestPrice = getLowestPrice(product);
      if (lowestPrice < filters.priceRange[0] || lowestPrice > filters.priceRange[1]) return false;
      if (filters.inStock && !product.variants.some((variant) => variant.stock > 0)) return false;
      if (filters.onSale && !hasDiscount(product)) return false;
      if (filters.isNew && !product.new) return false;
      if (filters.vegan && !product.vegan) return false;
      if (filters.sugarFree && !product.sugarFree) return false;
      if (filters.highProtein && !product.highProtein) return false;
      if (filters.glutenFree && !product.glutenFree) return false;

      return true;
    });

    return nextProducts.sort((left, right) => {
      switch (sort) {
        case "newest":
          return Number(Boolean(right.new)) - Number(Boolean(left.new));
        case "price-asc":
          return getLowestPrice(left) - getLowestPrice(right);
        case "price-desc":
          return getLowestPrice(right) - getLowestPrice(left);
        case "popular":
          return (right.sales_count || right.reviewCount || right.rating || 0) - (left.sales_count || left.reviewCount || left.rating || 0);
        case "discounted":
          return Number(hasDiscount(right)) - Number(hasDiscount(left));
        default:
          return (
            Number(Boolean(right.featured || right.isBestseller)) -
              Number(Boolean(left.featured || left.isBestseller)) ||
            (right.sales_count || 0) - (left.sales_count || 0)
          );
      }
    });
  }, [filters, products, query, sort]);

  const handleFilterChange = (partialFilters: Partial<FilterState>) => {
    setFilters((current) => ({ ...current, ...partialFilters }));
  };

  const clearFilters = () => {
    setQuery("");
    setFilters({ ...DEFAULT_FILTERS, priceRange: [0, maxPrice] });
  };

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);

    setTimeout(() => {
      const currentLength = displayedProducts.length;
      const nextProducts = filteredProducts.slice(currentLength, currentLength + ITEMS_PER_PAGE);

      if (nextProducts.length > 0) {
        setDisplayedProducts((prev) => [...prev, ...nextProducts]);
        setHasMore(currentLength + nextProducts.length < filteredProducts.length);
      } else {
        setHasMore(false);
      }

      setIsLoading(false);
    }, 250);
  }, [displayedProducts.length, filteredProducts, hasMore, isLoading]);

  useEffect(() => {
    setDisplayedProducts(filteredProducts.slice(0, ITEMS_PER_PAGE));
    setHasMore(filteredProducts.length > ITEMS_PER_PAGE);
  }, [filteredProducts]);

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" },
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [hasMore, isLoading, loadMore]);

  if (products.length === 0) {
    return (
      <div className="rounded-[2rem] border border-[#E5E7EB] bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-lg font-bold text-[#111827]">Bu koleksiyon hazirlaniyor.</p>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#6B7280]">
          Alpler Spor panelinde bu kategoriye urun eklendiginde vitrin otomatik olarak dolar.
        </p>
        <Link
          href={buildPath("/urunler")}
          className="mt-5 inline-flex rounded-full bg-[#FF6A00] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#E85F00]"
        >
          {copy.productsTitle}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Bu koleksiyonda urun, marka veya kategori ara"
              className="h-12 w-full rounded-full border border-[#D1D5DB] bg-[#F8FAFC] pl-11 pr-4 text-sm font-medium text-[#111827] outline-none transition focus:border-[#FF6A00] focus:bg-white focus:ring-4 focus:ring-[#FF6A00]/15"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:flex lg:w-auto">
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-[#D1D5DB] bg-white px-4 text-sm font-bold text-[#111827] transition hover:border-[#FF6A00] lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filtrele
            </button>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              className="h-12 rounded-full border border-[#D1D5DB] bg-white px-4 text-sm font-bold text-[#111827] outline-none transition focus:border-[#FF6A00] focus:ring-4 focus:ring-[#FF6A00]/15"
            >
              <option value="recommended">Onerilen</option>
              <option value="newest">Yeni Gelenler</option>
              <option value="price-asc">En Dusuk Fiyat</option>
              <option value="price-desc">En Yuksek Fiyat</option>
              <option value="popular">Populer</option>
              <option value="discounted">Indirimdekiler</option>
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-[#E5E7EB] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-[#6B7280]">
            {filteredProducts.length} urun listeleniyor
          </p>
          <ActiveFilters
            filters={filters}
            onFilterChange={handleFilterChange}
            categoryOptions={categoryOptions}
            maxPrice={maxPrice}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <FilterSidebar
            filters={filters}
            onFilterChange={handleFilterChange}
            categoryCounts={categoryCounts}
            categoryOptions={categoryOptions}
            maxPrice={maxPrice}
            className="sticky top-28"
          />
        </aside>

        <div>
          {filteredProducts.length === 0 ? (
            <div className="rounded-[2rem] border border-[#E5E7EB] bg-white px-6 py-16 text-center shadow-sm">
              <p className="text-lg font-bold text-[#111827]">Bu filtrelere uygun urun bulunamadi.</p>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[#6B7280]">
                Arama veya filtre secimlerini temizleyerek koleksiyondaki diger urunleri gorebilirsiniz.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 inline-flex rounded-full bg-[#FF6A00] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#E85F00]"
              >
                Filtreleri Temizle
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 lg:gap-x-7 lg:gap-y-10">
              {displayedProducts.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} />
              ))}
            </div>
          )}

          <div ref={loadMoreRef} className="mt-10 flex items-center justify-center py-8">
            {isLoading && (
              <div className="flex items-center gap-2 text-neutral-500">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-[#FF6A00]" />
                <span className="text-sm">Yükleniyor...</span>
              </div>
            )}
            {!hasMore && displayedProducts.length > 0 && (
              <p className="text-sm text-neutral-400">
                Tüm ürünler görüntülendi ({filteredProducts.length} ürün)
              </p>
            )}
          </div>
        </div>
      </div>

      <FilterDrawer
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        filters={filters}
        onFilterChange={handleFilterChange}
        categoryCounts={categoryCounts}
        categoryOptions={categoryOptions}
        maxPrice={maxPrice}
      />
    </div>
  );
}
