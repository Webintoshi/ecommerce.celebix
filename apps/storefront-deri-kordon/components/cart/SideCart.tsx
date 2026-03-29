"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X, ShoppingBag, Plus, Minus, Trash2, Check, ArrowRight, Lock } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { formatPrice, cn } from "@/lib/utils";
import { SHIPPING_THRESHOLD } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";
import { CartItemCustomizationDisplay } from "@/components/cart/cart-item-customization";

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
    getTotalItems,
    lastAddedItem,
  } = useCart();

  const [isMobile, setIsMobile] = useState(false);

  // Check for mobile device on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640); // 640px is tailwind 'sm' breakpoint
    };

    // Initial check
    checkMobile();

    // Add event listener
    window.addEventListener("resize", checkMobile);

    // Cleanup
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Animation variants based on device type
  const slideVariants = {
    hidden: isMobile ? { y: "100%" } : { x: "100%" },
    visible: isMobile ? { y: 0 } : { x: 0 },
    exit: isMobile ? { y: "100%" } : { x: "100%" },
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-[9999]"
            onClick={onClose}
          />

          {/* Cart Container */}
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={slideVariants}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className={cn(
              "fixed bg-white z-[10000] flex flex-col shadow-2xl",
              // MOBILE: Bottom Sheet Style
              "inset-x-0 bottom-0 h-[90vh] rounded-t-[2rem]",
              // DESKTOP: Side Sheet Style (overrides mobile)
              "sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:h-full sm:w-[400px] sm:rounded-none"
            )}
          >
            {/* Drag Handle - Mobile Only */}
            <div className="sm:hidden w-full flex justify-center pt-3 pb-1">
              <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-gray-900">Sepetim</h2>
                <span className="text-sm text-gray-500 font-medium">({getTotalItems()} ürün)</span>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Kapat"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            {/* Last Added Item Banner - GREEN SUCCESS */}
            {lastAddedItem && (
              <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center shrink-0 shadow-sm">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-0.5">Son Eklenen Ürün</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{lastAddedItem.product.name}</p>
                  <p className="text-xs text-emerald-600 font-medium">
                    {formatPrice(lastAddedItem.unitPrice * lastAddedItem.quantity)}
                  </p>
                </div>
                <div className="w-12 h-12 bg-white rounded-xl border border-emerald-100 flex items-center justify-center text-2xl shrink-0 shadow-sm overflow-hidden">
                  {lastAddedItem.product.images && lastAddedItem.product.images.length > 0 ? (
                    <img 
                      src={lastAddedItem.product.images[0]} 
                      alt={lastAddedItem.product.name} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      {lastAddedItem.product.category === "fistik-ezmesi" && "🥜"}
                      {lastAddedItem.product.category === "findik-ezmesi" && "🌰"}
                      {lastAddedItem.product.category === "kuruyemis" && "🥔"}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Free Shipping Progress Bar */}
            {items.length > 0 && shipping > 0 && (
              <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
                <p className="text-xs text-gray-600 mb-2">
                  <span className="font-bold text-primary">{formatPrice(SHIPPING_THRESHOLD - subtotal)}</span> daha harcayıp <span className="font-bold text-emerald-600">ücretsiz kargo</span> kazanın!
                </p>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((subtotal / SHIPPING_THRESHOLD) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {items.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center">
                    <ShoppingBag className="h-10 w-10 text-gray-300" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Sepetiniz Boş</h3>
                    <p className="text-gray-500 text-sm mt-1">Henüz sepetinize ürün eklemediniz.</p>
                  </div>
                  <Link
                    href="/urunler"
                    onClick={onClose}
                    className="px-8 py-3 bg-primary text-white rounded-xl font-bold hover:bg-red-800 transition-colors shadow-lg shadow-primary/20"
                  >
                    Alışverişe Başla
                  </Link>
                </div>
              ) : (
                items.map((item) => (
                  <div key={item.id} className="flex gap-4 bg-gray-50 rounded-2xl p-4 border border-gray-100/50 hover:border-gray-200 transition-colors">
                    <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center text-2xl shrink-0 border border-gray-100 shadow-sm overflow-hidden">
                      {item.product.images && item.product.images.length > 0 ? (
                        <img 
                          src={item.product.images[0]} 
                          alt={item.product.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <>
                          {item.product.category === "fistik-ezmesi" && "🥜"}
                          {item.product.category === "findik-ezmesi" && "🌰"}
                          {item.product.category === "kuruyemis" && "🥔"}
                        </>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <h3 className="font-bold text-gray-900 text-sm truncate">{item.product.name}</h3>
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{item.variant.name}</p>
                        </div>
                        <span className="font-bold text-primary text-sm">{formatPrice(item.unitPrice * item.quantity)}</span>
                      </div>
                      {item.customization && (
                        <CartItemCustomizationDisplay customization={item.customization} />
                      )}

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-0.5 shadow-sm">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-50 active:scale-95 transition-all"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-gray-100 p-6 bg-white space-y-4 shadow-[0_-10px_40px_rgba(0,0,0,0.03)] pb-8 sm:pb-6">

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium">Ara Toplam</span>
                    <span className="font-bold text-gray-900">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500 font-medium">Kargo</span>
                    <span className={cn("font-bold", shipping === 0 ? "text-emerald-600" : "text-gray-900")}>
                      {shipping === 0 ? "Ücretsiz" : formatPrice(shipping)}
                    </span>
                  </div>
                  {/* Discount Placeholder if needed */}
                </div>

                {/* Total Box - Using Brand Primary Color */}
                <div className="bg-[#F5E6E0] rounded-xl p-4 flex justify-between items-center border border-[#eecfc2]">
                  <span className="font-bold text-[#7B1113]">Toplam</span>
                  <span className="text-2xl font-black text-[#7B1113] tracking-tight">{formatPrice(total)}</span>
                </div>

                {/* Checkout Button - Using Brand Primary Color */}
                <Link
                  href="/odeme"
                  onClick={onClose}
                  className="w-full h-14 bg-primary text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-red-800 active:scale-[0.98] transition-all shadow-lg shadow-primary/20"
                >
                  Ödemeye Geç <ArrowRight className="h-5 w-5" />
                </Link>

                <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400">
                  <Lock className="h-3 w-3" />
                  <span>256-bit SSL ile güvenli ödeme</span>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

