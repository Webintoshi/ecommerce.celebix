"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";

interface BestSellersSectionProps {
  initialProducts?: Product[];
}

export function BestSellersSection({ initialProducts = [] }: BestSellersSectionProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts.slice(0, 8));
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
        setProducts(Array.isArray(payload.products) ? payload.products.slice(0, 8) : []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setLoading(false);
      }
    }

    void fetchProducts();
  }, [initialProducts]);

  if (loading) {
    return (
      <section className="py-20 lg:py-28 bg-neutral-50">
        <div className="container-premium">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-square bg-neutral-200 mb-4" />
                <div className="h-4 bg-neutral-200 mb-2" />
                <div className="h-4 w-1/2 bg-neutral-200" />
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
    <section className="py-20 lg:py-28 bg-neutral-50">
      <div className="container-premium">
        {/* Section Header */}
        <div className="flex items-end justify-between mb-12">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-neutral-500 mb-3">
              Popüler
            </p>
            <h2 className="text-3xl lg:text-4xl font-serif font-medium text-neutral-900">
              Çok Satanlar
            </h2>
          </div>
          <Link
            href="/urunler"
            className="hidden sm:inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Tümü
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {products.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </div>

        {/* Mobile View All */}
        <div className="mt-10 text-center sm:hidden">
          <Link
            href="/urunler"
            className="inline-flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            Tümünü gör
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
