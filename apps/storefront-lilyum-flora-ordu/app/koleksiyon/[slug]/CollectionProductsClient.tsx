"use client";

import { useEffect, useMemo, useState } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { EmptyResultsState } from "@/components/product/EmptyResultsState";
import { ProductGridToolbar, type SortOption } from "@/components/product/ProductGridToolbar";
import { Product } from "@/types/product";
import { buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface CollectionProductsClientProps {
  products: Product[];
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

export default function CollectionProductsClient({
  products,
}: CollectionProductsClientProps) {
  const { locale } = useStorefrontRoute();
  const copy = getLocalizedCopy(locale);
  const [sortBy, setSortBy] = useState<SortOption["value"]>("featured");
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);
  const sortedProducts = useMemo(() => sortProducts(products, sortBy), [products, sortBy]);

  useEffect(() => {
    setVisibleCount(ITEMS_PER_PAGE);
  }, [sortBy, products]);

  if (products.length === 0) {
    return (
      <EmptyResultsState
        title={"Bu koleksiyonda hen\u00fcz \u00fcr\u00fcn yok"}
        body={copy.missingCategoryDescription || "Bu koleksiyon i\u00e7in \u00fcr\u00fcn geldik\u00e7e vitrin otomatik dolar."}
        actionLabel={copy.productsTitle || "T\u00fcm \u00dcr\u00fcnler"}
        actionHref={buildLocalizedPath("/urunler", locale)}
      />
    );
  }

  const visibleProducts = sortedProducts.slice(0, visibleCount);
  const hasMore = visibleCount < sortedProducts.length;

  return (
    <div>
      <ProductGridToolbar
        title={"Koleksiyon Sonu\u00e7lar\u0131"}
        totalCount={sortedProducts.length}
        visibleCount={visibleProducts.length}
        sortValue={sortBy}
        sortOptions={SORT_OPTIONS}
        onSortChange={setSortBy}
      />

      {visibleProducts.length === 0 ? (
        <div className="mt-6">
          <EmptyResultsState
            title={"Bu koleksiyonda henüz ürün bulunamadı"}
            body={"Bu kategoriye yeni ürünler eklendikçe vitrin otomatik olarak güncellenir."}
            actionLabel={copy.productsTitle || "T\u00fcm \u00dcr\u00fcnler"}
            actionHref={buildLocalizedPath("/urunler", locale)}
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
  );
}
