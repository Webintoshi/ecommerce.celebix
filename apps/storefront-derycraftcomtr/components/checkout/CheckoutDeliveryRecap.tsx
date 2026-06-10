import { MapPin, Pencil } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import type { ShippingRate } from "@/lib/shipping-storage";

type ShippingInfo = {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  district: string;
  phone: string;
};

type CheckoutDeliveryRecapProps = {
  contactEmail: string;
  shippingInfo: ShippingInfo;
  selectedShippingRate: ShippingRate | null;
  resolvedShippingCost: number;
  onEdit: () => void;
};

export function CheckoutDeliveryRecap({
  contactEmail,
  shippingInfo,
  selectedShippingRate,
  resolvedShippingCost,
  onEdit,
}: CheckoutDeliveryRecapProps) {
  const fullName = [shippingInfo.firstName, shippingInfo.lastName].filter(Boolean).join(" ");
  const addressLine = [shippingInfo.address, shippingInfo.district, shippingInfo.city]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-xl border border-[#E8DFD3] bg-[#FBF8F4] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#E8DFD3] bg-white text-[#8A6B37]">
            <MapPin className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B6914]">
              Teslimat adresi
            </p>
            <p className="mt-1 text-sm font-semibold text-[#12100D]">{fullName}</p>
            <p className="mt-1 text-sm leading-6 text-neutral-600">{addressLine}</p>
            <p className="mt-1 text-sm text-neutral-600">{shippingInfo.phone}</p>
            <p className="mt-1 text-sm text-neutral-500">{contactEmail}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8A6B37] transition-colors hover:text-[#755a2d]"
        >
          <Pencil className="h-3.5 w-3.5" />
          Düzenle
        </button>
      </div>

      {selectedShippingRate ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#E8DFD3] pt-4 text-sm">
          <div>
            <p className="font-medium text-[#12100D]">{selectedShippingRate.name}</p>
            {selectedShippingRate.estimatedDays ? (
              <p className="mt-0.5 text-xs text-neutral-500">{selectedShippingRate.estimatedDays}</p>
            ) : null}
          </div>
          <span
            className={
              resolvedShippingCost === 0
                ? "font-semibold text-[#8A6B37]"
                : "font-semibold text-[#12100D]"
            }
          >
            {resolvedShippingCost === 0 ? "Ücretsiz" : formatPrice(resolvedShippingCost)}
          </span>
        </div>
      ) : null}
    </div>
  );
}
