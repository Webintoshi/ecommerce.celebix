"use client";

// =====================================================
// PRICE CONFIG EDITOR
// Edit price adjustments for steps
// =====================================================

import { StepPriceConfig } from "@/types/product-customization";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DollarSign } from "lucide-react";

interface PriceConfigEditorProps {
  value?: StepPriceConfig;
  onChange: (value: StepPriceConfig | undefined) => void;
}

export function PriceConfigEditor({ value, onChange }: PriceConfigEditorProps) {
  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-gray-500" />
          <h3 className="font-medium">Fiyat Ayarları</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="baseAdjustment">Temel Fiyat Farkı (₺)</Label>
          <Input
            id="baseAdjustment"
            type="number"
            min={0}
            step={0.01}
            value={value?.base_price_adjustment || ""}
            onChange={(e) =>
              onChange({
                ...value,
                base_price_adjustment: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
            placeholder="0.00"
          />
          <p className="text-xs text-gray-500">
            Bu alan seçildiğinde eklenecek sabit tutar
          </p>
        </div>

        {value?.options && value.options.length > 0 && (
          <div className="space-y-2 pt-4 border-t border-gray-100">
            <h4 className="text-sm font-medium">Seçenek Fiyatları</h4>
            <div className="space-y-2">
              {value.options.map((opt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between text-sm"
                >
                  <span>{opt.value}</span>
                  <Badge variant="outline">
                    {opt.type === "fixed" ? "₺" : "%"}
                    {opt.price_adjustment}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
