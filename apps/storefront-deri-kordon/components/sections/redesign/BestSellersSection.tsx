"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ShoppingBag, Heart, ArrowRight, Star, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { getBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { Product } from "@/types/product";

export function BestSellersSection() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);

  // Fetch products from admin panel
  useEffect(() => {
    async function fetchProducts() {
      try {
        const supabase = getBrowserSupabaseClient();
        const { data, error } = await supabase
          .from("products")
          .select("*, variants:product_variants(*)")
          .eq("is_active", true)
          .eq("status", "published")
          .order("created_at", { ascending: false })
          .limit(4);

        if (error) throw error;
        setProducts(data || []);
      } catch (err) {
        console.error("Failed to fetch products:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchProducts();
  }, []);

  const toggleWishlist = (id: string) => {
    setWishlist(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Show nothing while loading
  if (loading) {
    return (
      <section className="py-24 lg:py-32 bg-white">
        <div className="container-premium">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="animate-pulse">
                <div className="aspect-[3/4] bg-[#F5F3F0] mb-4" />
                <div className="h-4 bg-[#F5F3F0] w-1/2 mb-2" />
                <div className="h-6 bg-[#F5F3F0] w-3/4 mb-2" />
                <div className="h-5 bg-[#F5F3F0] w-1/3" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Show nothing if no products
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="container-premium">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16"
        >
          <div>
            <span className="inline-flex items-center gap-3 text-[#8A6B37] text-xs font-medium tracking-[0.3em] uppercase mb-6">
              <span className="w-8 h-px bg-[#8A6B37]" />
              En Popüler
            </span>
            <h2 className="font-serif text-4xl md:text-5xl text-[#0F1626]">
              Çok Satanlar
            </h2>
          </div>
          <Link 
            href="/urunler" 
            className="group inline-flex items-center gap-2 text-[#0F1626] hover:text-[#8A6B37] transition-colors"
          >
            <span className="text-sm tracking-wider uppercase">Tüm Ürünler</span>
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {products.map((product, index) => {
            const variant = product.variants?.[0];
            const hasDiscount = variant?.originalPrice && variant.originalPrice > variant.price;
            
            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onMouseEnter={() => setHoveredId(product.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <Link href={`/urunler/${product.slug}`} className="group block">
                  {/* Image Container */}
                  <div className="relative aspect-[3/4] bg-[#F5F3F0] mb-4 overflow-hidden">
                    {/* Badges */}
                    <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                      {product.featured && (
                        <span className="bg-[#0F1626] text-white text-xs px-3 py-1.5 tracking-wider">
                          Çok Satan
                        </span>
                      )}
                      {product.new && (
                        <span className="bg-[#8A6B37] text-white text-xs px-3 py-1.5 tracking-wider">
                          Yeni
                        </span>
                      )}
                      {hasDiscount && (
                        <span className="bg-[#0F1626] text-white text-xs px-3 py-1.5 tracking-wider">
                          İndirim
                        </span>
                      )}
                    </div>

                    {/* Wishlist Button */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toggleWishlist(product.id);
                      }}
                      className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-[#0F1626]"
                    >
                      <Heart 
                        className={cn(
                          "w-5 h-5 transition-colors",
                          wishlist.includes(product.id) ? "fill-[#8A6B37] text-[#8A6B37]" : "text-[#0F1626] group-hover:text-white"
                        )} 
                      />
                    </button>

                    {/* Product Image */}
                    {product.images && product.images.length > 0 ? (
                      <Image
                        src={product.images[0]}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-32 h-32 rounded-full border-2 border-[#8A6B37]/20 flex items-center justify-center">
                          <div className="w-24 h-24 rounded-full bg-[#8A6B37]/10 flex items-center justify-center">
                            <svg viewBox="0 0 24 24" className="w-12 h-12 text-[#8A6B37]/40" fill="none" stroke="currentColor" strokeWidth="1">
                              <circle cx="12" cy="12" r="10" />
                              <path d="M12 6v6l4 2" />
                            </svg>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quick Add */}
                    <motion.div 
                      initial={{ y: "100%" }}
                      animate={{ y: hoveredId === product.id ? 0 : "100%" }}
                      transition={{ duration: 0.3 }}
                      className="absolute bottom-0 left-0 right-0 p-4"
                    >
                      <button className="w-full bg-[#0F1626] text-white py-3 flex items-center justify-center gap-2 hover:bg-[#8A6B37] transition-colors">
                        <ShoppingBag className="w-4 h-4" />
                        <span className="text-sm tracking-wider uppercase">İncele</span>
                      </button>
                    </motion.div>
                  </div>

                  {/* Product Info */}
                  <div className="space-y-2">
                    <p className="text-[#8A6B37] text-xs tracking-wider uppercase">{product.category}</p>
                    <h3 className="font-serif text-lg text-[#0F1626] group-hover:text-[#8A6B37] transition-colors">
                      {product.name}
                    </h3>
                    
                    {/* Rating */}
                    {product.rating > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-[#8A6B37] text-[#8A6B37]" />
                          <span className="text-sm font-medium text-[#0F1626]">{product.rating}</span>
                        </div>
                        {product.reviewCount > 0 && (
                          <span className="text-[#0F1626]/40 text-sm">({product.reviewCount} değerlendirme)</span>
                        )}
                      </div>
                    )}

                    {/* Price */}
                    {variant && (
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-lg font-medium text-[#0F1626]">
                          {variant.price.toLocaleString('tr-TR')} ₺
                        </span>
                        {hasDiscount && (
                          <span className="text-sm text-[#0F1626]/40 line-through">
                            {variant.originalPrice.toLocaleString('tr-TR')} ₺
                          </span>
                        )}
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
