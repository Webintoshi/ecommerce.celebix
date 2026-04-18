"use client";

// =====================================================
// ORDER ITEM CUSTOMIZATION DISPLAY
// Shows customization details in order summary
// =====================================================

import { OrderItemCustomization } from "@/types/product-customization";
import { Badge } from "@/components/ui/badge";
import { Package, Printer, CheckCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface OrderItemCustomizationDisplayProps {
  customization: OrderItemCustomization;
  showProductionStatus?: boolean;
}

const productionStatusConfig = {
  pending: {
    label: "Beklemede",
    color: "bg-yellow-100 text-yellow-800",
    icon: Clock,
  },
  in_progress: {
    label: "Üretimde",
    color: "bg-blue-100 text-blue-800",
    icon: Printer,
  },
  completed: {
    label: "Tamamlandı",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle,
  },
  cancelled: {
    label: "İptal",
    color: "bg-red-100 text-red-800",
    icon: Clock,
  },
};

export function OrderItemCustomizationDisplay({
  customization,
  showProductionStatus = false,
}: OrderItemCustomizationDisplayProps) {
  const { 
    selections, 
    price_breakdown, 
    custom_text_content, 
    uploaded_files,
    production_status,
    production_notes,
    schema_snapshot 
  } = customization;

  const status = productionStatusConfig[production_status || "pending"];
  const StatusIcon = status.icon;

  return (
    <Card className="mt-4 border-amber-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-amber-600" />
            <CardTitle className="text-base">
              Kişiselleştirme: {schema_snapshot.name}
            </CardTitle>
          </div>
          {showProductionStatus && (
            <Badge className={status.color}>
              <StatusIcon className="w-3 h-3 mr-1" />
              {status.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Selections */}
        <div className="space-y-2">
          {selections.map((selection, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1"
            >
              <span className="text-gray-600">{selection.step_label}</span>
              <span className="font-medium text-gray-900">
                {selection.display_value}
              </span>
            </div>
          ))}
        </div>

        {/* Custom Text */}
        {custom_text_content && (
          <>
            <Separator />
            <div>
              <span className="text-sm text-gray-500">Kişiselleştirme Metni:</span>
              <p className="mt-1 p-3 bg-amber-50 rounded-lg font-medium text-gray-900">
                &ldquo;{custom_text_content}&rdquo;
              </p>
            </div>
          </>
        )}

        {/* Uploaded Files */}
        {uploaded_files && uploaded_files.length > 0 && (
          <>
            <Separator />
            <div>
              <span className="text-sm text-gray-500">Yüklenen Dosyalar:</span>
              <div className="mt-2 space-y-2">
                {uploaded_files.map((file, idx) => (
                  <a
                    key={idx}
                    href={file.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                  >
                    <Package className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-900">{file.file_name}</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Price Breakdown */}
        {price_breakdown && price_breakdown.total_adjustment > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {price_breakdown.adjustments.map((adj, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-500">
                    {adj.step_label}
                    {adj.option_label && ` (${adj.option_label})`}
                  </span>
                  <span className="text-green-600">
                    +{formatPrice(adj.adjustment_amount)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="font-medium text-gray-900">Kişiselleştirme Toplamı:</span>
                <span className="font-bold text-green-600">
                  +{formatPrice(price_breakdown.total_adjustment)}
                </span>
              </div>
            </div>
          </>
        )}

        {/* Production Notes (Admin only) */}
        {showProductionStatus && production_notes && (
          <>
            <Separator />
            <div>
              <span className="text-sm text-gray-500">Üretim Notları:</span>
              <p className="mt-1 text-sm text-gray-700">{production_notes}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
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
