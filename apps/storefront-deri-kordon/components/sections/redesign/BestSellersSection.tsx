"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ShoppingBag, Heart, ArrowRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { shouldBypassImageOptimization } from "@/lib/image-utils";
import type { Product } from "@/types/product";

interface BestSellersSectionProps {
  initialProducts?: Product[];
}

export function BestSellersSection({ initialProducts = [] }: BestSellersSectionProps) {
  const hydratedInitialProducts = initialProducts.slice(0, 4);
  const [products, setProducts] = useState<Product[]>(hydratedInitialProducts);
  const [loading, setLoading] = useState(hydratedInitialProducts.length === 0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);

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
          throw new Error(payload.error || "Urunler yuklenemedi.");
        }

        setProducts(Array.isArray(payload.products) ? payload.products.slice(0, 4) : []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setLoading(false);
      }
    }

    void fetchProducts();
  }, [hydratedInitialProducts]);

  const toggleWishlist = (id: string) => {
    setWishlist((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  if (loading) {
    return (
      <section className="bg-white py-24 lg:py-32">
        <div className="container-premium">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="mb-4 aspect-[3/4] bg-[#F5F3F0]" />
                <div className="mb-2 h-4 w-1/2 bg-[#F5F3F0]" />
                <div className="mb-2 h-6 w-3/4 bg-[#F5F3F0]" />
                <div className="h-5 w-1/3 bg-[#F5F3F0]" />
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
    <section className="bg-white py-24 lg:py-32">
      <div className="container-premium">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-16 flex flex-col gap-6 md:flex-row md:items-end md:justify-between"
        >
          <div>
            <span className="mb-6 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.3em] text-[#8A6B37]">
              <span className="h-px w-8 bg-[#8A6B37]" />
              En Populer
            </span>
            <h2 className="font-serif text-4xl text-[#0F1626] md:text-5xl">Cok Satanlar</h2>
          </div>
          <Link
            href="/urunler"
            className="group inline-flex items-center gap-2 text-[#0F1626] transition-colors hover:text-[#8A6B37]"
          >
            <span className="text-sm uppercase tracking-wider">Tum Urunler</span>
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {products.map((product, index) => {
            const variant = product.variants?.[0];
            const hasDiscount = Boolean(
              variant?.originalPrice && typeof variant.price === "number" && variant.originalPrice > variant.price,
            );
            const categoryLabel = typeof product.category === "string" ? product.category : "Urun";
            const rating = typeof product.rating === "number" ? product.rating : 0;
            const reviewCount = typeof product.reviewCount === "number" ? product.reviewCount : 0;
            const primaryImage =
              Array.isArray(product.images) && typeof product.images[0] === "string"
                ? product.images[0]
                : null;

            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onMouseEnter={() => setHoveredId(product.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="group relative"
              >
                <button
                  onClick={() => toggleWishlist(product.id)}
                  className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center bg-white/90 opacity-0 backdrop-blur-sm transition-opacity duration-300 hover:bg-[#0F1626] group-hover:opacity-100"
                  aria-label={wishlist.includes(product.id) ? "Favorilerden çıkar" : "Favorilere ekle"}
                >
                  <Heart
                    className={cn(
                      "h-5 w-5 transition-colors",
                      wishlist.includes(product.id)
                        ? "fill-[#8A6B37] text-[#8A6B37]"
                        : "text-[#0F1626] group-hover:text-white",
                    )}
                  />
                </button>

                <Link href={`/urunler/${product.slug}`} className="block">
                  <div className="relative mb-4 aspect-[3/4] overflow-hidden bg-[#F5F3F0]">
                    <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-col gap-2">
                      {product.featured && (
                        <span className="bg-[#0F1626] px-3 py-1.5 text-xs tracking-wider text-white">
                          Cok Satan
                        </span>
                      )}
                      {product.new && (
                        <span className="bg-[#8A6B37] px-3 py-1.5 text-xs tracking-wider text-white">
                          Yeni
                        </span>
                      )}
                      {hasDiscount && (
                        <span className="bg-[#0F1626] px-3 py-1.5 text-xs tracking-wider text-white">
                          Indirim
                        </span>
                      )}
                    </div>

                    {primaryImage ? (
                      <Image
                        src={primaryImage}
                        alt={product.name}
                        fill
                        draggable={false}
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        unoptimized={shouldBypassImageOptimization(primaryImage)}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-32 w-32 items-center justify-center rounded-full border-2 border-[#8A6B37]/20">
                          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#8A6B37]/10">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-12 w-12 text-[#8A6B37]/40"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    )}

                    <motion.div
                      initial={{ y: "100%" }}
                      animate={{ y: hoveredId === product.id ? 0 : "100%" }}
                      transition={{ duration: 0.3 }}
                      className="pointer-events-none absolute bottom-0 left-0 right-0 p-4"
                    >
                      <div className="flex w-full items-center justify-center gap-2 bg-[#0F1626] py-3 text-white transition-colors">
                        <ShoppingBag className="h-4 w-4" />
                        <span className="text-sm uppercase tracking-wider">Incele</span>
                      </div>
                    </motion.div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wider text-[#8A6B37]">{categoryLabel}</p>
                    <h3 className="font-serif text-lg text-[#0F1626] transition-colors group-hover:text-[#8A6B37]">
                      {product.name}
                    </h3>

                    {rating > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-[#8A6B37] text-[#8A6B37]" />
                          <span className="text-sm font-medium text-[#0F1626]">{rating}</span>
                        </div>
                        {reviewCount > 0 && (
                          <span className="text-sm text-[#0F1626]/40">
                            ({reviewCount} degerlendirme)
                          </span>
                        )}
                      </div>
                    )}

                    {variant && (
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-lg font-medium text-[#0F1626]">
                          {variant.price.toLocaleString("tr-TR")} TL
                        </span>
                        {hasDiscount && variant.originalPrice ? (
                          <span className="text-sm text-[#0F1626]/40 line-through">
                            {variant.originalPrice.toLocaleString("tr-TR")} TL
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
