"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/product/ProductCard";
import { Product } from "@/types/product";
import { getLocalizedCopy } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";

interface CollectionProductsClientProps {
  products: Product[];
}

const ITEMS_PER_PAGE = 12;

export default function CollectionProductsClient({
  products,
}: CollectionProductsClientProps) {
  const { locale, buildPath } = useStorefrontRoute();
  const copy = getLocalizedCopy(locale);
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>(
    products.slice(0, ITEMS_PER_PAGE),
  );
  const [hasMore, setHasMore] = useState(products.length > ITEMS_PER_PAGE);
  const [isLoading, setIsLoading] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);

    setTimeout(() => {
      const currentLength = displayedProducts.length;
      const nextProducts = products.slice(currentLength, currentLength + ITEMS_PER_PAGE);

      if (nextProducts.length > 0) {
        setDisplayedProducts((prev) => [...prev, ...nextProducts]);
        setHasMore(currentLength + nextProducts.length < products.length);
      } else {
        setHasMore(false);
      }

      setIsLoading(false);
    }, 250);
  }, [displayedProducts.length, hasMore, isLoading, products]);

  useEffect(() => {
    setDisplayedProducts(products.slice(0, ITEMS_PER_PAGE));
    setHasMore(products.length > ITEMS_PER_PAGE);
  }, [products]);

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
      <div className="rounded-3xl border border-neutral-200 bg-white px-6 py-16 text-center">
        <p className="text-lg text-neutral-600">{copy.missingCategoryDescription}</p>
        <Link
          href={buildPath("/urunler")}
          className="mt-5 inline-flex rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          {copy.productsTitle}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-12">
        {displayedProducts.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} />
        ))}
      </div>

      <div ref={loadMoreRef} className="mt-10 flex items-center justify-center py-8">
        {isLoading && (
          <div className="flex items-center gap-2 text-neutral-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
            <span className="text-sm">Yukleniyor...</span>
          </div>
        )}
        {!hasMore && displayedProducts.length > 0 && (
          <p className="text-sm text-neutral-400">
            Tum urunler goruntulendi ({products.length} urun)
          </p>
        )}
      </div>
    </div>
  );
}
