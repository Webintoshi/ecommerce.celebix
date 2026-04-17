"use client";

import * as React from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { Product } from "@/types/product";
import { EmptyResultsState } from "./EmptyResultsState";
import { ProductGridToolbar, type SortOption } from "./ProductGridToolbar";
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

function getProductPrice(product: Product) {
  return typeof product.variants?.[0]?.price === "number" ? product.variants[0].price : 0;
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

export function ProductsPageClient({
  initialProducts,
}: ProductsPageClientProps) {
  const { locale } = useStorefrontRoute();
  const [sortBy, setSortBy] = React.useState<SortOption["value"]>("featured");
  const [visibleCount, setVisibleCount] = React.useState(ITEMS_PER_PAGE);
  const sortedProducts = React.useMemo(
    () => sortProducts(initialProducts, sortBy),
    [initialProducts, sortBy],
  );

  React.useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [sortBy]);

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
                {"Lilyum Flora Ordu vitrininin tüm ürünlerini keşfedin"}
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
          <ProductGridToolbar
            title={"Vitrin Sonu\u00e7lar\u0131"}
            totalCount={sortedProducts.length}
            visibleCount={visibleProducts.length}
            sortValue={sortBy}
            sortOptions={SORT_OPTIONS}
            onSortChange={setSortBy}
          />

          {visibleProducts.length === 0 ? (
            <div className="mt-6">
              <EmptyResultsState
                title={"Vitrinde henüz ürün bulunamadı"}
                body={"Yeni koleksiyonlar geldikçe bu alan otomatik olarak güncellenir."}
                actionLabel={"T\u00fcm \u00dcr\u00fcnler"}
                actionHref={buildLocalizedPath(ROUTES.products, locale)}
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
      </section>
    </div>
  );
}
