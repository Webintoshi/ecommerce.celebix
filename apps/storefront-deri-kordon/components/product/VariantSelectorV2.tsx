"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface Props {
  variants: any[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function VariantSelectorV2({ variants, selectedIndex, onSelect }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !variants || variants.length === 0) {
    return null;
  }

  const currentVariant = variants[selectedIndex];
  
  // Extract attribute groups from ALL variants
  const attributeGroups: { [key: string]: { name: string; values: any[] } } = {};
  
  variants.forEach((variant, vIdx) => {
    const attrs = variant.attributes || [];
    attrs.forEach((attr: any) => {
      // Get attribute name from attribute.name or fallback
      const attrName = attr.attribute?.name || attr.name || "Seçenek";
      const attrId = attr.attribute?.id || attr.name || "default";
      
      if (!attributeGroups[attrId]) {
        attributeGroups[attrId] = { name: attrName, values: [] };
      }
      
      // Check if value already exists
      const exists = attributeGroups[attrId].values.find((v) => v.value === attr.value);
      if (!exists) {
        attributeGroups[attrId].values.push({
          value: attr.value,
          image_url: attr.image_url,
          color_code: attr.color_code,
          variantIndex: vIdx,
        });
      }
    });
  });



  // Check if it's a color attribute or has images
  const isColor = (name: string, values: any[]) => {
    const lower = name.toLowerCase();
    const isColorName = lower.includes("renk") || lower.includes("color") || lower.includes("rengi");
    // Eğer değerlerden herhangi birinde görsel varsa, görsel seçici göster
    const hasImages = values.some(v => v.image_url || v.color_code);
    return isColorName || hasImages;
  };

  // Get current selected value for an attribute
  const getSelectedValue = (attrId: string) => {
    const attrs = currentVariant?.attributes || [];
    const match = attrs.find((a: any) => (a.attribute?.id || a.name) === attrId);
    return match?.value;
  };

  // Handle selection
  const handleSelect = (attrId: string, value: string) => {
    // Find variant that has this attribute value
    const matchIdx = variants.findIndex((v) => {
      return v.attributes?.some((a: any) => {
        const aId = a.attribute?.id || a.name;
        return aId === attrId && a.value === value;
      });
    });
    
    if (matchIdx !== -1) {
      onSelect(matchIdx);
    }
  };

  // Get attribute keys
  const attrKeys = Object.keys(attributeGroups);
  
  // Bu store icin nitelik gelmeyen varsayilan "Boyut / 0g" fallback'i gosterme.
  if (attrKeys.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {attrKeys.map((attrId) => {
        const group = attributeGroups[attrId];
        const selectedValue = getSelectedValue(attrId);
        const isColorAttr = isColor(group.name, group.values);

        return (
          <div key={attrId} className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-neutral-900 text-xs uppercase tracking-wide">
                {group.name}
              </span>
              {selectedValue && (
                <>
                  <span className="text-gray-400">—</span>
                  <span className="text-neutral-500 text-sm font-medium">{selectedValue}</span>
                </>
              )}
            </div>

            {/* Values */}
            {isColorAttr || group.values.some(v => v.image_url) ? (
              // COLOR SWATCHES with IMAGES
              <div className="flex flex-wrap gap-3">
                {group.values.map((val, idx) => {
                  const isSelected = selectedValue === val.value;
                  const variant = variants[val.variantIndex];
                  const isOutOfStock = variant?.stock <= 0;

                  return (
                    <button
                      key={idx}
                      onClick={() => !isOutOfStock && handleSelect(attrId, val.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "relative w-14 h-14 rounded-full border-2 transition-all duration-200 overflow-hidden",
                        isSelected
                          ? "border-[#8A6B37] ring-2 ring-[#8A6B37]/30"
                          : "border-gray-300 hover:border-gray-400",
                        isOutOfStock && "opacity-50 cursor-not-allowed"
                      )}
                      title={val.value}
                    >
                      {/* Inner content */}
                      <div className="absolute inset-1 rounded-full overflow-hidden bg-gray-100">
                        {val.image_url ? (
                          <img
                            src={resolveStorefrontAssetUrl(val.image_url)}
                            alt={val.value}
                            className="w-full h-full object-cover"
                          />
                        ) : val.color_code ? (
                          <div
                            className="w-full h-full"
                            style={{ backgroundColor: val.color_code }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs font-medium text-gray-600">
                            {val.value?.slice(0, 2)}
                          </div>
                        )}
                      </div>

                      {/* Selected indicator - border only */}
                      {isSelected && (
                        <div className="absolute inset-0 rounded-full border-2 border-[#8A6B37]" />
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              // TEXT BUTTONS
              <div className="flex flex-wrap gap-2">
                {group.values.map((val, idx) => {
                  const isSelected = selectedValue === val.value;
                  const variant = variants[val.variantIndex];
                  const isOutOfStock = variant?.stock <= 0;

                  return (
                    <button
                      key={idx}
                      onClick={() => !isOutOfStock && handleSelect(attrId, val.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "relative px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 border",
                        isSelected
                          ? "bg-[#8A6B37] text-white border-[#8A6B37]"
                          : isOutOfStock
                          ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                          : "bg-white text-[#8A6B37] border-gray-300 hover:border-[#8A6B37]"
                      )}
                    >
                      {isSelected && <Check className="w-4 h-4 inline mr-1" />}
                      {val.value}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Selected info removed */}
    </div>
  );
}
