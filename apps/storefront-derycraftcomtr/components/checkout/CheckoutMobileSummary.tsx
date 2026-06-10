"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatPrice, cn } from "@/lib/utils";
import type { CartItem } from "@/types/cart";
import { CheckoutOrderSummary } from "@/components/checkout/CheckoutOrderSummary";
import type { ShippingRate } from "@/lib/shipping-storage";

type AppliedCoupon = {
  code: string;
  discountAmount: number;
};

type CheckoutMobileSummaryProps = {
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
  freeShippingRemaining: number;
  freeShippingProgress: number;
  onCouponInputChange: (value: string) => void;
  onApplyCoupon: () => void;
  onRemoveCoupon: () => void;
};

export function CheckoutMobileSummary(props: CheckoutMobileSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const itemCount = props.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-xl border border-[#E8DFD3] bg-white px-4 py-3.5 text-left"
        aria-expanded={isOpen}
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B6914]">
            Sipariş özeti
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            {itemCount} ürün ·{" "}
            <span className="font-semibold text-[#12100D]">{formatPrice(props.finalTotal)}</span>
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-neutral-400 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {isOpen ? (
        <div className="mt-3 rounded-[1.25rem] border border-[#E8DFD3] bg-[#FBF8F4] px-4 py-5">
          <CheckoutOrderSummary {...props} />
        </div>
      ) : null}
    </div>
  );
}
