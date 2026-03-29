"use client";

import { ShoppingCart, Heart } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

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
    // Show sticky bar after scrolling past the main add to cart button
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setIsVisible(scrollY > 600);
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
          className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-lg border-t border-[#7B1113]/10 p-4 z-50 lg:hidden safe-area-pb shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
        >
          <div className="flex items-center gap-4">
            {/* Price Section */}
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#7B1113]">{price} ₺</span>
                {originalPrice && (
                  <span className="text-sm text-[#6b4b4c] line-through">
                    {originalPrice} ₺
                  </span>
                )}
              </div>
              {originalPrice && (
                <p className="text-xs text-red-500 font-medium">
                  %{Math.round((1 - price / originalPrice) * 100)} İndirim
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {}}
                className="w-12 h-12 rounded-xl border-2 border-[#7B1113]/20 flex items-center justify-center text-[#7B1113] active:scale-95 transition-all"
              >
                <Heart className="w-5 h-5" />
              </button>
              <button
                onClick={onAddToCart}
                disabled={isOutOfStock}
                className={`
                  flex items-center gap-2 px-6 py-3 rounded-xl font-semibold
                  transition-all duration-200 active:scale-95
                  ${isOutOfStock
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-[#7B1113] text-white shadow-lg shadow-[#7B1113]/25"
                  }
                `}
              >
                <ShoppingCart className="w-5 h-5" />
                <span>{isOutOfStock ? "Tükendi" : "Sepete Ekle"}</span>
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
