"use client";

import { ShoppingCart, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatPrice } from "@/lib/utils";

interface MobileStickyBarProps {
  price: number;
  originalPrice?: number;
  stockLabel?: string;
  onAddToCart: () => void;
  onToggleWishlist?: () => void;
  isWishlisted?: boolean;
  isOutOfStock?: boolean;
}

export function MobileStickyBar({
  price,
  originalPrice,
  stockLabel,
  onAddToCart,
  onToggleWishlist,
  isWishlisted = false,
  isOutOfStock = false,
}: MobileStickyBarProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 520);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const discountPercent =
    originalPrice && originalPrice > price ? Math.round((1 - price / originalPrice) * 100) : 0;

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-x-0 bottom-0 z-50 border-t border-[#E3D7C8] bg-[linear-gradient(180deg,rgba(255,253,250,0.96)_0%,rgba(248,244,238,0.98)_100%)] px-4 pb-4 pt-3 shadow-[0_-18px_42px_-30px_rgba(25,16,9,0.42)] backdrop-blur-xl safe-area-pb lg:hidden"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[1.4rem] font-semibold tracking-[-0.03em] text-[#17110B]">
                  {formatPrice(price)}
                </span>
                {originalPrice ? (
                  <span className="text-sm text-neutral-400 line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-neutral-500">
                {discountPercent > 0 ? <span>{discountPercent}% off</span> : null}
                {stockLabel ? <span>{stockLabel}</span> : null}
              </div>
            </div>

            {onToggleWishlist ? (
              <button
                onClick={onToggleWishlist}
                className={`flex h-12 w-12 items-center justify-center rounded-full border transition-colors ${
                  isWishlisted
                    ? "border-[#8A6847] bg-[#8A6847] text-white"
                    : "border-[#DCCEBE] bg-white text-[#17110B]"
                }`}
                aria-label="Add to wishlist"
                type="button"
              >
                <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
              </button>
            ) : null}

            <button
              onClick={onAddToCart}
              disabled={isOutOfStock}
              className={`inline-flex h-12 min-w-[10.75rem] items-center justify-center gap-2 rounded-full px-5 text-sm font-medium uppercase tracking-[0.14em] transition-all duration-200 ${
                isOutOfStock
                  ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                  : "bg-[#17110B] text-white shadow-[0_18px_34px_-20px_rgba(23,17,11,0.8)]"
              }`}
              type="button"
            >
              <ShoppingCart className="h-4.5 w-4.5" />
              <span>{isOutOfStock ? "Sold out" : "Add to Cart"}</span>
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
