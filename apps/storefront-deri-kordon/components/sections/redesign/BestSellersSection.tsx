"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";
import { PremiumProductCard } from "@/components/product/PremiumProductCard";

interface BestSellersSectionProps {
  initialProducts?: Product[];
}

export function BestSellersSection({ initialProducts = [] }: BestSellersSectionProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [loading, setLoading] = useState(initialProducts.length === 0);

  useEffect(() => {
    async function fetchProducts() {
      if (initialProducts.length > 0) {
        setProducts(initialProducts);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/homepage", { cache: "no-store" });
        const payload = await response.json();
        setProducts(Array.isArray(payload.products) ? payload.products : []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setLoading(false);
      }
    }

    void fetchProducts();
  }, [initialProducts]);

  // İlk 8 ürün göster
  const displayProducts = products.slice(0, 8);
  const hasMore = products.length > 8;

  if (loading) {
    return (
      <section className="py-16 lg:py-24 bg-white">
        <div className="container-premium">
          {/* Header Skeleton */}
          <div className="flex items-end justify-between mb-12">
            <div>
              <div className="h-4 w-24 bg-neutral-200 rounded-full mb-2" />
              <div className="h-10 w-48 bg-neutral-200 rounded-lg" />
            </div>
          </div>

          {/* Grid Skeleton - Larger images */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-square bg-neutral-100 mb-4" />
                <div className="h-5 bg-neutral-200 rounded w-3/4 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (products.length === 0) {
    return null;
  }

  return (
    <section className="py-16 lg:py-24 bg-white">
      <div className="container-premium">
        {/* Section Header - Clean minimal style */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-2 block">
              Popüler
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900">
              Çok Satanlar
            </h2>
          </div>
          <Link
            href="/urunler"
            className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors group"
          >
            Tümünü Gör
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Products Grid - Clean, no borders, larger images */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 lg:gap-8">
          {displayProducts.map((product) => (
            <PremiumProductCard
              key={product.id}
              product={product}
            />
          ))}
        </div>

        {/* Mobile: View All Button */}
        <div className="flex sm:hidden justify-center mt-10">
          <Link
            href="/urunler"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
          >
            Tümünü Gör
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Desktop: View All Button */}
        {hasMore && (
          <div className="hidden sm:flex justify-center mt-14">
            <Link
              href="/urunler"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all"
            >
              Tüm Ürünleri Keşfet
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
