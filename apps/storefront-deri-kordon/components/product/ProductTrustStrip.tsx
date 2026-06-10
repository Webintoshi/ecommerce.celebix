"use client";

import { BadgeCheck, RotateCcw, Truck } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { SHIPPING_THRESHOLD } from "@/lib/constants";
import { formatPrice } from "@/lib/utils";

export function ProductTrustStrip() {
  const { shippingThreshold } = useCart();
  const resolvedShippingThreshold = shippingThreshold ?? SHIPPING_THRESHOLD;

  const items = [
    {
      icon: BadgeCheck,
      label: "%100 el yapımı hakiki deri",
    },
    {
      icon: Truck,
      label: `${formatPrice(resolvedShippingThreshold)} üzeri ücretsiz kargo`,
    },
    {
      icon: RotateCcw,
      label: "14 gün içinde kolay iade",
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <div
            key={item.label}
            className="flex min-h-12 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700"
          >
            <Icon className="h-4 w-4 shrink-0 stroke-[1.5] text-[#8A6B37]" />
            <span>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}
