"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X, ShoppingBag, Trash2, Check, ArrowRight, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { SHIPPING_THRESHOLD as SHIPPING_THRESHOLD_FALLBACK } from "@/lib/constants";
import { getPrimaryResolvedProductImage } from "@/lib/product-images";
import { CartItemCustomizationDisplay } from "@/components/cart/cart-item-customization";
import { formatPrice, cn } from "@/lib/utils";

interface SideCartProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SideCart({ isOpen, onClose }: SideCartProps) {
  const {
    items,
    removeFromCart,
    subtotal,
    shipping,
    total,
    shippingThreshold,
    freeShippingRemaining,
    freeShippingProgress,
    getTotalItems,
    lastAddedItem,
  } = useCart();
  const { buildPath } = useStorefrontRoute();

  const [isMobile, setIsMobile] = useState(false);
  const effectiveShippingThreshold = shippingThreshold ?? SHIPPING_THRESHOLD_FALLBACK;
  const remainingForFreeShipping = Math.max(
    0,
    freeShippingRemaining ?? effectiveShippingThreshold - subtotal,
  );
  const lastAddedItemImage = lastAddedItem
    ? getPrimaryResolvedProductImage(lastAddedItem.product, lastAddedItem.variant)
    : "";

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const slideVariants = {
    hidden: isMobile ? { y: "100%" } : { x: "100%" },
    visible: isMobile ? { y: 0 } : { x: 0 },
    exit: isMobile ? { y: "100%" } : { x: "100%" },
  };

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] bg-[#12100D]/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={slideVariants}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed z-[10000] flex flex-col bg-[#FAF7F2] shadow-[0_24px_80px_rgba(18,16,13,0.18)]",
              "inset-x-0 bottom-0 max-h-[92vh] rounded-t-[1.75rem]",
              "sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:h-full sm:max-h-none sm:w-[min(92vw,480px)] sm:rounded-none md:w-[520px]",
            )}
          >
            <div className="flex w-full justify-center pb-1 pt-3 sm:hidden">
              <div className="h-1 w-10 rounded-full bg-[#E8DFD3]" />
            </div>

            <div className="flex items-center justify-between border-b border-[#E8DFD3] px-5 py-4 sm:px-6">
              <div className="flex items-baseline gap-2">
                <h2 className="font-serif text-xl font-semibold text-[#12100D] sm:text-[1.35rem]">
                  Sepet
                </h2>
                <span className="text-xs font-medium text-neutral-500 sm:text-sm">
                  ({getTotalItems()} ürün)
                </span>
              </div>
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full border border-[#E8DFD3] bg-white text-neutral-600 transition-colors hover:border-[#C4A062] hover:text-[#12100D]"
                aria-label="Kapat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {lastAddedItem ? (
              <div className="flex items-center gap-3 border-b border-[#D8E8DF] bg-[#F0F7F2] px-5 py-3.5 animate-in fade-in slide-in-from-top-2 sm:px-6 sm:py-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8A6B37] shadow-sm">
                  <Check className="h-4 w-4 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8A6B37]">
                    Yeni eklendi
                  </p>
                  <p className="truncate text-sm font-medium text-[#12100D]">
                    {lastAddedItem.product.name}
                  </p>
                  <p className="text-xs font-medium text-neutral-600">
                    {formatPrice(lastAddedItem.unitPrice * lastAddedItem.quantity)}
                  </p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E8DFD3] bg-white">
                  {lastAddedItemImage ? (
                    <img
                      src={lastAddedItemImage}
                      alt={lastAddedItem.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {items.length > 0 &&
            shipping > 0 &&
            shippingThreshold != null &&
            remainingForFreeShipping > 0 ? (
              <div className="border-b border-[#E8DFD3] bg-white px-5 py-3 sm:px-6">
                <p className="mb-2 text-[11px] text-neutral-600 sm:text-xs">
                  <span className="font-semibold text-[#8A6B37]">
                    {formatPrice(remainingForFreeShipping)}
                  </span>{" "}
                  ücretsiz kargoya kalan tutar
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#E8DFD3]">
                  <div
                    className="h-full rounded-full bg-[#8A6B37] transition-all duration-500"
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 sm:space-y-4 sm:px-6 sm:py-5">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center space-y-5 py-10 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border border-[#E8DFD3] bg-white">
                    <ShoppingBag className="h-8 w-8 text-neutral-300" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-semibold text-[#12100D]">
                      Sepetiniz boş
                    </h3>
                    <p className="mt-1 text-sm text-neutral-500">
                      Henüz sepetinize ürün eklemediniz.
                    </p>
                  </div>
                  <Link
                    href={buildPath("/urunler")}
                    onClick={onClose}
                    className="inline-flex items-center justify-center border border-[#8A6B37] bg-[#8A6B37] px-8 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:border-[#755a2d] hover:bg-[#755a2d]"
                  >
                    Alışverişe Başla
                  </Link>
                </div>
              ) : (
                items.map((item) => {
                  const itemImage = getPrimaryResolvedProductImage(
                    item.product,
                    item.variant,
                  );

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-[#E8DFD3] bg-white p-3.5 sm:p-4"
                    >
                      <div className="flex gap-3 sm:gap-4">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E8DFD3] bg-[#FAF7F2] sm:h-[72px] sm:w-[72px]">
                          {itemImage ? (
                            <img
                              src={itemImage}
                              alt={item.product.name}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h6 className="line-clamp-2 font-sans text-[13px] font-medium leading-snug text-[#12100D] sm:text-sm">
                                {item.product.name}
                              </h6>
                              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">
                                {item.variant.name}
                              </p>
                            </div>
                            <span className="shrink-0 text-sm font-semibold text-[#12100D]">
                              {formatPrice(item.unitPrice * item.quantity)}
                            </span>
                          </div>

                          {item.customization ? (
                            <CartItemCustomizationDisplay
                              customization={item.customization}
                              compact
                            />
                          ) : null}

                          <div className="mt-2 flex justify-end">
                            <button
                              onClick={() => removeFromCart(item.id)}
                              className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-[#FAF7F2] hover:text-[#8A6B37]"
                              aria-label="Sepetten kaldır"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 ? (
              <div className="space-y-4 border-t border-[#E8DFD3] bg-white px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_rgba(18,16,13,0.06)] sm:px-6 sm:pb-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">Ara Toplam</span>
                    <span className="font-medium text-[#12100D]">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-neutral-500">Kargo</span>
                    <span
                      className={cn(
                        "font-medium",
                        shipping === 0 ? "text-[#8A6B37]" : "text-[#12100D]",
                      )}
                    >
                      {shipping === 0 ? "Ücretsiz" : formatPrice(shipping)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-[#E8DFD3] bg-[#FAF7F2] px-4 py-3.5">
                  <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[#12100D]">
                    Toplam
                  </span>
                  <span className="font-serif text-2xl font-semibold text-[#12100D]">
                    {formatPrice(total)}
                  </span>
                </div>

                <Link
                  href={buildPath("/odeme")}
                  onClick={onClose}
                  className="flex h-12 w-full items-center justify-center gap-2 border border-[#12100D] bg-[#12100D] text-[11px] font-semibold uppercase tracking-[0.2em] text-white transition-colors hover:border-[#3D342C] hover:bg-[#3D342C] active:scale-[0.99] sm:h-[52px]"
                >
                  Ödemeye Geç <ArrowRight className="h-4 w-4" />
                </Link>

                <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-400">
                  <Lock className="h-3 w-3" />
                  <span>256-bit SSL ile güvenli ödeme</span>
                </div>
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
