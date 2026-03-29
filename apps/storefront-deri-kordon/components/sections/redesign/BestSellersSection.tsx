"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ShoppingBag, Heart, ArrowRight, Star } from "lucide-react";
import { cn } from "@/lib/utils";

const products = [
  {
    id: 1,
    name: "Classic Leather Watch Strap",
    subtitle: "Kahverengi Deri",
    price: 1299,
    originalPrice: 1599,
    rating: 4.9,
    reviews: 128,
    badge: "Çok Satan",
    isNew: false,
  },
  {
    id: 2,
    name: "Apple Watch Heritage Series",
    subtitle: "Antik Bronz",
    price: 1899,
    rating: 5.0,
    reviews: 89,
    badge: null,
    isNew: true,
  },
  {
    id: 3,
    name: "Slim Profile Leather Band",
    subtitle: "Siyah Deri",
    price: 999,
    originalPrice: 1299,
    rating: 4.8,
    reviews: 256,
    badge: "İndirim",
    isNew: false,
  },
  {
    id: 4,
    name: "Monogram Special Edition",
    subtitle: "Kişiselleştirilebilir",
    price: 2499,
    rating: 4.9,
    reviews: 64,
    badge: "Premium",
    isNew: true,
  },
];

export function BestSellersSection() {
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [wishlist, setWishlist] = useState<number[]>([]);

  const toggleWishlist = (id: number) => {
    setWishlist(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

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
          {products.map((product, index) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              onMouseEnter={() => setHoveredId(product.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="group">
                {/* Image Container */}
                <div className="relative aspect-[3/4] bg-[#F5F3F0] mb-4 overflow-hidden">
                  {/* Badges */}
                  <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    {product.badge && (
                      <span className="bg-[#0F1626] text-white text-xs px-3 py-1.5 tracking-wider">
                        {product.badge}
                      </span>
                    )}
                    {product.isNew && (
                      <span className="bg-[#8A6B37] text-white text-xs px-3 py-1.5 tracking-wider">
                        Yeni
                      </span>
                    )}
                  </div>

                  {/* Wishlist Button */}
                  <button
                    onClick={() => toggleWishlist(product.id)}
                    className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-[#0F1626]"
                  >
                    <Heart 
                      className={cn(
                        "w-5 h-5 transition-colors",
                        wishlist.includes(product.id) ? "fill-[#8A6B37] text-[#8A6B37]" : "text-[#0F1626] group-hover:text-white"
                      )} 
                    />
                  </button>

                  {/* Product Image Placeholder */}
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

                  {/* Quick Add */}
                  <motion.div 
                    initial={{ y: "100%" }}
                    animate={{ y: hoveredId === product.id ? 0 : "100%" }}
                    transition={{ duration: 0.3 }}
                    className="absolute bottom-0 left-0 right-0 p-4"
                  >
                    <button className="w-full bg-[#0F1626] text-white py-3 flex items-center justify-center gap-2 hover:bg-[#8A6B37] transition-colors">
                      <ShoppingBag className="w-4 h-4" />
                      <span className="text-sm tracking-wider uppercase">Sepete Ekle</span>
                    </button>
                  </motion.div>
                </div>

                {/* Product Info */}
                <div className="space-y-2">
                  <p className="text-[#8A6B37] text-xs tracking-wider uppercase">{product.subtitle}</p>
                  <h3 className="font-serif text-lg text-[#0F1626] group-hover:text-[#8A6B37] transition-colors">
                    {product.name}
                  </h3>
                  
                  {/* Rating */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-[#8A6B37] text-[#8A6B37]" />
                      <span className="text-sm font-medium text-[#0F1626]">{product.rating}</span>
                    </div>
                    <span className="text-[#0F1626]/40 text-sm">({product.reviews} değerlendirme)</span>
                  </div>

                  {/* Price */}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-lg font-medium text-[#0F1626]">
                      {product.price.toLocaleString('tr-TR')} ₺
                    </span>
                    {product.originalPrice && (
                      <span className="text-sm text-[#0F1626]/40 line-through">
                        {product.originalPrice.toLocaleString('tr-TR')} ₺
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
