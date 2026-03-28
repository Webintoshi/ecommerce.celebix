"use client";

import * as React from "react";
import { useEffect, useState, useCallback } from "react";
import { Product } from "@/types/product";
import { formatPrice } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { X, Heart, Star, ShoppingCart, ChevronRight, ChevronLeft, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart-context";
import { useWishlist } from "@/lib/wishlist-context";
import { motion, AnimatePresence, PanInfo } from "framer-motion";

interface QuickViewContextType {
  quickViewProduct: Product | null;
  setQuickViewProduct: (product: Product | null) => void;
}

const QuickViewContext = React.createContext<QuickViewContextType>({
  quickViewProduct: null,
  setQuickViewProduct: () => {},
});

export function useQuickView() {
  return React.useContext(QuickViewContext);
}

export function QuickViewProvider({ children }: { children: React.ReactNode }) {
  const [quickViewProduct, setQuickViewProduct] = React.useState<Product | null>(null);

  return (
    <QuickViewContext.Provider value={{ quickViewProduct, setQuickViewProduct }}>
      {children}
      <AnimatePresence>
        {quickViewProduct && (
          <QuickViewModal 
            product={quickViewProduct} 
            onClose={() => setQuickViewProduct(null)} 
          />
        )}
      </AnimatePresence>
    </QuickViewContext.Provider>
  );
}

function QuickViewModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const isWishlisted = isInWishlist(product.id);
  const [selectedVariant, setSelectedVariant] = useState(product.variants?.[0] || null);
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const images = product.images?.length > 0 ? product.images : [];
  const isOutOfStock = selectedVariant?.stock === 0;

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleDragEnd = useCallback((_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false);
    if (info.offset.y > 100) {
      onClose();
    }
  }, [onClose]);

  const handleAddToCart = () => {
    if (!isOutOfStock && selectedVariant) {
      addToCart(product, selectedVariant, quantity);
      onClose();
    }
  };

  const handleWishlist = () => {
    if (isWishlisted) {
      removeFromWishlist(product.id);
    } else {
      addToWishlist(product);
    }
  };

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const originalPrice = selectedVariant?.originalPrice || selectedVariant?.price || 0;
  const hasDiscount = selectedVariant?.originalPrice && selectedVariant.originalPrice > selectedVariant.price;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Mobile: Bottom Sheet / Desktop: Center Modal */}
      <motion.div 
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        className="relative bg-white w-full sm:max-w-4xl sm:rounded-2xl sm:max-h-[85vh] sm:m-4 overflow-hidden"
        style={{ borderRadius: isDragging ? "24px" : undefined }}
      >
        {/* Mobile Drag Handle */}
        <div className="sm:hidden absolute top-0 left-0 right-0 z-20 flex justify-center pt-3 pb-2 bg-gradient-to-b from-white via-white to-transparent">
          <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 w-10 h-10 bg-white/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors border border-gray-100"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>
        
        <div className="grid grid-cols-1 md:grid-cols-2 h-full max-h-[90vh] md:max-h-[85vh] overflow-y-auto">
          {/* Image Section - Mobile Optimized */}
          <div className="relative bg-gray-100 md:aspect-auto">
            {/* Main Image */}
            <div className="relative aspect-square md:h-full md:min-h-[400px]">
              {images.length > 0 ? (
                <Image
                  src={images[currentImageIndex]}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-7xl md:text-8xl">
                  {product.category === "fistik-ezmesi" && "🥜"}
                  {product.category === "findik-ezmesi" && "🌰"}
                  {product.category === "kuruyemis" && "🥔"}
                </div>
              )}

              {/* Image Navigation Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5 text-gray-700" />
                  </button>
                  <button
                    onClick={nextImage}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-colors"
                  >
                    <ChevronRight className="w-5 h-5 text-gray-700" />
                  </button>
                </>
              )}

              {/* Image Indicators */}
              {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {images.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        idx === currentImageIndex 
                          ? "w-6 bg-white" 
                          : "bg-white/50"
                      )}
                    />
                  ))}
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-4 left-4 flex flex-col gap-1.5">
                {product.new && (
                  <span className="px-2.5 py-1 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm">
                    Yeni
                  </span>
                )}
                {hasDiscount && (
                  <span className="px-2.5 py-1 bg-rose-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-md shadow-sm">
                    %{Math.round(((originalPrice - (selectedVariant?.price || 0)) / originalPrice) * 100)} İndirim
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Details Section */}
          <div className="p-5 md:p-8 flex flex-col bg-white">
            {/* Category */}
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">
              {product.category.replace("-", " ")}
            </p>

            {/* Title */}
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-3 leading-tight">
              {product.name}
            </h2>

            {/* Rating */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <Star 
                    key={i} 
                    className={cn(
                      "w-4 h-4", 
                      i < Math.round(product.rating || 5) 
                        ? "text-amber-400 fill-amber-400" 
                        : "text-gray-200"
                    )} 
                  />
                ))}
              </div>
              <span className="text-sm text-gray-500">
                ({product.reviewCount || 0} değerlendirme)
              </span>
            </div>
            
            {/* Description */}
            <p className="text-gray-600 text-sm md:text-base mb-6 line-clamp-3">
              {product.shortDescription || product.description}
            </p>

            {/* Variants */}
            {product.variants && product.variants.length > 1 && (
              <div className="mb-5">
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  Seçenek: <span className="font-normal text-gray-600">{selectedVariant?.name}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariant(variant)}
                      className={cn(
                        "px-4 py-2.5 border-2 rounded-xl text-sm font-medium transition-all",
                        selectedVariant?.id === variant.id
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-gray-200 text-gray-700 hover:border-gray-300"
                      )}
                    >
                      {variant.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quantity Selector */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-900 mb-2">Adet</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center hover:border-primary hover:text-primary transition-colors"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center font-semibold text-lg">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-xl border-2 border-gray-200 flex items-center justify-center hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            {/* Price */}
            <div className="mb-5">
              <div className="flex items-baseline gap-3">
                <span className="text-2xl md:text-3xl font-bold text-primary">
                  {formatPrice((selectedVariant?.price || 0) * quantity)}
                </span>
                {hasDiscount && (
                  <span className="text-lg text-gray-400 line-through">
                    {formatPrice(originalPrice * quantity)}
                  </span>
                )}
              </div>
              {selectedVariant?.stock !== undefined && selectedVariant.stock < 10 && selectedVariant.stock > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Sadece {selectedVariant.stock} adet kaldı!
                </p>
              )}
            </div>

            {/* CTA Buttons */}
            <div className="mt-auto space-y-3">
              <button
                onClick={handleAddToCart}
                disabled={isOutOfStock}
                className={cn(
                  "w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]",
                  isOutOfStock
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-primary text-white hover:bg-primary/90 shadow-lg hover:shadow-xl"
                )}
              >
                <ShoppingCart className="w-5 h-5" />
                {isOutOfStock ? "Stok Tükendi" : "Sepete Ekle"}
              </button>

              <div className="flex gap-3">
                <Link
                  href={`/urun/${product.slug}`}
                  className="flex-1 py-3 bg-gray-100 text-gray-900 text-center font-semibold rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
                >
                  Ürünü İncele
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <button
                  onClick={handleWishlist}
                  className={cn(
                    "w-14 rounded-xl border-2 flex items-center justify-center transition-colors",
                    isWishlisted
                      ? "border-rose-200 bg-rose-50 text-rose-500"
                      : "border-gray-200 text-gray-600 hover:border-rose-200 hover:text-rose-500"
                  )}
                >
                  <Heart className={cn("w-5 h-5", isWishlisted && "fill-rose-500")} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
