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
      setIsVisible(window.scrollY > 560);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <AnimatePresence>
      {isVisible ? (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="safe-area-pb fixed bottom-3 left-3 right-3 z-50 rounded-[24px] border border-[var(--store-border)] bg-[rgba(246,246,246,0.96)] p-3 shadow-[0_24px_48px_-28px_rgba(80,94,113,0.24)] backdrop-blur-xl lg:hidden"
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
                Sepet Hazır
              </p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-[1.45rem] font-semibold text-[var(--store-accent)]">{formatPrice(price)}</span>
                {originalPrice ? (
                  <span className="pb-0.5 text-[12px] text-[var(--store-muted)] line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={onAddToCart}
              disabled={isOutOfStock}
              className={`inline-flex min-w-[148px] items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${
                isOutOfStock
                  ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                  : "bg-[var(--store-accent)] text-white shadow-[0_14px_30px_rgba(218,99,13,0.24)]"
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              {isOutOfStock ? "Tükendi" : "Sepete Ekle"}
            </button>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
