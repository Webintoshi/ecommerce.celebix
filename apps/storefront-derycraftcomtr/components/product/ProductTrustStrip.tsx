"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Hammer, Truck } from "lucide-react";
import type { ShippingZone } from "@celebix/platform-config/src/shipping";
import { formatPrice } from "@/lib/utils";

const DEFAULT_FREE_SHIPPING_MIN = 1500;

function resolveFreeShippingMinOrder(zones: ShippingZone[]): number {
  for (const zone of zones) {
    for (const rate of zone.rates) {
      if (rate.enabled === false) continue;
      if (typeof rate.minOrder === "number" && rate.minOrder > 0) {
        if (rate.price === 0 || rate.name.toLowerCase().includes("ücretsiz")) {
          return rate.minOrder;
        }
      }
    }
  }

  for (const zone of zones) {
    for (const rate of zone.rates) {
      if (rate.enabled === false) continue;
      if (typeof rate.minOrder === "number" && rate.minOrder > 0) {
        return rate.minOrder;
      }
    }
  }

  return DEFAULT_FREE_SHIPPING_MIN;
}

type ProductTrustStripProps = {
  shortDescription?: string | null;
};

export function ProductTrustStrip({ shortDescription }: ProductTrustStripProps) {
  const [freeShippingMin, setFreeShippingMin] = useState(DEFAULT_FREE_SHIPPING_MIN);

  useEffect(() => {
    let cancelled = false;

    async function loadShippingThreshold() {
      try {
        const response = await fetch("/api/settings?type=shipping", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && payload?.success && Array.isArray(payload.shippingOptions)) {
          setFreeShippingMin(resolveFreeShippingMinOrder(payload.shippingOptions));
        }
      } catch {
        // Keep storefront fallback threshold.
      }
    }

    loadShippingThreshold();
    return () => {
      cancelled = true;
    };
  }, []);

  const chips = [
    {
      icon: Hammer,
      label: "%100 el yapımı hakiki deri",
    },
    {
      icon: Truck,
      label: `${formatPrice(freeShippingMin)} üzeri ücretsiz kargo`,
    },
    {
      icon: BadgeCheck,
      label: "14 gün içinde kolay iade",
    },
  ];

  return (
    <div className="space-y-3">
      {shortDescription?.trim() ? (
        <p className="text-sm leading-relaxed text-neutral-600">{shortDescription.trim()}</p>
      ) : null}

      <ul className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <li
            key={chip.label}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#E8DFD3] bg-[#FAF7F2] px-3 py-1.5 text-[0.68rem] font-medium uppercase tracking-[0.08em] text-[#3D342C]"
          >
            <chip.icon className="h-3.5 w-3.5 shrink-0 text-[#9A7234]" strokeWidth={1.5} />
            {chip.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
