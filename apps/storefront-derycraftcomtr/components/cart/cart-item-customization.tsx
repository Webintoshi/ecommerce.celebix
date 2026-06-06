"use client";

// =====================================================
// CART ITEM CUSTOMIZATION DISPLAY
// Shows customization details in cart
// =====================================================

import { CartCustomizationPayload } from "@/types/product-customization";
import { Edit, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CartItemCustomizationDisplayProps {
  customization: CartCustomizationPayload;
  onEdit?: () => void;
  editable?: boolean;
}

export function CartItemCustomizationDisplay({
  customization,
  onEdit,
  editable = false,
}: CartItemCustomizationDisplayProps) {
  const { selections, price_breakdown, custom_text_content } = customization;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      {/* Schema Name */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-gray-900">
            {customization.schema_snapshot.name}
          </span>
        </div>
        {editable && onEdit && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="w-3 h-3 mr-1" />
            Düzenle
          </Button>
        )}
      </div>

      {/* Selections */}
      <div className="space-y-1">
        {selections.map((selection, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-gray-500">{selection.step_label}</span>
            <span className="font-medium text-gray-900">
              {selection.display_value}
            </span>
          </div>
        ))}
      </div>

      {/* Custom Text */}
      {custom_text_content && (
        <div className="mt-2 p-2 bg-amber-50 rounded text-sm">
          <span className="text-gray-500">Kişiselleştirme: </span>
          <span className="font-medium text-gray-900">&ldquo;{custom_text_content}&rdquo;</span>
        </div>
      )}

      {/* Price Adjustment */}
      {price_breakdown && price_breakdown.total_adjustment > 0 && (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-gray-500">Kişiselleştirme:</span>
          <span className="text-green-600 font-medium">
            +{formatPrice(price_breakdown.total_adjustment)}
          </span>
        </div>
      )}
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
