"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Loader2, Package, SlidersHorizontal } from "lucide-react";
import { ProductCard } from "@/components/product/ProductCard";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { cn } from "@/lib/utils";
import { getOrderedVariantAttributeGroups } from "@/lib/variant-selection";
import { Product } from "@/types/product";
import {
  ActiveFilters,
  createListingFilterState,
  FilterSidebar,
  getActiveFilterCount,
  type ListingFacetGroup,
  type ListingFilterMetadata,
  type ListingFilterOption,
  type ListingFilterState,
} from "./FilterSidebar";
import { FilterDrawer } from "./FilterDrawer";

type ListingSortValue = "recommended" | "price-asc" | "price-desc" | "name-asc";
type ChipMode = "categories" | "subcategories";

interface ProductListingExperienceProps {
  products: Product[];
  emptyTitle: string;
  emptyDescription: string;
  chipMode?: ChipMode;
  minimalCopy?: boolean;
}

const ITEMS_PER_LOAD = 12;

function humanizeSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeValue(value: string) {
  return value.trim().toLocaleLowerCase("tr");
}

function getProductPrice(product: Product) {
  const prices = product.variants
    .map((variant) => Number(variant.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  return prices.length > 0 ? Math.min(...prices) : 0;
}

function getPriceBounds(products: Product[]): [number, number] {
  const prices = products
    .map((product) => getProductPrice(product))
    .filter((price) => price > 0);

  if (prices.length === 0) {
    return [0, 500];
  }

  const min = Math.floor(Math.min(...prices) / 50) * 50;
  const max = Math.ceil(Math.max(...prices) / 50) * 50;

  return min === max ? [min, max + 50] : [min, max];
}

function buildFacetOptions(
  map: Map<string, { label: string; count: number; colorCode?: string | null }>,
) {
  return Array.from(map.entries())
    .map(
      ([value, entry]): ListingFilterOption => ({
        value,
        label: entry.label,
        count: entry.count,
        colorCode: entry.colorCode ?? null,
      }),
    )
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "tr"));
}

function buildListingMetadata(products: Product[]): ListingFilterMetadata {
  const categoriesMap = new Map<string, { label: string; count: number }>();
  const subcategoriesMap = new Map<string, { label: string; count: number }>();
  const attributeGroups = new Map<
    string,
    {
      label: string;
      options: Map<string, { label: string; count: number; colorCode?: string | null }>;
    }
  >();

  products.forEach((product) => {
    if (product.category) {
      const currentCategory = categoriesMap.get(product.category);
      categoriesMap.set(product.category, {
        label: humanizeSlug(product.category),
        count: (currentCategory?.count ?? 0) + 1,
      });
    }

    if (
      product.subcategory &&
      product.subcategory !== "genel" &&
      product.subcategory !== product.category
    ) {
      const currentSubcategory = subcategoriesMap.get(product.subcategory);
      subcategoriesMap.set(product.subcategory, {
        label: humanizeSlug(product.subcategory),
        count: (currentSubcategory?.count ?? 0) + 1,
      });
    }

    const productAttributeGroups = getOrderedVariantAttributeGroups(
      product.variants as Array<{
        stock?: number | null;
        attributes?: Array<Record<string, unknown>>;
        raw_attributes?: Array<Record<string, unknown>>;
      }>,
    );

    productAttributeGroups.forEach((group) => {
      const existingGroup = attributeGroups.get(group.id) ?? {
        label: group.name,
        options: new Map<string, { label: string; count: number; colorCode?: string | null }>(),
      };

      group.values.forEach((option) => {
        const normalizedOption = normalizeValue(option.value);
        const existingOption = existingGroup.options.get(normalizedOption);

        existingGroup.options.set(normalizedOption, {
          label: existingOption?.label ?? option.value,
          count: (existingOption?.count ?? 0) + 1,
          colorCode: existingOption?.colorCode ?? option.color_code ?? null,
        });
      });

      attributeGroups.set(group.id, existingGroup);
    });
  });

  const categories = buildFacetOptions(categoriesMap);
  const subcategories = buildFacetOptions(subcategoriesMap);
  const attributes = Array.from(attributeGroups.entries())
    .map(
      ([id, group]): ListingFacetGroup => ({
        id,
        label: group.label,
        options: buildFacetOptions(group.options),
      }),
    )
    .filter((group) => group.options.length > 1)
    .slice(0, 4);

  return {
    categories:
      categories.length > 1
        ? { id: "categories", label: "Koleksiyonlar", options: categories }
        : null,
    subcategories:
      subcategories.length > 1
        ? { id: "subcategories", label: "Alt seckiler", options: subcategories }
        : null,
    attributes,
    priceBounds: getPriceBounds(products),
  };
}

function sortProducts(products: Product[], sortBy: ListingSortValue) {
  const nextProducts = [...products];

  switch (sortBy) {
    case "price-asc":
      return nextProducts.sort((left, right) => getProductPrice(left) - getProductPrice(right));
    case "price-desc":
      return nextProducts.sort((left, right) => getProductPrice(right) - getProductPrice(left));
    case "name-asc":
      return nextProducts.sort((left, right) => left.name.localeCompare(right.name, "tr"));
    default:
      return products;
  }
}

function getTopChipFacet(metadata: ListingFilterMetadata, chipMode: ChipMode) {
  if (chipMode === "subcategories" && metadata.subcategories) {
    return metadata.subcategories;
  }

  if (chipMode === "categories" && metadata.categories) {
    return metadata.categories;
  }

  return metadata.subcategories ?? metadata.categories;
}

export function ProductListingExperience({
  products,
  emptyTitle,
  emptyDescription,
  chipMode = "categories",
  minimalCopy = false,
}: ProductListingExperienceProps) {
  const { locale } = useStorefrontRoute();
  const [sortBy, setSortBy] = React.useState<ListingSortValue>("recommended");
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [displayCount, setDisplayCount] = React.useState(ITEMS_PER_LOAD);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const metadata = React.useMemo(() => buildListingMetadata(products), [products]);
  const [filters, setFilters] = React.useState<ListingFilterState>(() =>
    createListingFilterState(metadata.priceBounds),
  );

  React.useEffect(() => {
    setFilters(createListingFilterState(metadata.priceBounds));
  }, [metadata]);

  const handleFilterChange = React.useCallback((partial: Partial<ListingFilterState>) => {
    setFilters((current) => ({
      ...current,
      ...partial,
      attributes: partial.attributes ? partial.attributes : current.attributes,
    }));
  }, []);

  const filteredProducts = React.useMemo(() => {
    return products.filter((product) => {
      if (filters.categories.length > 0 && !filters.categories.includes(product.category)) {
        return false;
      }

      if (
        filters.subcategories.length > 0 &&
        !filters.subcategories.includes(product.subcategory)
      ) {
        return false;
      }

      const price = getProductPrice(product);
      if (price < filters.priceRange[0] || price > filters.priceRange[1]) {
        return false;
      }

      if (filters.inStock && !product.variants.some((variant) => Number(variant.stock) > 0)) {
        return false;
      }

      if (
        filters.onSale &&
        !product.variants.some(
          (variant) =>
            typeof variant.originalPrice === "number" &&
            Number(variant.originalPrice) > Number(variant.price),
        )
      ) {
        return false;
      }

      if (filters.isNew && !product.new) {
        return false;
      }

      const attributeGroups = getOrderedVariantAttributeGroups(
        product.variants as Array<{
          stock?: number | null;
          attributes?: Array<Record<string, unknown>>;
          raw_attributes?: Array<Record<string, unknown>>;
        }>,
      );

      return Object.entries(filters.attributes).every(([groupId, selectedValues]) => {
        if (selectedValues.length === 0) {
          return true;
        }

        const group = attributeGroups.find((entry) => entry.id === groupId);
        if (!group) {
          return false;
        }

        const optionSet = new Set(group.values.map((value) => normalizeValue(value.value)));
        return selectedValues.some((value) => optionSet.has(value));
      });
    });
  }, [filters, products]);

  const sortedProducts = React.useMemo(
    () => sortProducts(filteredProducts, sortBy),
    [filteredProducts, sortBy],
  );
  const visibleProducts = React.useMemo(
    () => sortedProducts.slice(0, displayCount),
    [displayCount, sortedProducts],
  );
  const hasMore = displayCount < sortedProducts.length;
  const activeFilterCount = React.useMemo(
    () => getActiveFilterCount(filters, metadata),
    [filters, metadata],
  );
  const topChipFacet = React.useMemo(
    () => getTopChipFacet(metadata, chipMode),
    [chipMode, metadata],
  );
  const isFilteredEmpty = products.length > 0 && filteredProducts.length === 0;

  React.useEffect(() => {
    setDisplayCount(ITEMS_PER_LOAD);
  }, [filters, sortBy, products]);

  React.useEffect(() => {
    if (!loadMoreRef.current) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setIsLoadingMore(true);
          window.setTimeout(() => {
            setDisplayCount((value) => Math.min(value + ITEMS_PER_LOAD, sortedProducts.length));
            setIsLoadingMore(false);
          }, 260);
        }
      },
      { rootMargin: "200px" },
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, sortedProducts.length]);

  return (
    <div className="space-y-6">
      {topChipFacet && topChipFacet.options.length > 1 ? (
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-max gap-5">
            {topChipFacet.options.map((option) => {
              const isSelected =
                chipMode === "subcategories"
                  ? filters.subcategories.includes(option.value)
                  : filters.categories.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    handleFilterChange(
                      chipMode === "subcategories"
                        ? {
                            subcategories: isSelected
                              ? filters.subcategories.filter((value) => value !== option.value)
                              : [option.value],
                          }
                        : {
                            categories: isSelected
                              ? filters.categories.filter((value) => value !== option.value)
                              : [option.value],
                          },
                    )
                  }
                  className={cn(
                    "inline-flex items-center gap-2 whitespace-nowrap py-1 text-[12px] uppercase tracking-[0.18em] transition-colors",
                    isSelected
                      ? "text-[#222222] underline decoration-[rgba(34,34,34,0.26)] underline-offset-[0.45rem]"
                      : "text-[#222222] hover:text-[#222222]",
                  )}
                >
                  <span>{option.label}</span>
                  <span
                    className={cn(
                      "text-[10px]",
                      isSelected ? "text-[#222222]" : "text-[#222222]",
                    )}
                  >
                    {option.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:gap-12">
        <div className="hidden lg:block">
          <div className="sticky top-24">
            <FilterSidebar
              filters={filters}
              metadata={metadata}
              onFilterChange={handleFilterChange}
              minimalCopy={minimalCopy}
            />
          </div>
        </div>

        <div className="min-w-0">
          <div>
            <div className="flex flex-col gap-4 border-b border-[rgba(32,20,16,0.08)] pb-4">
              <div
                className={cn(
                  "flex flex-col gap-4",
                  minimalCopy ? "sm:items-end" : "sm:flex-row sm:items-end sm:justify-between",
                )}
              >
                {!minimalCopy ? (
                  <div>
                    <div className="flex items-end gap-3">
                      <span className="font-serif text-[2.4rem] leading-none tracking-[-0.06em] text-[#222222]">
                        {filteredProducts.length}
                      </span>
                      <span className="pb-1 text-[11px] uppercase tracking-[0.22em] text-[#222222]">
                        urun
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 sm:items-end">
                  <button
                    type="button"
                    onClick={() => setIsDrawerOpen(true)}
                    className="inline-flex items-center justify-center gap-2 py-1 text-[12px] uppercase tracking-[0.18em] text-[#222222] underline underline-offset-[0.45rem] lg:hidden"
                  >
                    <SlidersHorizontal className="h-4 w-4" />
                    Filtrele
                    {activeFilterCount > 0 ? (
                      <span className="text-[10px] text-[#222222]">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </button>

                  <label className="relative block min-w-[13rem]">
                    {!minimalCopy ? (
                      <span className="mb-2 block text-[11px] uppercase tracking-[0.24em] text-[#222222]">
                        Siralama
                      </span>
                    ) : (
                      <span className="sr-only">Siralama</span>
                    )}
                    <select
                      value={sortBy}
                      onChange={(event) => setSortBy(event.target.value as ListingSortValue)}
                      aria-label="Urunleri sirala"
                      className="h-10 w-full appearance-none border-b border-[rgba(32,20,16,0.14)] bg-transparent px-0 pr-8 text-sm text-[#222222] outline-none transition-colors focus:border-[#222222]"
                    >
                      <option value="recommended">Onerilen</option>
                      <option value="price-asc">Fiyat artan</option>
                      <option value="price-desc">Fiyat azalan</option>
                      <option value="name-asc">Isim A-Z</option>
                    </select>
                    <ChevronDown className="pointer-events-none absolute bottom-3 right-0 h-4 w-4 text-[#222222]" />
                  </label>
                </div>
              </div>

              <ActiveFilters
                filters={filters}
                metadata={metadata}
                onFilterChange={handleFilterChange}
                minimalCopy={minimalCopy}
              />
            </div>

            {visibleProducts.length === 0 ? (
              <div className="py-16 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center text-[#222222]">
                  <Package className="h-6 w-6 text-[#222222]" />
                </div>
                <h3 className="mt-5 font-serif text-3xl tracking-[-0.04em] text-[#222222]">
                  {isFilteredEmpty ? "Filtrelere uygun urun yok" : emptyTitle}
                </h3>
                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[#222222]">
                  {isFilteredEmpty
                    ? "Secimi genisletmek icin aktif filtreleri sifirlayin ya da farkli bir kategori secin."
                    : emptyDescription}
                </p>
                {isFilteredEmpty ? (
                  <button
                    type="button"
                    onClick={() => handleFilterChange(createListingFilterState(metadata.priceBounds))}
                    className="mt-6 inline-flex py-1 text-[12px] uppercase tracking-[0.18em] text-[#222222] underline underline-offset-[0.45rem]"
                  >
                    Filtreleri sifirla
                  </button>
                ) : (
                  <Link
                    href={buildLocalizedPath("/urunler", locale)}
                    className="mt-6 inline-flex py-1 text-[12px] uppercase tracking-[0.18em] text-[#222222] underline underline-offset-[0.45rem]"
                  >
                    Tum urunlere don
                  </Link>
                )}
              </div>
            ) : (
              <>
                <motion.div
                  layout
                  className="grid grid-cols-2 gap-x-4 gap-y-8 pt-6 sm:gap-x-6 xl:grid-cols-3 xl:gap-x-8 xl:gap-y-10"
                >
                  <AnimatePresence mode="popLayout">
                    {visibleProducts.map((product, index) => (
                      <motion.div
                        key={product.id}
                        layout
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        transition={{ delay: Math.min(index * 0.02, 0.18), duration: 0.34 }}
                      >
                        <ProductCard product={product} index={index} />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>

                <div ref={loadMoreRef} className="flex min-h-16 items-center justify-center pt-8">
                  {hasMore ? (
                    <div className="flex items-center gap-3 text-[#222222]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-[11px] uppercase tracking-[0.18em]">
                        Vitrin genisliyor
                      </span>
                    </div>
                  ) : (
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#222222]">
                      Tum urunler goruntulendi
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        filters={filters}
        metadata={metadata}
        onFilterChange={handleFilterChange}
        minimalCopy={minimalCopy}
      />
    </div>
  );
}

export function ProductListingExperienceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-2 overflow-hidden">
        {[...Array(6)].map((_, index) => (
          <div key={index} className="h-5 w-28 animate-pulse rounded bg-neutral-200" />
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-[18.5rem_minmax(0,1fr)] xl:gap-12">
        <div className="hidden lg:block">
          <div>
            <div className="mb-5 h-10 w-40 animate-pulse rounded bg-neutral-200" />
            <div className="space-y-4">
              {[...Array(4)].map((_, index) => (
                <div key={index} className="h-24 animate-pulse rounded bg-neutral-100" />
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-6 h-24 animate-pulse rounded-2xl bg-neutral-100" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 pt-2 sm:gap-x-6 xl:grid-cols-3 xl:gap-x-8 xl:gap-y-10">
            {[...Array(9)].map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
