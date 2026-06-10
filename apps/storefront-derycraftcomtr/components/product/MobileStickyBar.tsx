"use client";

import { ShoppingCart, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatPrice } from "@/lib/utils";

interface MobileStickyBarProps {
  price: number;
  originalPrice?: number;
  onAddToCart: () => void;
  onToggleWishlist?: () => void;
  isWishlisted?: boolean;
  isOutOfStock?: boolean;
  isDisabled?: boolean;
}

export function MobileStickyBar({
  price,
  originalPrice,
  onAddToCart,
  onToggleWishlist,
  isWishlisted = false,
  isOutOfStock = false,
  isDisabled = false,
}: MobileStickyBarProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const disabled = isOutOfStock || isDisabled;

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#E8DFD3] bg-white/95 p-4 shadow-[0_-8px_32px_rgba(18,16,13,0.12)] backdrop-blur-lg safe-area-pb lg:hidden"
        >
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tracking-tight text-[#12100D]">
                  {formatPrice(price)}
                </span>
                {originalPrice ? (
                  <span className="text-sm text-neutral-400 line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
              </div>
              {originalPrice ? (
                <p className="text-xs font-medium text-[#9A7234]">
                  %{Math.round((1 - price / originalPrice) * 100)} indirim
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              {onToggleWishlist ? (
                <button
                  type="button"
                  onClick={onToggleWishlist}
                  aria-label={isWishlisted ? "Favorilerden çıkar" : "Favorilere ekle"}
                  className={`flex h-12 w-12 items-center justify-center rounded-full border border-[#E8DFD3] transition-all active:scale-95 ${
                    isWishlisted ? "text-[#9A7234]" : "text-[#12100D]"
                  }`}
                >
                  <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={onAddToCart}
                disabled={disabled}
                className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium uppercase tracking-wide transition-all duration-200 active:scale-95 ${
                  disabled
                    ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                    : "bg-[#8A6B37] text-white shadow-lg shadow-[#8A6B37]/25"
                }`}
              >
                <ShoppingCart className="h-5 w-5" />
                <span>{isOutOfStock ? "Tükendi" : isDisabled ? "Yükleniyor" : "Sepete Ekle"}</span>
              </button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
