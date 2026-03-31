"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, ShoppingBag } from "lucide-react";
import { Product } from "@/types/product";
import { formatPrice } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { useWishlist } from "@/lib/wishlist-context";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";

interface PremiumProductCardProps {
  product: Product;
  variant: "hero" | "standard";
  index?: number;
}

// Renk kodlarını map et (örnek deri renkleri)
const colorMap: Record<string, string> = {
  "Cat": "#8B5A2B",
  "Bej": "#D4A574", 
  "Siyah": "#1A1A1A",
  "Taba": "#A67B5B",
  "Kahverengi": "#6B4423",
  "Krem": "#F5E6D3",
  "Bordo": "#722F37",
  "Lacivert": "#1E3A5F",
  "Yeşil": "#4A5D23",
};

function getColorCode(colorName: string): string {
  return colorMap[colorName] || "#8B5A2B";
}

export function PremiumProductCard({ product, variant, index = 0 }: PremiumProductCardProps) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const isWishlisted = isInWishlist(product.id);
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const displayVariant = product.variants?.[0];
  const isOutOfStock = displayVariant?.stock === 0;
  
  // Benzersiz renkleri çıkar
  const uniqueColors = product.variants?.reduce((acc, variant) => {
    if (variant.colorName && !acc.find(c => c.name === variant.colorName)) {
      acc.push({ name: variant.colorName, code: getColorCode(variant.colorName) });
    }
    return acc;
  }, [] as { name: string; code: string }[]) || [];

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOutOfStock && displayVariant) {
      addToCart(product, displayVariant, 1);
    }
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isWishlisted) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product);
    }
  };

  if (variant === "hero") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="h-full"
      >
        <Link
          href={ROUTES.product(product.slug)}
          className="group block h-full"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="relative h-full bg-white rounded-2xl overflow-hidden border border-neutral-200 hover:border-neutral-300 transition-all duration-500 hover:shadow-2xl">
            {/* Image Container */}
            <div className="relative aspect-[3/4] overflow-hidden bg-neutral-100">
              {product.images && product.images.length > 0 ? (
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  onLoad={() => setImageLoaded(true)}
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-400">
                  <span className="text-sm">Görsel yok</span>
                </div>
              )}

              {/* Loading Skeleton */}
              {!imageLoaded && (
                <div className="absolute inset-0 bg-neutral-200 animate-pulse" />
              )}

              {/* Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

              {/* Wishlist Button */}
              <button
                onClick={handleWishlist}
                className={cn(
                  "absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 z-10",
                  isWishlisted 
                    ? "bg-white text-rose-500" 
                    : "bg-white/90 backdrop-blur-sm text-neutral-600 hover:text-rose-500"
                )}
              >
                <Heart className={cn("w-5 h-5", isWishlisted && "fill-rose-500")} />
              </button>

              {/* Content Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                {/* Title */}
                <h3 className="text-xl md:text-2xl font-semibold mb-2 leading-tight">
                  {product.name}
                </h3>

                {/* Color Dots */}
                {uniqueColors.length > 0 && (
                  <div className="flex gap-2 mb-4">
                    {uniqueColors.slice(0, 4).map((color) => (
                      <div
                        key={color.name}
                        className="w-5 h-5 rounded-full border-2 border-white/50"
                        style={{ backgroundColor: color.code }}
                        title={color.name}
                      />
                    ))}
                    {uniqueColors.length > 4 && (
                      <span className="text-xs text-white/70 self-center ml-1">
                        +{uniqueColors.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {/* Price & CTA */}
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {displayVariant ? formatPrice(displayVariant.price) : "---"}
                  </span>
                  
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock}
                    className={cn(
                      "px-5 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 transition-all",
                      isOutOfStock
                        ? "bg-white/30 text-white/50 cursor-not-allowed"
                        : "bg-white text-neutral-900 hover:bg-neutral-100"
                    )}
                  >
                    <ShoppingBag className="w-4 h-4" />
                    {isOutOfStock ? "Stok Yok" : "Sepete Ekle"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  // STANDARD CARD
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
    >
      <Link
        href={ROUTES.product(product.slug)}
        className="group block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative bg-white rounded-2xl overflow-hidden border border-neutral-200 hover:border-neutral-300 transition-all duration-300 hover:shadow-xl">
          {/* Image Container */}
          <div className="relative aspect-square overflow-hidden bg-neutral-100">
            {product.images && product.images.length > 0 ? (
              <>
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className={cn(
                    "object-cover transition-all duration-500",
                    isHovered && product.images[1] ? "opacity-0 scale-105" : "opacity-100 scale-100"
                  )}
                  onLoad={() => setImageLoaded(true)}
                />
                {product.images[1] && (
                  <Image
                    src={product.images[1]}
                    alt={product.name}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className={cn(
                      "object-cover transition-all duration-500 absolute inset-0",
                      isHovered ? "opacity-100 scale-100" : "opacity-0 scale-95"
                    )}
                  />
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400">
                <span className="text-sm">Görsel yok</span>
              </div>
            )}

            {/* Loading Skeleton */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-neutral-200 animate-pulse" />
            )}

            {/* Wishlist Button */}
            <button
              onClick={handleWishlist}
              className={cn(
                "absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 z-10",
                isWishlisted 
                  ? "bg-white text-rose-500 shadow-md" 
                  : "bg-white/90 backdrop-blur-sm text-neutral-500 hover:text-rose-500 opacity-0 group-hover:opacity-100"
              )}
            >
              <Heart className={cn("w-4 h-4", isWishlisted && "fill-rose-500")} />
            </button>

            {/* Out of Stock */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                <span className="px-3 py-1.5 bg-neutral-800 text-white text-xs font-medium rounded-lg">
                  Stok Tükendi
                </span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4">
            {/* Title */}
            <h3 className="text-sm font-medium text-neutral-900 mb-2 line-clamp-2 leading-snug group-hover:text-neutral-700 transition-colors">
              {product.name}
            </h3>

            {/* Color Dots */}
            {uniqueColors.length > 0 && (
              <div className="flex gap-1.5 mb-3">
                {uniqueColors.slice(0, 4).map((color) => (
                  <div
                    key={color.name}
                    className="w-4 h-4 rounded-full border border-neutral-300"
                    style={{ backgroundColor: color.code }}
                    title={color.name}
                  />
                ))}
              </div>
            )}

            {/* Price */}
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold text-neutral-900">
                {displayVariant ? formatPrice(displayVariant.price) : "---"}
              </span>
              
              {/* Quick Add Button */}
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                  isOutOfStock
                    ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-900 hover:text-white"
                )}
              >
                <ShoppingBag className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
