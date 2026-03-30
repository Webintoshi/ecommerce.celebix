"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/product";
import { ProductCard } from "@/components/product/ProductCard";

interface BestSellersSectionProps {
  initialProducts?: Product[];
}

// Filter tabs
const filterTabs = [
  { id: "all", label: "Tümü" },
  { id: "bestseller", label: "Çok Satanlar" },
  { id: "new", label: "Yeni Gelenler" },
  { id: "featured", label: "Öne Çıkanlar" },
];

export function BestSellersSection({ initialProducts = [] }: BestSellersSectionProps) {
  const hydratedInitialProducts = initialProducts.slice(0, 8);
  const [products, setProducts] = useState<Product[]>(hydratedInitialProducts);
  const [loading, setLoading] = useState(hydratedInitialProducts.length === 0);
  const [activeFilter, setActiveFilter] = useState("all");
  const [displayCount, setDisplayCount] = useState(4);

  useEffect(() => {
    async function fetchProducts() {
      if (hydratedInitialProducts.length > 0) {
        setProducts(hydratedInitialProducts);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/homepage", { cache: "no-store" });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Ürünler yüklenemedi.");
        }

        setProducts(Array.isArray(payload.products) ? payload.products.slice(0, 8) : []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setLoading(false);
      }
    }

    void fetchProducts();
  }, [hydratedInitialProducts]);

  // Filter products
  const filteredProducts = products.filter((product) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "bestseller") return product.featured;
    if (activeFilter === "new") return product.new;
    if (activeFilter === "featured") return product.featured;
    return true;
  });

  const displayedProducts = filteredProducts.slice(0, displayCount);
  const hasMore = filteredProducts.length > displayCount;

  if (loading) {
    return (
      <section className="bg-white py-24 lg:py-32">
        <div className="container-premium">
          {/* Header Skeleton */}
          <div className="mb-12 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="h-4 w-24 bg-[#E5E2DE] rounded mb-4" />
              <div className="h-10 w-48 bg-[#E5E2DE] rounded" />
            </div>
            <div className="h-10 w-32 bg-[#E5E2DE] rounded" />
          </div>
          
          {/* Grid Skeleton */}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="mb-4 aspect-[3/4] bg-[#F5F3F0] rounded-lg" />
                <div className="mb-2 h-4 w-1/2 bg-[#F5F3F0] rounded" />
                <div className="mb-2 h-6 w-3/4 bg-[#F5F3F0] rounded" />
                <div className="h-5 w-1/3 bg-[#F5F3F0] rounded" />
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
    <section className="bg-white py-24 lg:py-32 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-20 right-0 w-72 h-72 bg-[#8A6B37]/5 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-0 w-96 h-96 bg-[#0F1626]/3 rounded-full blur-3xl" />
      </div>

      <div className="container-premium relative z-10">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <motion.span 
              className="mb-4 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-[#8A6B37]"
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <TrendingUp className="w-4 h-4" />
              En Popüler
            </motion.span>
            <motion.h2 
              className="font-serif text-4xl text-[#0F1626] md:text-5xl lg:text-6xl"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              Çok Satanlar
            </motion.h2>
          </div>
          
          {/* Filter Tabs */}
          <motion.div 
            className="flex flex-wrap gap-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            {filterTabs.map((tab) => (
              <motion.button
                key={tab.id}
                onClick={() => {
                  setActiveFilter(tab.id);
                  setDisplayCount(4);
                }}
                className={cn(
                  "px-4 py-2 text-sm font-medium uppercase tracking-wider transition-all duration-300",
                  activeFilter === tab.id
                    ? "bg-[#0F1626] text-white"
                    : "bg-[#F5F3F0] text-[#0F1626]/70 hover:bg-[#E5E2DE]"
                )}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {tab.label}
              </motion.button>
            ))}
          </motion.div>
        </motion.div>

        {/* Products Grid with AnimatePresence for filter transitions */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeFilter}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8"
          >
            {displayedProducts.map((product, index) => (
              <ProductCard 
                key={product.id} 
                product={product} 
                index={index}
              />
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Empty State */}
        {filteredProducts.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#F5F3F0] flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-[#8A6B37]/50" />
            </div>
            <p className="text-lg text-[#0F1626]/60">
              Bu kategoride ürün bulunamadı.
            </p>
          </motion.div>
        )}

        {/* Load More / View All */}
        {filteredProducts.length > 0 && (
          <motion.div 
            className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            {hasMore && (
              <motion.button
                onClick={() => setDisplayCount(prev => prev + 4)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-8 py-4 bg-[#F5F3F0] text-[#0F1626] font-medium uppercase tracking-wider text-sm transition-all duration-300 hover:bg-[#E5E2DE]"
              >
                Daha Fazla Göster
              </motion.button>
            )}
            
            <Link
              href="/urunler"
              className="group inline-flex items-center gap-3 px-8 py-4 bg-[#8A6B37] text-white font-medium uppercase tracking-wider text-sm transition-all duration-300 hover:bg-[#0F1626] hover:shadow-lg"
            >
              <span>Tüm Ürünler</span>
              <motion.span
                initial={{ x: 0 }}
                whileHover={{ x: 4 }}
                transition={{ type: "spring", stiffness: 400 }}
              >
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              </motion.span>
            </Link>
          </motion.div>
        )}

        {/* Trust Indicators */}
        <motion.div 
          className="mt-20 pt-12 border-t border-[#E5E2DE]"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { icon: "🚚", title: "Ücretsiz Kargo", desc: "500 TL üzeri" },
              { icon: "🔒", title: "Güvenli Ödeme", desc: "256-bit SSL" },
              { icon: "✋", title: "El Yapımı", desc: "%100 Deri" },
              { icon: "↩️", title: "Kolay İade", desc: "14 gün içinde" },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                className="text-center"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + index * 0.1 }}
              >
                <div className="text-3xl mb-3">{item.icon}</div>
                <h4 className="font-medium text-[#0F1626] mb-1">{item.title}</h4>
                <p className="text-sm text-[#0F1626]/50">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
