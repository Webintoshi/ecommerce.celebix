"use client";

import { ShoppingCart } from "lucide-react";
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
          className="fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 border-t border-[#E5E7EB] bg-white/95 p-3 shadow-[0_-8px_28px_rgba(15,23,42,0.14)] backdrop-blur-lg sm:bottom-0 sm:p-4 lg:hidden"
        >
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-[#111827] sm:text-2xl">{formatPrice(price)}</span>
                {originalPrice ? (
                  <span className="hidden text-sm text-[#9CA3AF] line-through sm:inline">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
              </div>
              {originalPrice ? (
                <p className="text-xs font-semibold text-[#DC2626]">
                  %{Math.round((1 - price / originalPrice) * 100)} İndirim
                </p>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={onAddToCart}
                disabled={isOutOfStock}
                className={`flex items-center gap-2 rounded-xl px-6 py-3 font-semibold transition-all duration-200 active:scale-95 ${
                  isOutOfStock
                    ? "cursor-not-allowed bg-gray-200 text-gray-400"
                    : "bg-[#FF6A00] text-white shadow-lg shadow-[#FF6A00]/25"
                }`}
              >
                <ShoppingCart className="h-5 w-5" />
                <span>{isOutOfStock ? "Tükendi" : "Sepete Ekle"}</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
