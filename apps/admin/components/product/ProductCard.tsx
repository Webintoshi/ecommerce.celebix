"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, ShoppingCart, Heart, Eye, ArrowRight } from "lucide-react";
import { Product } from "@/types/product";
import { formatPrice } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { useWishlist } from "@/lib/wishlist-context";
import { useQuickView } from "@/components/product/QuickViewProvider";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion } from "framer-motion";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
}

export function ProductCard({ product, index = 0, viewMode = "grid" }: ProductCardProps) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { setQuickViewProduct } = useQuickView();
  const isWishlisted = isInWishlist(product.id);
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Varyant yoksa bile ürünü göster
  if (!product.variants || product.variants.length === 0) {
    return (
      <Link 
        href={`${ROUTES.PRODUCTS}/${product.slug}`}
        className="block group"
      >
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden">
          {/* Image */}
          <div className="relative aspect-square bg-gray-100 overflow-hidden">
            {(product.images_v2 && product.images_v2.length > 0) ? (
              <Image
                src={product.images_v2[0].url || product.images_v2[0]}
                alt={product.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            ) : product.images?.[0] ? (
              <Image
                src={product.images[0]}
                alt={product.name}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                <span className="text-sm">Görsel yok</span>
              </div>
            )}
          </div>
          
          {/* Info */}
          <div className="p-4">
            <h3 className="font-medium text-gray-900 line-clamp-2 mb-1 group-hover:text-primary transition-colors">
              {product.name}
            </h3>
            <p className="text-sm text-gray-500 mb-2">
              Varyant seçenekleri için tıklayın
            </p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-400">
                ---
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  const displayVariant = product.variants[0];
  const isOutOfStock = displayVariant?.stock === 0;
  const originalPrice = displayVariant?.originalPrice || displayVariant?.price;
  const hasDiscount = displayVariant?.originalPrice
    ? displayVariant.originalPrice > displayVariant.price
    : false;
  const discountPercent = hasDiscount ? Math.round(((originalPrice - displayVariant.price) / originalPrice) * 100) : 0;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOutOfStock) {
      addToCart(product, displayVariant, 1);
    }
  };

  const handleQuickView = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setQuickViewProduct(product);
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

  // Rating Stars
  const RatingStars = ({ rating, count }: { rating: number; count: number }) => (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={cn(
              "w-3 h-3",
              i < Math.floor(rating)
                ? "fill-amber-400 text-amber-400"
                : "fill-gray-100 text-gray-200"
            )}
          />
        ))}
      </div>
      {count > 0 && (
        <span className="text-[11px] text-gray-400">
          ({count})
        </span>
      )}
    </div>
  );

  // Badges - Modern ve belirgin
  const ProductBadges = () => (
    <div className="absolute top-3 left-3 flex flex-col gap-1.5 z-10">
      {isOutOfStock ? (
        <span className="px-2.5 py-1 bg-gray-800 text-white text-[10px] font-semibold rounded-md shadow-sm">
          Stok Yok
        </span>
      ) : (
        <>
          {product.new && (
            <span className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-semibold rounded-md shadow-sm">
              Yeni
            </span>
          )}
          {hasDiscount && (
            <span className="px-2.5 py-1 bg-rose-500 text-white text-[10px] font-semibold rounded-md shadow-sm">
              %{discountPercent} İndirim
            </span>
          )}
          {product.organic && (
            <span className="px-2.5 py-1 bg-amber-500 text-white text-[10px] font-semibold rounded-md shadow-sm">
              Organik
            </span>
          )}
          {product.sugarFree && (
            <span className="px-2.5 py-1 bg-sky-500 text-white text-[10px] font-semibold rounded-md shadow-sm">
              Şekersiz
            </span>
          )}
        </>
      )}
    </div>
  );

  if (viewMode === "list") {
    return (
      <Link
        href={ROUTES.product(product.slug)}
        className="group block"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="relative bg-stone-50 rounded-2xl overflow-hidden border border-stone-100 hover:border-stone-200 hover:shadow-xl transition-all duration-300">
          <div className="flex">
            {/* Image */}
            <div className="relative w-36 sm:w-48 flex-shrink-0 bg-white overflow-hidden">
              <div className="aspect-square">
                {product.images && product.images.length > 0 ? (
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    sizes="192px"
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">
                    {product.category === "fistik-ezmesi" && "🥜"}
                    {product.category === "findik-ezmesi" && "🌰"}
                    {product.category === "kuruyemis" && "🥔"}
                  </div>
                )}
              </div>
              <ProductBadges />
            </div>

            {/* Content */}
            <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
              <div>
                <p className="text-[11px] text-stone-400 uppercase tracking-wider font-medium mb-1">
                  {product.category.replace("-", " ")}
                </p>
                <h3 className="font-bold text-gray-900 mb-2 text-base sm:text-lg leading-tight">
                  {product.name}
                </h3>
                <RatingStars rating={product.rating} count={product.reviewCount || 0} />
                <p className="text-sm text-gray-500 line-clamp-2 mt-2 hidden sm:block">
                  {product.shortDescription || product.description}
                </p>
              </div>

              <div className="flex items-end justify-between mt-4">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-primary">
                      {formatPrice(displayVariant.price)}
                    </span>
                    {hasDiscount && (
                      <span className="text-sm text-gray-400 line-through">
                        {formatPrice(originalPrice)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleWishlist}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                      isWishlisted 
                        ? "border-rose-200 bg-rose-50 text-rose-500" 
                        : "border-stone-200 text-gray-400 hover:border-rose-200 hover:text-rose-500"
                    )}
                  >
                    <Heart className={cn("w-5 h-5", isWishlisted && "fill-rose-500")} />
                  </button>
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock}
                    className={cn(
                      "px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all",
                      isOutOfStock
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                        : "bg-primary text-white hover:bg-primary/90 shadow-lg hover:shadow-xl active:scale-95"
                    )}
                  >
                    <ShoppingCart className="w-4 h-4" />
                    {isOutOfStock ? "Stok Yok" : "Sepete Ekle"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // GRID VIEW - Modern Premium Card
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
    >
      <Link
        href={ROUTES.product(product.slug)}
        className="group block"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="relative bg-white rounded-2xl overflow-hidden border border-stone-100 hover:border-stone-200 hover:shadow-2xl transition-all duration-500">
          
          {/* Image Container */}
          <div className="relative aspect-square overflow-hidden bg-stone-100">
            {product.images && product.images.length > 0 ? (
              <>
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                  className={cn(
                    "object-cover transition-all duration-700",
                    isHovered && product.images[1] ? "opacity-0 scale-110" : "opacity-100 scale-100"
                  )}
                  onLoad={() => setImageLoaded(true)}
                  priority={index < 4}
                />
                {product.images[1] && (
                  <Image
                    src={product.images[1]}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    className={cn(
                      "object-cover transition-all duration-700 absolute inset-0",
                      isHovered ? "opacity-100 scale-100" : "opacity-0 scale-95"
                    )}
                  />
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl">
                {product.category === "fistik-ezmesi" && "🥜"}
                {product.category === "findik-ezmesi" && "🌰"}
                {product.category === "kuruyemis" && "🥔"}
              </div>
            )}

            {/* Loading Skeleton */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-stone-200 animate-pulse" />
            )}

            {/* Badges */}
            <ProductBadges />

            {/* Action Buttons - Top Right */}
            <div className="absolute top-3 right-3 flex flex-col gap-2">
              {/* Wishlist */}
              <button
                onClick={handleWishlist}
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110",
                  isWishlisted 
                    ? "bg-rose-50 text-rose-500" 
                    : "bg-white/95 backdrop-blur-sm text-gray-500 hover:text-rose-500"
                )}
                aria-label={isWishlisted ? "Favorilerden çıkar" : "Favorilere ekle"}
              >
                <Heart className={cn("w-4 h-4", isWishlisted && "fill-rose-500")} />
              </button>
              
              {/* Quick View - Desktop hover'da görünür */}
              <button
                onClick={handleQuickView}
                className={cn(
                  "w-9 h-9 rounded-full bg-white/95 backdrop-blur-sm text-gray-500 flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 hover:text-primary",
                  "md:opacity-0 md:translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0",
                  "opacity-100 translate-x-0"
                )}
                aria-label="Hızlı görüntüle"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>

            {/* Out of Stock Overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <span className="px-4 py-2 bg-gray-800 text-white text-xs font-bold uppercase tracking-wider rounded-lg">
                  Stok Tükendi
                </span>
              </div>
            )}
          </div>

          {/* Content - Hafif Gri Arka Plan */}
          <div className="p-4 bg-stone-50">
            {/* Category */}
            <p className="text-[11px] text-stone-400 uppercase tracking-wider font-medium mb-1">
              {product.category.replace("-", " ")}
            </p>

            {/* Name */}
            <h3 className="font-semibold text-gray-900 mb-2 text-sm sm:text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
              {product.name}
            </h3>

            {/* Rating */}
            <div className="mb-3">
              <RatingStars rating={product.rating} count={product.reviewCount || 0} />
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-lg sm:text-xl font-bold text-primary">
                {formatPrice(displayVariant.price)}
              </span>
              {hasDiscount && (
                <span className="text-sm text-gray-400 line-through">
                  {formatPrice(originalPrice)}
                </span>
              )}
            </div>

            {/* Fixed Add to Cart Button */}
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className={cn(
                "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200",
                isOutOfStock
                  ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-primary text-white hover:bg-primary/90 shadow-lg hover:shadow-xl active:scale-[0.98]"
              )}
              aria-label="Sepete ekle"
            >
              {isOutOfStock ? (
                "Stok Tükendi"
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" />
                  Sepete Ekle
                  <ArrowRight className="w-4 h-4 opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                </>
              )}
            </button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
