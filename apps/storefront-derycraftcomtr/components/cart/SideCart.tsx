"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Check,
  ArrowRight,
  Lock,
} from "lucide-react";
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
    updateQuantity,
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
            className="fixed inset-0 z-[9999] bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={slideVariants}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed z-[10000] flex flex-col bg-white shadow-2xl",
              "inset-x-0 bottom-0 h-[90vh] rounded-t-[2rem]",
              "sm:inset-x-auto sm:bottom-0 sm:right-0 sm:top-0 sm:h-full sm:w-[400px] sm:rounded-none",
            )}
          >
            <div className="flex w-full justify-center pb-1 pt-3 sm:hidden">
              <div className="h-1.5 w-12 rounded-full bg-gray-300" />
            </div>

            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">Cart</h2>
                <span className="text-sm font-medium text-gray-500">
                  ({getTotalItems()} items)
                </span>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-2 transition-colors hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {lastAddedItem ? (
              <div className="flex items-center gap-4 border-b border-emerald-100 bg-emerald-50 px-6 py-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                    Recently Added
                  </p>
                  <p className="truncate text-sm font-bold text-gray-900">
                    {lastAddedItem.product.name}
                  </p>
                  <p className="text-xs font-medium text-emerald-600">
                    {formatPrice(lastAddedItem.unitPrice * lastAddedItem.quantity)}
                  </p>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-emerald-100 bg-white text-2xl shadow-sm">
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
              <div className="border-b border-gray-100 bg-gray-50 px-6 py-3">
                <p className="mb-2 text-xs text-gray-600">
                  <span className="font-bold text-primary">
                    {formatPrice(remainingForFreeShipping)}
                  </span>{" "}
                  away from{" "}
                  <span className="font-bold text-emerald-600">free shipping</span>
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-500"
                    style={{ width: `${freeShippingProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {items.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center space-y-6 text-center">
                  <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-50">
                    <ShoppingBag className="h-10 w-10 text-gray-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Your cart is empty</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      You have not added any products yet.
                    </p>
                  </div>
                  <Link
                    href={buildPath("/urunler")}
                    onClick={onClose}
                    className="rounded-xl bg-primary px-8 py-3 font-bold text-white shadow-lg shadow-primary/20 transition-colors hover:bg-red-800"
                  >
                    Start Shopping
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
                      className="flex gap-4 rounded-2xl border border-gray-100/50 bg-gray-50 p-4 transition-colors hover:border-gray-200"
                    >
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-white text-2xl shadow-sm">
                        {itemImage ? (
                          <img
                            src={itemImage}
                            alt={item.product.name}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h6
                              className="m-0 overflow-hidden font-sans text-[13px] font-medium leading-[1.2] text-gray-900"
                              style={{
                                fontFamily: "var(--store-font-body)",
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {item.product.name}
                            </h6>
                            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                              {item.variant.name}
                            </p>
                          </div>
                          <span className="shrink-0 text-sm font-bold text-primary">
                            {formatPrice(item.unitPrice * item.quantity)}
                          </span>
                        </div>

                        {item.customization ? (
                          <CartItemCustomizationDisplay
                            customization={item.customization}
                          />
                        ) : null}

                        <div className="mt-3 flex items-center justify-between">
                          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-all hover:bg-gray-50 active:scale-95"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-600 transition-all hover:bg-gray-50 active:scale-95"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {items.length > 0 ? (
              <div className="space-y-4 border-t border-gray-100 bg-white p-6 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] sm:pb-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-500">Subtotal</span>
                    <span className="font-bold text-gray-900">
                      {formatPrice(subtotal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-500">Shipping</span>
                    <span
                      className={cn(
                        "font-bold",
                        shipping === 0 ? "text-emerald-600" : "text-gray-900",
                      )}
                    >
                      {shipping === 0 ? "Free" : formatPrice(shipping)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-[#eecfc2] bg-[#F5E6E0] p-4">
                  <span className="font-bold text-[#7B1113]">Total</span>
                  <span className="text-2xl font-black tracking-tight text-[#7B1113]">
                    {formatPrice(total)}
                  </span>
                </div>

                <Link
                  href={buildPath("/odeme")}
                  onClick={onClose}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-bold text-white shadow-lg shadow-primary/20 transition-all hover:bg-red-800 active:scale-[0.98]"
                >
                  Go to Checkout <ArrowRight className="h-5 w-5" />
                </Link>

                <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400">
                  <Lock className="h-3 w-3" />
                  <span>Secure checkout with 256-bit SSL</span>
                </div>
              </div>
            ) : null}
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
