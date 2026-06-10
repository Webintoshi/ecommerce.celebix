"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import type { CartItem } from "@/types/cart";
import { CartItemCustomizationDisplay } from "@/components/cart/cart-item-customization";
import { getCartItemDisplayImage } from "@/lib/product-images";
import { ShippingRate } from "@/lib/shipping-storage";

type AppliedCoupon = {
  code: string;
  discountAmount: number;
};

type CheckoutOrderSummaryProps = {
  items: CartItem[];
  subtotal: number;
  resolvedShippingCost: number;
  discountAmount: number;
  finalTotal: number;
  selectedShippingRate: ShippingRate | null;
  couponInput: string;
  appliedCoupon: AppliedCoupon | null;
  couponError: string;
  isApplyingCoupon: boolean;
  freeShippingRemaining?: number;
  freeShippingProgress?: number;
  onCouponInputChange: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
};

export function CheckoutOrderSummary({
  items,
  subtotal,
  resolvedShippingCost,
  discountAmount,
  finalTotal,
  selectedShippingRate,
  couponInput,
  appliedCoupon,
  couponError,
  isApplyingCoupon,
  freeShippingRemaining = 0,
  freeShippingProgress = 0,
  onCouponInputChange,
  onApplyCoupon,
  onRemoveCoupon,
}: CheckoutOrderSummaryProps) {
  const showFreeShippingNudge =
    resolvedShippingCost > 0 && freeShippingRemaining > 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-[#8B6914]">
          Sipariş özeti
        </p>
        <h2 className="mt-2 font-serif text-2xl text-[#12100D]">Sepetiniz</h2>
      </div>

      <div className="space-y-6">
        {showFreeShippingNudge ? (
          <div className="rounded-xl border border-[#E8DFD3] bg-white px-4 py-3.5">
            <p className="text-[11px] leading-5 text-neutral-600 sm:text-xs">
              Ücretsiz kargo için{" "}
              <span className="font-semibold text-[#8A6B37]">
                {formatPrice(freeShippingRemaining)}
              </span>{" "}
              daha ekleyin
            </p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#E8DFD3]">
              <div
                className="h-full rounded-full bg-[#8A6B37] transition-all duration-500"
                style={{ width: `${freeShippingProgress}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="max-h-[340px] space-y-3 overflow-y-auto pr-1">
          {items.map((item) => {
            const itemImage = getCartItemDisplayImage(item.product, item.variant);

            return (
              <div
                key={item.id}
                className="flex gap-3 rounded-xl border border-[#E8DFD3] bg-white p-3.5"
              >
                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#E8DFD3] bg-[#FAF7F2]">
                  {itemImage ? (
                    <img
                      src={itemImage}
                      alt={item.product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#8A6B37] px-1 text-[10px] font-semibold text-white">
                    {item.quantity}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 text-sm font-medium leading-snug text-[#12100D]">
                    {item.product.name}
                  </h4>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-neutral-500">
                    {item.variant.name}
                  </p>
                  {item.customization ? (
                    <CartItemCustomizationDisplay
                      customization={item.customization}
                      compact
                    />
                  ) : null}
                  <p className="mt-2 text-sm font-semibold text-[#12100D]">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2.5 border-t border-[#E8DFD3] pt-5 text-sm">
          <div className="flex justify-between text-neutral-600">
            <span>Ara toplam</span>
            <span className="font-medium text-[#12100D]">{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between text-neutral-600">
            <span>Kargo</span>
            <span
              className={cn(
                "font-medium",
                resolvedShippingCost === 0 ? "text-[#8A6B37]" : "text-[#12100D]",
              )}
            >
              {resolvedShippingCost === 0 ? "Ücretsiz" : formatPrice(resolvedShippingCost)}
            </span>
          </div>
          {selectedShippingRate ? (
            <div className="flex justify-between text-xs text-neutral-400">
              <span>{selectedShippingRate.name}</span>
              <span>{selectedShippingRate.estimatedDays || ""}</span>
            </div>
          ) : null}
          {discountAmount > 0 ? (
            <div className="flex justify-between text-neutral-600">
              <span>İndirim</span>
              <span className="font-medium text-[#8A6B37]">-{formatPrice(discountAmount)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-[#E8DFD3] bg-[#FAF7F2] px-4 py-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#12100D]">
            Toplam
          </span>
          <span className="font-serif text-2xl font-semibold text-[#12100D]">
            {formatPrice(finalTotal)}
          </span>
        </div>

        <div>
          <label className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            İndirim kodu
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={couponInput}
              onChange={(event) => onCouponInputChange(event.target.value.toUpperCase())}
              placeholder="Kodu girin"
              disabled={isApplyingCoupon}
              className="h-11 flex-1 rounded-lg border border-[#E8DFD3] bg-white px-3 text-sm text-[#12100D] placeholder:text-neutral-400 focus:border-[#8A6B37] focus:outline-none focus:ring-2 focus:ring-[#8A6B37]/15"
            />
            {appliedCoupon ? (
              <button
                type="button"
                onClick={onRemoveCoupon}
                className="h-11 shrink-0 rounded-lg border border-[#E8DFD3] bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-700 transition-colors hover:border-[#C4A062]"
              >
                Kaldır
              </button>
            ) : (
              <button
                type="button"
                onClick={onApplyCoupon}
                disabled={isApplyingCoupon}
                className="h-11 shrink-0 rounded-lg border border-[#E8DFD3] bg-white px-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-neutral-700 transition-colors hover:border-[#C4A062] disabled:opacity-60"
              >
                {isApplyingCoupon ? "..." : "Uygula"}
              </button>
            )}
          </div>
          {appliedCoupon ? (
            <p className="mt-2 text-xs font-medium text-[#8A6B37]">
              {appliedCoupon.code} uygulandı: -{formatPrice(discountAmount)}
            </p>
          ) : null}
          {couponError ? (
            <p className="mt-2 text-xs font-medium text-rose-600">{couponError}</p>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-[#E8DFD3] pt-4">
          <div className="flex items-center justify-center gap-2 text-[10px] text-neutral-400">
            <Lock className="h-3 w-3" />
            <span>256-bit SSL ile güvenli ödeme</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
            <Link href="/kargo" className="transition-colors hover:text-[#8A6B37]">
              Kargo bilgisi
            </Link>
            <span className="text-[#E8DFD3]">·</span>
            <Link href="/iade" className="transition-colors hover:text-[#8A6B37]">
              İade politikası
            </Link>
            <span className="text-[#E8DFD3]">·</span>
            <Link href="/sss" className="transition-colors hover:text-[#8A6B37]">
              SSS
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
