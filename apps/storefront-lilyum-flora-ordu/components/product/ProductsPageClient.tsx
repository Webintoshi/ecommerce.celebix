"use client";

import * as React from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { Product } from "@/types/product";
import { EmptyResultsState } from "./EmptyResultsState";
import { ProductGridToolbar, type SortOption } from "./ProductGridToolbar";
import {
  ActiveFilters,
  FilterSidebar,
  createDefaultFilters,
  type FilterCategoryOption,
  type FilterState,
} from "./FilterSidebar";
import { FilterDrawer } from "./FilterDrawer";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface ProductsPageClientProps {
  initialProducts: Product[];
  categoryCounts?: Record<string, number>;
  categoryOptions?: Array<{ slug: string; name: string }>;
}

const ITEMS_PER_PAGE = 12;

const SORT_OPTIONS: SortOption[] = [
  { value: "featured", label: "\u00d6ne \u00c7\u0131kanlar" },
  { value: "newest", label: "Yeni Gelenler" },
  { value: "price-asc", label: "Fiyat Artan" },
  { value: "price-desc", label: "Fiyat Azalan" },
  { value: "popular", label: "Pop\u00fcler" },
];

function normalizeKey(value?: string | null) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

function filterProducts(products: Product[], filters: FilterState) {
  return products.filter((product) => {
    const categoryKey = normalizeKey(product.category);
    const productPrice = getProductPrice(product);
    const originalPrice = getProductOriginalPrice(product);
    const isDiscounted = typeof originalPrice === "number" && originalPrice > productPrice;
    const hasStock = product.variants?.some((variant) => Number(variant.stock || 0) > 0);

    if (filters.categories.length > 0 && !filters.categories.includes(categoryKey)) {
      return false;
    }

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

export function ProductsPageClient({
  initialProducts,
  categoryCounts = {},
  categoryOptions = [],
}: ProductsPageClientProps) {
  const { locale } = useStorefrontRoute();
  const priceBounds = React.useMemo(() => getRoundedPriceBounds(initialProducts), [initialProducts]);
  const [filters, setFilters] = React.useState<FilterState>(() => createDefaultFilters(priceBounds));
  const [sortBy, setSortBy] = React.useState<SortOption["value"]>("featured");
  const [visibleCount, setVisibleCount] = React.useState(ITEMS_PER_PAGE);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    setFilters(createDefaultFilters(priceBounds));
  }, [priceBounds]);

  const availableCategoryOptions = React.useMemo<FilterCategoryOption[]>(
    () =>
      categoryOptions.map((category) => ({
        value: normalizeKey(category.slug),
        label: category.name,
        count: categoryCounts[category.slug] || categoryCounts[normalizeKey(category.slug)] || 0,
      })),
    [categoryCounts, categoryOptions],
  );

  const filteredProducts = React.useMemo(
    () => filterProducts(initialProducts, filters),
    [filters, initialProducts],
  );
  const sortedProducts = React.useMemo(
    () => sortProducts(filteredProducts, sortBy),
    [filteredProducts, sortBy],
  );

  React.useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [filters, sortBy]);

  const visibleProducts = sortedProducts.slice(0, visibleCount);
  const hasMore = visibleCount < sortedProducts.length;

  return (
    <div className="bg-[var(--store-surface)]">
      <section className="section-shell pt-8">
        <div className="container-premium">
          <div className="relative overflow-hidden rounded-[32px] border border-[var(--store-border)] bg-[linear-gradient(135deg,#ffffff_0%,#f6f6f6_42%,#e8edf2_100%)] px-6 py-10 shadow-[var(--store-shadow-soft)] sm:px-8 lg:px-10 lg:py-12">
            <div className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(218,99,13,0.14),transparent_52%)]" />
            <div className="relative max-w-2xl">
              <p className="section-eyebrow">{"T\u00fcm \u00dcr\u00fcnler"}</p>
              <h1 className="section-title mt-4 text-[var(--store-ink)]">
                {"\u00c7i\u00e7ekleri kategori ve fiyatla h\u0131zl\u0131ca ke\u015ffet"}
              </h1>
              <p className="mt-5 text-sm font-semibold text-[var(--store-accent)]">
                {`${sortedProducts.length} \u00fcr\u00fcn g\u00f6r\u00fcnt\u00fcleniyor`}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section-shell pt-6">
        <div className="container-premium">
          <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
            <div className="hidden lg:block">
              <div className="sticky top-28">
                <FilterSidebar
                  filters={filters}
                  onFilterChange={(next: Partial<FilterState>) =>
                    setFilters((current) => ({ ...current, ...next }))
                  }
                  categoryOptions={availableCategoryOptions}
                  priceBounds={priceBounds}
                />
              </div>
            </div>

            <div>
              <ProductGridToolbar
                title={"Vitrin Sonu\u00e7lar\u0131"}
                totalCount={sortedProducts.length}
                visibleCount={visibleProducts.length}
                sortValue={sortBy}
                sortOptions={SORT_OPTIONS}
                onSortChange={setSortBy}
                activeFilterCount={
                  filters.categories.length +
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
                  categoryOptions={availableCategoryOptions}
                  priceBounds={priceBounds}
                />
              </div>

              {visibleProducts.length === 0 ? (
                <div className="mt-6">
                  <EmptyResultsState
                    title={"Filtrelere uygun \u00fcr\u00fcn bulunamad\u0131"}
                    body={"Filtreleri temizleyerek t\u00fcm vitrine d\u00f6nebilirsiniz."}
                    actionLabel={"T\u00fcm \u00dcr\u00fcnler"}
                    actionHref={buildLocalizedPath(ROUTES.products, locale)}
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
                        {"Daha Fazla G\u00f6ster"}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <FilterDrawer
        isOpen={isFilterDrawerOpen}
        onClose={() => setIsFilterDrawerOpen(false)}
        filters={filters}
        onFilterChange={(next: Partial<FilterState>) =>
          setFilters((current) => ({ ...current, ...next }))
        }
        categoryOptions={availableCategoryOptions}
        priceBounds={priceBounds}
      />
    </div>
  );
}
