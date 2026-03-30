"use client";

import Link from "next/link";
import Image from "next/image";
import { Star, ShoppingCart, Heart, Eye, ArrowRight, Sparkles } from "lucide-react";
import { Product } from "@/types/product";
import { formatPrice } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { useWishlist } from "@/lib/wishlist-context";
import { useQuickView } from "@/components/product/QuickViewProvider";
import { cn } from "@/lib/utils";
import { useState, useRef } from "react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
}

// 3D Tilt hook
function use3DTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  
  const springConfig = { stiffness: 150, damping: 15 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), springConfig);
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    x.set((e.clientX - centerX) / rect.width);
    y.set((e.clientY - centerY) / rect.height);
  };
  
  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };
  
  return { ref, rotateX, rotateY, handleMouseMove, handleMouseLeave };
}

export function ProductCard({ product, index = 0, viewMode = "grid" }: ProductCardProps) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { setQuickViewProduct } = useQuickView();
  const isWishlisted = isInWishlist(product.id);
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [showAddedFeedback, setShowAddedFeedback] = useState(false);
  
  const { ref, rotateX, rotateY, handleMouseMove, handleMouseLeave } = use3DTilt();

  // Varyant yoksa bile ürünü göster
  if (!product.variants || product.variants.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.05 }}
      >
        <Link 
          href={`${ROUTES.PRODUCTS}/${product.slug}`}
          className="block group"
        >
          <div className="bg-white border border-[#E5E2DE] hover:border-[#8A6B37]/50 transition-all duration-500 overflow-hidden group-hover:shadow-lg hover:-translate-y-1">
            {/* Image */}
            <div className="relative aspect-square bg-[#FAFAFA] overflow-hidden">
              {(product.images_v2 && product.images_v2.length > 0) ? (
                <Image
                  src={product.images_v2[0].url || product.images_v2[0]}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : product.images?.[0] ? (
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-700"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[#0F1626]/30">
                  <span className="text-sm">Görsel yok</span>
                </div>
              )}
            </div>
            
            {/* Info */}
            <div className="p-4">
              <h3 className="font-medium text-[#0F1626] line-clamp-2 mb-1 group-hover:text-[#8A6B37] transition-colors duration-300">
                {product.name}
              </h3>
              <p className="text-sm text-[#0F1626]/50 mb-2">
                Varyant seçenekleri için tıklayın
              </p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-[#0F1626]/30">
                  ---
                </span>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
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
      setShowAddedFeedback(true);
      setTimeout(() => setShowAddedFeedback(false), 2000);
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

  // Rating Stars Component
  const RatingStars = ({ rating, count }: { rating: number; count: number }) => (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={cn(
              "w-3.5 h-3.5 transition-colors duration-300",
              i < Math.floor(rating)
                ? "fill-[#8A6B37] text-[#8A6B37]"
                : "fill-[#E5E2DE] text-[#E5E2DE]"
            )}
          />
        ))}
      </div>
      {count > 0 && (
        <span className="text-[11px] text-[#0F1626]/50">
          ({count})
        </span>
      )}
    </div>
  );

  // Badges Component
  const ProductBadges = () => (
    <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
      {isOutOfStock ? (
        <span className="px-3 py-1.5 bg-[#0F1626] text-white text-[10px] font-medium tracking-wider uppercase">
          Stok Yok
        </span>
      ) : (
        <>
          {product.new && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="px-3 py-1.5 bg-[#8A6B37] text-white text-[10px] font-medium tracking-wider uppercase flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              Yeni
            </motion.span>
          )}
          {hasDiscount && (
            <span className="px-3 py-1.5 bg-[#0F1626] text-white text-[10px] font-medium tracking-wider uppercase">
              %{discountPercent} İndirim
            </span>
          )}
          {product.featured && !hasDiscount && !product.new && (
            <span className="px-3 py-1.5 bg-[#8A6B37]/10 text-[#8A6B37] border border-[#8A6B37]/20 text-[10px] font-medium tracking-wider uppercase">
              Öne Çıkan
            </span>
          )}
        </>
      )}
    </div>
  );

  if (viewMode === "list") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.05 }}
      >
        <Link
          href={ROUTES.product(product.slug)}
          className="group block"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="relative bg-white overflow-hidden border border-[#E5E2DE] hover:border-[#8A6B37]/50 transition-all duration-500 hover:shadow-lg">
            <div className="flex">
              {/* Image */}
              <div className="relative w-36 sm:w-48 flex-shrink-0 bg-[#FAFAFA] overflow-hidden">
                <div className="aspect-square">
                  {product.images && product.images.length > 0 ? (
                    <Image
                      src={product.images[0]}
                      alt={product.name}
                      fill
                      sizes="192px"
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-[#0F1626]/20">No Image</span>
                    </div>
                  )}
                </div>
                <ProductBadges />
              </div>

              {/* Content */}
              <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <p className="text-[11px] text-[#8A6B37] uppercase tracking-wider font-medium mb-1">
                    {product.category.replace("-", " ")}
                  </p>
                  <h3 className="font-serif text-[#0F1626] mb-2 text-base sm:text-lg leading-tight group-hover:text-[#8A6B37] transition-colors duration-300">
                    {product.name}
                  </h3>
                  <RatingStars rating={product.rating} count={product.reviewCount || 0} />
                  <p className="text-sm text-[#0F1626]/60 line-clamp-2 mt-2 hidden sm:block">
                    {product.shortDescription || product.description}
                  </p>
                </div>

                <div className="flex items-end justify-between mt-4">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-serif text-xl text-[#0F1626]">
                        {formatPrice(displayVariant.price)}
                      </span>
                      {hasDiscount && (
                        <span className="text-sm text-[#0F1626]/40 line-through">
                          {formatPrice(originalPrice)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <motion.button
                      onClick={handleWishlist}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        "w-10 h-10 flex items-center justify-center border transition-all duration-300",
                        isWishlisted 
                          ? "border-[#8A6B37] bg-[#8A6B37]/10 text-[#8A6B37]" 
                          : "border-[#E5E2DE] text-[#0F1626]/40 hover:border-[#8A6B37] hover:text-[#8A6B37]"
                      )}
                    >
                      <Heart className={cn("w-5 h-5", isWishlisted && "fill-[#8A6B37]")} />
                    </motion.button>
                    <motion.button
                      onClick={handleAddToCart}
                      disabled={isOutOfStock}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "px-6 py-3 font-medium uppercase tracking-wider text-sm flex items-center gap-2 transition-all duration-300",
                        isOutOfStock
                          ? "bg-[#E5E2DE] text-[#0F1626]/30 cursor-not-allowed"
                          : "bg-[#8A6B37] text-white hover:bg-[#0F1626] hover:shadow-lg"
                      )}
                    >
                      <ShoppingCart className="w-4 h-4" />
                      {isOutOfStock ? "Stok Yok" : "Sepete Ekle"}
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>
    );
  }

  // GRID VIEW - Premium Card with 3D Tilt
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      style={{
        rotateX: isHovered ? rotateX : 0,
        rotateY: isHovered ? rotateY : 0,
        transformStyle: "preserve-3d",
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        handleMouseLeave();
      }}
      onMouseDown={() => setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
    >
      <Link
        href={ROUTES.product(product.slug)}
        className="group block"
      >
        <motion.div 
          className="relative bg-white overflow-hidden border border-[#E5E2DE] transition-all duration-500"
          animate={{
            y: isPressed ? 2 : 0,
            boxShadow: isHovered 
              ? "0 25px 50px -12px rgba(15, 22, 38, 0.15), 0 12px 24px -8px rgba(138, 107, 55, 0.1)"
              : "0 4px 6px -1px rgba(15, 22, 38, 0.05)",
          }}
          whileHover={{ borderColor: "rgba(138, 107, 55, 0.3)" }}
        >
          
          {/* Image Container with Dual Image Hover */}
          <div className="relative aspect-square overflow-hidden bg-[#FAFAFA]">
            {/* Primary Image */}
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
                
                {/* Secondary Image (Crossfade on hover) */}
                {product.images[1] && (
                  <Image
                    src={product.images[1]}
                    alt={`${product.name} - alternatif görünüm`}
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
              <div className="w-full h-full flex items-center justify-center text-[#0F1626]/10">
                <span className="text-6xl">🎁</span>
              </div>
            )}

            {/* Loading Skeleton */}
            {!imageLoaded && (
              <div className="absolute inset-0 bg-[#E5E2DE] animate-pulse" />
            )}

            {/* Badges */}
            <ProductBadges />

            {/* Action Buttons - Top Right with Spring Animation */}
            <div className="absolute top-3 right-3 flex flex-col gap-2">
              {/* Wishlist Button */}
              <motion.button
                onClick={handleWishlist}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "w-10 h-10 flex items-center justify-center transition-all duration-300 shadow-sm",
                  isWishlisted 
                    ? "bg-[#8A6B37]/10 text-[#8A6B37] border border-[#8A6B37]" 
                    : "bg-white/95 backdrop-blur-sm text-[#0F1626]/50 hover:text-[#8A6B37] border border-[#E5E2DE] hover:border-[#8A6B37]"
                )}
                aria-label={isWishlisted ? "Favorilerden çıkar" : "Favorilere ekle"}
              >
                <Heart className={cn("w-4 h-4", isWishlisted && "fill-[#8A6B37]")} />
              </motion.button>
              
              {/* Quick View Button */}
              <motion.button
                onClick={handleQuickView}
                initial={{ opacity: 0, x: 10 }}
                animate={{ 
                  opacity: isHovered ? 1 : 0, 
                  x: isHovered ? 0 : 10 
                }}
                transition={{ duration: 0.3, delay: 0.1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 bg-white/95 backdrop-blur-sm text-[#0F1626]/50 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:text-[#8A6B37] border border-[#E5E2DE] hover:border-[#8A6B37] shadow-sm"
                aria-label="Hızlı görüntüle"
              >
                <Eye className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Out of Stock Overlay */}
            {isOutOfStock && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center">
                <span className="px-4 py-2 bg-[#0F1626] text-white text-xs font-medium uppercase tracking-wider">
                  Stok Tükendi
                </span>
              </div>
            )}

            {/* Added to Cart Feedback */}
            <AnimatePresence>
              {showAddedFeedback && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -20 }}
                  className="absolute inset-0 bg-[#0F1626]/90 backdrop-blur-sm flex items-center justify-center z-20"
                >
                  <div className="text-center text-white">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className="w-12 h-12 rounded-full bg-[#8A6B37] flex items-center justify-center mx-auto mb-3"
                    >
                      <ShoppingCart className="w-6 h-6" />
                    </motion.div>
                    <p className="text-sm font-medium">Sepete Eklendi</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Content */}
          <div className="p-4 bg-[#FAFAFA]">
            {/* Category */}
            <p className="text-[11px] text-[#8A6B37] uppercase tracking-wider font-medium mb-1">
              {product.category.replace("-", " ")}
            </p>

            {/* Name */}
            <h3 className="font-serif text-[#0F1626] mb-2 text-sm sm:text-base leading-snug group-hover:text-[#8A6B37] transition-colors duration-300 line-clamp-2">
              {product.name}
            </h3>

            {/* Rating */}
            <div className="mb-3">
              <RatingStars rating={product.rating} count={product.reviewCount || 0} />
            </div>

            {/* Price */}
            <div className="flex items-baseline gap-2 mb-4">
              <span className="font-serif text-lg sm:text-xl text-[#0F1626]">
                {formatPrice(displayVariant.price)}
              </span>
              {hasDiscount && (
                <span className="text-sm text-[#0F1626]/40 line-through">
                  {formatPrice(originalPrice)}
                </span>
              )}
            </div>

            {/* Add to Cart Button with Enhanced Hover */}
            <motion.button
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              whileHover={{ scale: isOutOfStock ? 1 : 1.02 }}
              whileTap={{ scale: isOutOfStock ? 1 : 0.98 }}
              className={cn(
                "w-full py-3 font-medium uppercase tracking-wider text-xs flex items-center justify-center gap-2 transition-all duration-300 relative overflow-hidden",
                isOutOfStock
                  ? "bg-[#E5E2DE] text-[#0F1626]/30 cursor-not-allowed"
                  : "bg-[#8A6B37] text-white hover:bg-[#0F1626] hover:shadow-lg"
              )}
              aria-label="Sepete ekle"
            >
              <span className="relative z-10 flex items-center gap-2">
                {isOutOfStock ? (
                  "Stok Tükendi"
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4" />
                    Sepete Ekle
                    <ArrowRight className="w-4 h-4 opacity-0 -ml-4 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                  </>
                )}
              </span>
              
              {/* Button hover shine effect */}
              {!isOutOfStock && (
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12"
                  initial={{ x: "-200%" }}
                  whileHover={{ x: "200%" }}
                  transition={{ duration: 0.6 }}
                />
              )}
            </motion.button>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
