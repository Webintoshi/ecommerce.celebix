"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ProductCard } from "@/components/product/ProductCard";
import { Product } from "@/types/product";

interface CollectionProductsClientProps {
  products: Product[];
}

const ITEMS_PER_PAGE = 12;

export default function CollectionProductsClient({
  products,
}: CollectionProductsClientProps) {
  const [displayedProducts, setDisplayedProducts] = useState<Product[]>(
    products.slice(0, ITEMS_PER_PAGE)
  );
  const [hasMore, setHasMore] = useState(products.length > ITEMS_PER_PAGE);
  const [isLoading, setIsLoading] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(() => {
    if (isLoading || !hasMore) return;

    setIsLoading(true);

    // Simulate a small delay for smooth UX
    setTimeout(() => {
      const currentLength = displayedProducts.length;
      const nextProducts = products.slice(
        currentLength,
        currentLength + ITEMS_PER_PAGE
      );

      if (nextProducts.length > 0) {
        setDisplayedProducts((prev) => [...prev, ...nextProducts]);
        setHasMore(currentLength + nextProducts.length < products.length);
      } else {
        setHasMore(false);
      }

      setIsLoading(false);
    }, 300);
  }, [displayedProducts.length, products, isLoading, hasMore]);

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
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loadMore, hasMore, isLoading]);

  if (products.length === 0) {
    return (
      <div className="rounded-3xl border border-neutral-200 bg-white px-6 py-16 text-center">
        <p className="text-lg text-neutral-600">
          Bu kategoride henüz ürün bulunmuyor.
        </p>
        <a
          href="/urunler"
          className="mt-5 inline-flex rounded-full bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Tüm ürünleri gör
        </a>
      </div>
    );
  }

  return (
    <div>
      {/* 3-column grid */}
      <div className="grid grid-cols-2 gap-6 lg:grid-cols-3 lg:gap-8">
        {displayedProducts.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} />
        ))}
      </div>

      {/* Load more trigger */}
      <div
        ref={loadMoreRef}
        className="mt-10 flex items-center justify-center py-8"
      >
        {isLoading && (
          <div className="flex items-center gap-2 text-neutral-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
            <span className="text-sm">Yükleniyor...</span>
          </div>
        )}
        {!hasMore && displayedProducts.length > 0 && (
          <p className="text-sm text-neutral-400">
            Tüm ürünler görüntülendi ({products.length} ürün)
          </p>
        )}
      </div>
    </div>
  );
}
