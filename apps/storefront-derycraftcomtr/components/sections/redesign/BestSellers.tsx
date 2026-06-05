"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Product } from "@/types/product";
import { getLimitedProducts } from "@/lib/products";
import { ROUTES } from "@/lib/constants";
import { PremiumProductCard } from "@/components/product/PremiumProductCard";
import { Package, ArrowRight } from "lucide-react";

const ITEMS_PER_PAGE = 7; // 1 hero + 6 standard

export default function BestSellers({ initialProducts }: { initialProducts?: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [loading, setLoading] = useState(!initialProducts);

  useEffect(() => {
    if (initialProducts) {
      setProducts(initialProducts);
      setLoading(false);
      return;
    }

    async function loadProducts() {
      try {
        const data = await getLimitedProducts(16);
        setProducts(data);
      } catch (err) {
        console.error("Failed to load products", err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, [initialProducts]);

  const heroProduct = products[0];
  const standardProducts = products.slice(1, ITEMS_PER_PAGE);
  const hasMore = products.length > ITEMS_PER_PAGE;

  if (loading) {
    return (
      <section className="py-12 md:py-20 bg-neutral-50" id="best-sellers">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header Skeleton */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="h-4 w-24 bg-neutral-200 rounded-full mb-2" />
              <div className="h-8 w-48 bg-neutral-200 rounded-lg" />
            </div>
            <div className="h-10 w-28 bg-neutral-200 rounded-lg hidden sm:block" />
          </div>

          {/* Asymmetric Grid Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {/* Hero Skeleton */}
            <div className="md:row-span-2 lg:row-span-2">
              <div className="bg-white rounded-2xl overflow-hidden border border-neutral-200 h-full">
                <div className="aspect-[3/4] bg-neutral-200 animate-pulse" />
              </div>
            </div>
            {/* Standard Skeletons */}
            {[...Array(6)].map((_, i) => (
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
    return (
      <section className="py-12 md:py-20 bg-neutral-50" id="best-sellers">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center py-16 text-center bg-white rounded-3xl border border-neutral-200">
            <Package className="w-16 h-16 text-neutral-300 mb-4" />
            <h3 className="text-xl font-bold text-neutral-700 mb-2">No products found</h3>
            <p className="text-neutral-400">There are no products to show right now.</p>
            <Link
              href={ROUTES.products}
              className="mt-6 px-6 py-3 bg-neutral-900 text-white rounded-xl font-medium hover:bg-neutral-800 transition-colors"
            >
              Alışverişe Başla
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 md:py-20 bg-neutral-50" id="best-sellers">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8 md:mb-12">
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 mb-2 block">
              Popüler
            </span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-neutral-900">
              Çok Satanlar
            </h2>
          </div>
          
          {/* View All Link */}
          <Link 
            href={ROUTES.products} 
            className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors group"
          >
            Tümünü Gör
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* Asymmetric Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {/* Hero Product - Takes 2 rows on md+, 1 col on all */}
          {heroProduct && (
            <div className="md:row-span-2 lg:row-span-2 h-full">
              <PremiumProductCard 
                product={heroProduct} 
                variant="hero" 
                index={0}
              />
            </div>
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
            href={ROUTES.products}
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
              href={ROUTES.products}
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
