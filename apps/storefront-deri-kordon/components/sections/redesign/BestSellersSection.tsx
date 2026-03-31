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

  // İlk 5 ürün (1 hero + 4 standard) - 1:1 ratio'da
  const heroProduct = products[0];
  const standardProducts = products.slice(1, 5);
  const hasMore = products.length > 5;

  if (loading) {
    return (
      <section className="py-16 lg:py-24 bg-neutral-50">
        <div className="container-premium">
          {/* Header Skeleton */}
          <div className="flex items-end justify-between mb-10">
            <div>
              <div className="h-4 w-24 bg-neutral-200 rounded-full mb-2" />
              <div className="h-10 w-48 bg-neutral-200 rounded-lg" />
            </div>
            <div className="h-10 w-28 bg-neutral-200 rounded-lg hidden sm:block" />
          </div>

          {/* Grid Skeleton - 1:1 Ratio */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Hero Skeleton - 1:1 */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-2xl overflow-hidden border border-neutral-200">
                <div className="aspect-square bg-neutral-200 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-neutral-200 rounded w-3/4" />
                  <div className="h-3 bg-neutral-200 rounded w-1/2" />
                </div>
              </div>
            </div>
            {/* Standard Skeletons - 1:1 */}
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl overflow-hidden border border-neutral-200"
              >
                <div className="aspect-square bg-neutral-200 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-neutral-200 rounded w-3/4" />
                  <div className="h-3 bg-neutral-200 rounded w-1/2" />
                </div>
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
    <section className="py-16 lg:py-24 bg-neutral-50">
      <div className="container-premium">
        {/* Section Header */}
        <div className="flex items-end justify-between mb-10">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-2 block">
              Popüler
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-neutral-900">
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

        {/* Grid - 1:1 Ratio - 2x2 on mobile, 4 cols on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {/* Hero Product - Same size as others but styled differently */}
          {heroProduct && (
            <PremiumProductCard 
              product={heroProduct} 
              variant="hero" 
              index={0}
            />
          )}

          {/* Standard Products */}
          {standardProducts.map((product, idx) => (
            <PremiumProductCard
              key={product.id}
              product={product}
              variant="standard"
              index={idx + 1}
            />
          ))}
        </div>

        {/* Mobile: View All Button */}
        <div className="flex sm:hidden justify-center mt-8">
          <Link
            href="/urunler"
            className="inline-flex items-center gap-2 px-6 py-3 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-colors"
          >
            Tüm Ürünleri Gör
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Desktop: View All Button (if more products) */}
        {hasMore && (
          <div className="hidden sm:flex justify-center mt-12">
            <Link
              href="/urunler"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all hover:shadow-lg"
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
