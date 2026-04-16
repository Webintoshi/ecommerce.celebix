"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyResultsState } from "@/components/product/EmptyResultsState";
import { ProductGridToolbar, type SortOption } from "@/components/product/ProductGridToolbar";
import {
  ActiveFilters,
  FilterSidebar,
  createDefaultFilters,
  type FilterState,
} from "@/components/product/FilterSidebar";
import { FilterDrawer } from "@/components/product/FilterDrawer";
import { Product } from "@/types/product";
import { buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface CollectionProductsClientProps {
  products: Product[];
}

const ITEMS_PER_PAGE = 12;

const SORT_OPTIONS: SortOption[] = [
  { value: "featured", label: "One Cikanlar" },
  { value: "newest", label: "Yeni Gelenler" },
  { value: "price-asc", label: "Fiyat Artan" },
  { value: "price-desc", label: "Fiyat Azalan" },
  { value: "popular", label: "Populer" },
];

function getProductPrice(product: Product) {
  return typeof product.variants?.[0]?.price === "number" ? product.variants[0].price : 0;
}

function getProductOriginalPrice(product: Product) {
  return typeof product.variants?.[0]?.originalPrice === "number"
    ? product.variants[0].originalPrice
    : undefined;
}

function getRoundedPriceBounds(products: Product[]): [number, number] {
  const prices = products
    .map((product) => getProductPrice(product))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (prices.length === 0) {
    return [0, 5000];
  }

  const minPrice = Math.floor(Math.min(...prices) / 100) * 100;
  const maxPrice = Math.ceil(Math.max(...prices) / 100) * 100;
  return [Math.max(0, minPrice), Math.max(maxPrice, minPrice + 100)];
}

function filterProducts(products: Product[], filters: FilterState) {
  return products.filter((product) => {
    const productPrice = getProductPrice(product);
    const originalPrice = getProductOriginalPrice(product);
    const isDiscounted = typeof originalPrice === "number" && originalPrice > productPrice;
    const hasStock = product.variants?.some((variant) => Number(variant.stock || 0) > 0);

    if (productPrice < filters.priceRange[0] || productPrice > filters.priceRange[1]) {
      return false;
    }

    if (filters.inStock && !hasStock) {
      return false;
    }

    if (filters.onSale && !isDiscounted) {
      return false;
    }

    if (filters.isNew && !product.new) {
      return false;
    }

    return true;
  });
}

function sortProducts(products: Product[], sort: SortOption["value"]) {
  const items = [...products];

  switch (sort) {
    case "newest":
      return items.sort((left, right) => Number(Boolean(right.new)) - Number(Boolean(left.new)));
    case "price-asc":
      return items.sort((left, right) => getProductPrice(left) - getProductPrice(right));
    case "price-desc":
      return items.sort((left, right) => getProductPrice(right) - getProductPrice(left));
    case "popular":
      return items.sort((left, right) => {
        const rightScore = Number(right.sales_count || 0) + Number(right.reviewCount || 0) + Number(right.rating || 0);
        const leftScore = Number(left.sales_count || 0) + Number(left.reviewCount || 0) + Number(left.rating || 0);
        return rightScore - leftScore;
      });
    case "featured":
    default:
      return items.sort((left, right) => Number(Boolean(right.featured)) - Number(Boolean(left.featured)));
  }
}

export default function CollectionProductsClient({
  products,
}: CollectionProductsClientProps) {
  const { locale } = useStorefrontRoute();
  const copy = getLocalizedCopy(locale);
  const priceBounds = useMemo(() => getRoundedPriceBounds(products), [products]);
  const [filters, setFilters] = useState<FilterState>(() => createDefaultFilters(priceBounds));
  const [sortBy, setSortBy] = useState<SortOption["value"]>("featured");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  useEffect(() => {
    setFilters(createDefaultFilters(priceBounds));
  }, [priceBounds]);

  const filteredProducts = useMemo(() => filterProducts(products, filters), [filters, products]);
  const sortedProducts = useMemo(() => sortProducts(filteredProducts, sortBy), [filteredProducts, sortBy]);

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [filters, sortBy, products]);

  if (products.length === 0) {
    return (
      <EmptyResultsState
        title="Bu koleksiyonda henuz urun yok"
        body={copy.missingCategoryDescription || "Bu koleksiyon icin urun geldikce vitrin otomatik dolacak."}
        actionLabel={copy.productsTitle || "Tum Urunler"}
        actionHref={buildLocalizedPath("/urunler", locale)}
      />
    );
  }

  const visibleProducts = sortedProducts.slice(0, visibleCount);
  const hasMore = visibleCount < sortedProducts.length;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
      <div className="hidden lg:block">
        <div className="sticky top-28">
          <FilterSidebar
            filters={filters}
            onFilterChange={(next: Partial<FilterState>) =>
              setFilters((current) => ({ ...current, ...next }))
            }
            priceBounds={priceBounds}
            showCategories={false}
          />
        </div>
      </div>

      <div>
        <ProductGridToolbar
          title="Koleksiyon Sonuclari"
          totalCount={sortedProducts.length}
          visibleCount={visibleProducts.length}
          sortValue={sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSortBy}
          activeFilterCount={
            (filters.priceRange[0] > priceBounds[0] || filters.priceRange[1] < priceBounds[1] ? 1 : 0) +
            (filters.inStock ? 1 : 0) +
            (filters.onSale ? 1 : 0) +
            (filters.isNew ? 1 : 0)
          }
          onOpenFilters={() => setIsFilterDrawerOpen(true)}
        />

        <div className="mt-4">
          <ActiveFilters
            filters={filters}
            onFilterChange={(next: Partial<FilterState>) =>
              setFilters((current) => ({ ...current, ...next }))
            }
            priceBounds={priceBounds}
          />
        </div>

        {visibleProducts.length === 0 ? (
          <div className="mt-6">
            <EmptyResultsState
              title="Bu filtrelere uygun urun bulunamadi"
              body="Filtreleri temizleyerek koleksiyonun tum urunlerini yeniden gorebilirsin."
              actionLabel="Filtreleri Temizle"
              actionHref={buildLocalizedPath("/urunler", locale)}
              onReset={() => setFilters(createDefaultFilters(priceBounds))}
            />
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product, index) => (
                <ProductCard key={product.id} product={product} index={index} />
              ))}
            </div>

            {hasMore ? (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((current) => current + ITEMS_PER_PAGE)}
                  className="cta-secondary"
                >
                  Daha Fazla Goster
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>

      <FilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        filters={filters}
        onFilterChange={(next: Partial<FilterState>) =>
          setFilters((current) => ({ ...current, ...next }))
        }
        priceBounds={priceBounds}
        showCategories={false}
      />
    </div>
  );
}
