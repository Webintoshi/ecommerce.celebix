"use client";

import { CartCustomizationPayload } from "@/types/product-customization";
import { Edit } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CartItemCustomizationDisplayProps {
  customization: CartCustomizationPayload;
  onEdit?: () => void;
  editable?: boolean;
  compact?: boolean;
}

export function CartItemCustomizationDisplay({
  customization,
  onEdit,
  editable = false,
  compact = false,
}: CartItemCustomizationDisplayProps) {
  const { selections, price_breakdown, custom_text_content } = customization;

  if (compact) {
    return (
      <div className="mt-2 border-t border-[#E8DFD3]/80 pt-2">
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Ekstra özellikler
        </p>
        <div className="space-y-1">
          {selections.map((selection, idx) => (
            <p key={idx} className="text-[10px] leading-snug text-neutral-700">
              <span className="font-medium uppercase tracking-[0.06em] text-neutral-500">
                {selection.step_label}:
              </span>{" "}
              <span className="text-neutral-800">{selection.display_value}</span>
            </p>
          ))}
        </div>
        {custom_text_content ? (
          <p className="mt-1.5 text-[10px] leading-snug text-neutral-700">
            <span className="font-medium uppercase tracking-[0.06em] text-neutral-500">
              Kişiselleştirme:
            </span>{" "}
            <span className="text-neutral-800">&ldquo;{custom_text_content}&rdquo;</span>
          </p>
        ) : null}
        {price_breakdown && price_breakdown.total_adjustment > 0 ? (
          <p className="mt-1 text-[10px] text-[#8A6B37]">
            +{formatPrice(price_breakdown.total_adjustment)} kişiselleştirme
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">
          {customization.schema_snapshot.name}
        </span>
        {editable && onEdit ? (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="mr-1 h-3 w-3" />
            Düzenle
          </Button>
        ) : null}
      </div>

      <div className="space-y-1">
        {selections.map((selection, idx) => (
          <div key={idx} className="flex items-center justify-between text-sm">
            <span className="text-gray-500">{selection.step_label}</span>
            <span className="font-medium text-gray-900">{selection.display_value}</span>
          </div>
        ))}
      </div>

      {custom_text_content ? (
        <div className="mt-2 rounded bg-amber-50 p-2 text-sm">
          <span className="text-gray-500">Kişiselleştirme: </span>
          <span className="font-medium text-gray-900">&ldquo;{custom_text_content}&rdquo;</span>
        </div>
      ) : null}

      {price_breakdown && price_breakdown.total_adjustment > 0 ? (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-500">Kişiselleştirme:</span>
          <span className="font-medium text-green-600">
            +{formatPrice(price_breakdown.total_adjustment)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}
