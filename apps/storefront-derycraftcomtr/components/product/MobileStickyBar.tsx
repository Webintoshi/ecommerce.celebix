"use client";

import { ShoppingCart, Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatPrice } from "@/lib/utils";

interface MobileStickyBarProps {
  price: number;
  originalPrice?: number;
  onAddToCart: () => void;
  isOutOfStock?: boolean;
}

export function MobileStickyBar({
  price,
  originalPrice,
  onAddToCart,
  isOutOfStock = false,
}: MobileStickyBarProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > 600);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#7B1113]/10 bg-white/95 p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] backdrop-blur-lg safe-area-pb lg:hidden"
        >
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#7B1113]">{formatPrice(price)}</span>
                {originalPrice ? (
                  <span className="text-sm text-[#6b4b4c] line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
              </div>
              {originalPrice ? (
                <p className="text-xs font-medium text-red-500">
                  %{Math.round((1 - price / originalPrice) * 100)} Indirim
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {}}
                className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-[#7B1113]/20 text-[#7B1113] transition-all active:scale-95"
              >
                <Heart className="h-5 w-5" />
              </button>
              <button
                onClick={onAddToCart}
                disabled={isOutOfStock}
                className={`flex items-center gap-2 rounded-xl px-6 py-3 font-semibold transition-all duration-200 active:scale-95 ${
                  isOutOfStock
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "bg-[#7B1113] text-white shadow-lg shadow-[#7B1113]/25"
                }`}
              >
                <ShoppingCart className="h-5 w-5" />
                <span>{isOutOfStock ? "Sold Out" : "Add to Cart"}</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
