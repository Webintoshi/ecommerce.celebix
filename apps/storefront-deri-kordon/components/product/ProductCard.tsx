"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Eye, Heart, ShoppingCart, Star } from "lucide-react";
import { motion } from "framer-motion";
import { ROUTES } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { useWishlist } from "@/lib/wishlist-context";
import { useQuickView } from "@/components/product/QuickViewProvider";
import { cn, formatPrice } from "@/lib/utils";
import type { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
}

function RatingStars({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center">
        {[...Array(5)].map((_, index) => (
          <Star
            key={index}
            className={cn(
              "h-3 w-3",
              index < Math.floor(rating) ? "fill-[#8A6B37] text-[#8A6B37]" : "fill-[#E5E2DE] text-[#E5E2DE]",
            )}
          />
        ))}
      </div>
      {count > 0 && <span className="text-[11px] text-[#0F1626]/40">({count})</span>}
    </div>
  );
}

export function ProductCard({ product, index = 0, viewMode = "grid" }: ProductCardProps) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { setQuickViewProduct } = useQuickView();
  const isWishlisted = isInWishlist(product.id);
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const productHref = ROUTES.product(product.slug);

  if (!product.variants || product.variants.length === 0) {
    return (
      <Link href={productHref} className="group block">
        <div className="overflow-hidden border border-[#E5E2DE] bg-white transition-all duration-300 group-hover:border-[#8A6B37]/50 group-hover:shadow-lg">
          <div className="relative aspect-square overflow-hidden bg-[#FAFAFA]">
            {product.images_v2 && product.images_v2.length > 0 ? (
              <Image
                src={product.images_v2[0].url || product.images_v2[0]}
                alt={product.name}
                fill
                draggable={false}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            ) : product.images?.[0] ? (
              <Image
                src={product.images[0]}
                alt={product.name}
                fill
                draggable={false}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-[#0F1626]/30">
                <span className="text-sm">Görsel yok</span>
              </div>
            )}
          </div>

          <div className="p-4">
            <h3 className="mb-1 line-clamp-2 font-medium text-[#0F1626] transition-colors group-hover:text-[#8A6B37]">
              {product.name}
            </h3>
            <p className="mb-2 text-sm text-[#0F1626]/50">Varyant seçenekleri için tıklayın</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-[#0F1626]/30">---</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  const displayVariant = product.variants[0];
  const isOutOfStock = displayVariant?.stock === 0;
  const originalPrice = displayVariant?.originalPrice || displayVariant?.price;
  const hasDiscount = Boolean(
    displayVariant?.originalPrice && displayVariant.originalPrice > displayVariant.price,
  );
  const discountPercent = hasDiscount
    ? Math.round(((originalPrice - displayVariant.price) / originalPrice) * 100)
    : 0;

  const handleAddToCart = () => {
    if (!isOutOfStock) {
      addToCart(product, displayVariant, 1);
    }
  };

  const handleQuickView = () => {
    setQuickViewProduct(product);
  };

  const handleWishlist = () => {
    if (isWishlisted) {
      removeFromWishlist(product.id);
      return;
    }

    addToWishlist(product);
  };

  const ProductBadges = () => (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
      {isOutOfStock ? (
        <span className="bg-[#0F1626] px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white">
          Stok Yok
        </span>
      ) : (
        <>
          {product.new && (
            <span className="bg-[#8A6B37] px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white">
              Yeni
            </span>
          )}
          {hasDiscount && (
            <span className="bg-[#0F1626] px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-white">
              %{discountPercent} İndirim
            </span>
          )}
          {product.featured && !hasDiscount && !product.new && (
            <span className="border border-[#8A6B37]/20 bg-[#8A6B37]/10 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[#8A6B37]">
              Öne Çıkan
            </span>
          )}
        </>
      )}
    </div>
  );

  if (viewMode === "list") {
    return (
      <div
        className="group relative overflow-hidden border border-[#E5E2DE] bg-white transition-all duration-300 hover:border-[#8A6B37]/50"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="flex flex-col sm:flex-row">
          <Link href={productHref} className="flex min-w-0 flex-1">
            <div className="relative w-full flex-shrink-0 overflow-hidden bg-[#FAFAFA] sm:w-36 lg:w-48">
              <div className="aspect-square">
                {product.images && product.images.length > 0 ? (
                  <Image
                    src={product.images[0]}
                    alt={product.name}
                    fill
                    draggable={false}
                    sizes="192px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <span className="text-[#0F1626]/20">No Image</span>
                  </div>
                )}
              </div>
              <ProductBadges />
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-between p-4 sm:p-5">
              <div>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#8A6B37]">
                  {product.category.replace("-", " ")}
                </p>
                <h3 className="mb-2 font-serif text-base leading-tight text-[#0F1626] transition-colors group-hover:text-[#8A6B37] sm:text-lg">
                  {product.name}
                </h3>
                <RatingStars rating={product.rating} count={product.reviewCount || 0} />
                <p className="mt-2 hidden line-clamp-2 text-sm text-[#0F1626]/60 sm:block">
                  {product.shortDescription || product.description}
                </p>
              </div>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="font-serif text-xl text-[#0F1626]">{formatPrice(displayVariant.price)}</span>
                {hasDiscount && (
                  <span className="text-sm text-[#0F1626]/40 line-through">{formatPrice(originalPrice)}</span>
                )}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 border-t border-[#E5E2DE] p-4 sm:flex-col sm:justify-center sm:border-l sm:border-t-0 sm:p-5">
            <button
              onClick={handleWishlist}
              className={cn(
                "flex h-10 w-10 items-center justify-center border transition-all",
                isWishlisted
                  ? "border-[#8A6B37] bg-[#8A6B37]/10 text-[#8A6B37]"
                  : "border-[#E5E2DE] text-[#0F1626]/40 hover:border-[#8A6B37] hover:text-[#8A6B37]",
              )}
              aria-label={isWishlisted ? "Favorilerden çıkar" : "Favorilere ekle"}
            >
              <Heart className={cn("h-5 w-5", isWishlisted && "fill-[#8A6B37]")} />
            </button>
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock}
              className={cn(
                "flex items-center gap-2 px-6 py-3 text-sm font-medium uppercase tracking-wider transition-all",
                isOutOfStock
                  ? "cursor-not-allowed bg-[#E5E2DE] text-[#0F1626]/30"
                  : "bg-[#8A6B37] text-white hover:bg-[#0F1626]",
              )}
            >
              <ShoppingCart className="h-4 w-4" />
              {isOutOfStock ? "Stok Yok" : "Sepete Ekle"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group"
    >
      <div className="relative overflow-hidden border border-[#E5E2DE] bg-white transition-all duration-500 group-hover:border-[#8A6B37]/50 group-hover:shadow-lg">
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
          <button
            onClick={handleWishlist}
            className={cn(
              "flex h-9 w-9 items-center justify-center border transition-all duration-200 hover:scale-110",
              isWishlisted
                ? "border-[#8A6B37] bg-[#8A6B37]/10 text-[#8A6B37]"
                : "border-[#E5E2DE] bg-white/95 text-[#0F1626]/50 backdrop-blur-sm hover:text-[#8A6B37]",
            )}
            aria-label={isWishlisted ? "Favorilerden çıkar" : "Favorilere ekle"}
          >
            <Heart className={cn("h-4 w-4", isWishlisted && "fill-[#8A6B37]")} />
          </button>

          <button
            onClick={handleQuickView}
            className={cn(
              "flex h-9 w-9 items-center justify-center border border-[#E5E2DE] bg-white/95 text-[#0F1626]/50 backdrop-blur-sm transition-all duration-200 hover:scale-110 hover:text-[#8A6B37]",
              "md:translate-x-2 md:opacity-0 md:group-hover:translate-x-0 md:group-hover:opacity-100",
              "opacity-100 translate-x-0",
            )}
            aria-label="Hızlı görüntüle"
          >
            <Eye className="h-4 w-4" />
          </button>
        </div>

        <Link href={productHref} className="block">
          <div className="relative aspect-square overflow-hidden bg-[#FAFAFA]">
            {product.images && product.images.length > 0 ? (
              <>
                <Image
                  src={product.images[0]}
                  alt={product.name}
                  fill
                  draggable={false}
                  sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                  className={cn(
                    "object-cover transition-all duration-700",
                    isHovered && product.images[1] ? "scale-110 opacity-0" : "scale-100 opacity-100",
                  )}
                  onLoad={() => setImageLoaded(true)}
                  priority={index < 4}
                />
                {product.images[1] && (
                  <Image
                    src={product.images[1]}
                    alt={product.name}
                    fill
                    draggable={false}
                    sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                    className={cn(
                      "absolute inset-0 object-cover transition-all duration-700",
                      isHovered ? "scale-100 opacity-100" : "scale-95 opacity-0",
                    )}
                  />
                )}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#0F1626]/10">
                <span className="text-6xl">🎁</span>
              </div>
            )}

            {!imageLoaded && <div className="pointer-events-none absolute inset-0 animate-pulse bg-[#E5E2DE]" />}

            <ProductBadges />

            {isOutOfStock && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                <span className="bg-[#0F1626] px-4 py-2 text-xs font-medium uppercase tracking-wider text-white">
                  Stok Tükendi
                </span>
              </div>
            )}
          </div>

          <div className="bg-[#FAFAFA] p-4">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[#8A6B37]">
              {product.category.replace("-", " ")}
            </p>
            <h3 className="mb-2 line-clamp-2 font-serif text-sm leading-snug text-[#0F1626] transition-colors group-hover:text-[#8A6B37] sm:text-base">
              {product.name}
            </h3>
            <div className="mb-3">
              <RatingStars rating={product.rating} count={product.reviewCount || 0} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-lg text-[#0F1626] sm:text-xl">{formatPrice(displayVariant.price)}</span>
              {hasDiscount && (
                <span className="text-sm text-[#0F1626]/40 line-through">{formatPrice(originalPrice)}</span>
              )}
            </div>
          </div>
        </Link>

        <div className="bg-[#FAFAFA] px-4 pb-4">
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock}
            className={cn(
              "flex w-full items-center justify-center gap-2 py-3 text-xs font-medium uppercase tracking-wider transition-all duration-200",
              isOutOfStock
                ? "cursor-not-allowed bg-[#E5E2DE] text-[#0F1626]/30"
                : "bg-[#8A6B37] text-white hover:bg-[#0F1626]",
            )}
            aria-label="Sepete ekle"
          >
            {isOutOfStock ? (
              "Stok Tükendi"
            ) : (
              <>
                <ShoppingCart className="h-4 w-4" />
                Sepete Ekle
                <ArrowRight className="h-4 w-4 opacity-0 transition-all duration-300 group-hover:ml-0 group-hover:opacity-100 -ml-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
