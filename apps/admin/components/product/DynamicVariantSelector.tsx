"use client";

import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface VariantAttributeValue {
  id: string;
  attribute_id: string;
  value: string;
  color_code?: string | null;
  image_url?: string | null;
  attribute?: {
    id: string;
    name: string;
  };
}

interface VariantWithAttributes {
  id: string;
  name: string;
  weight: string | number;
  price: number;
  originalPrice?: number;
  stock: number;
  images?: string[];
  attributes?: VariantAttributeValue[];
}

interface DynamicVariantSelectorProps {
  variants: VariantWithAttributes[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function DynamicVariantSelector({ 
  variants, 
  selectedIndex, 
  onSelect 
}: DynamicVariantSelectorProps) {
  const [attributes, setAttributes] = useState<Map<string, VariantAttributeValue[]>>(new Map());
  const [selectedAttributes, setSelectedAttributes] = useState<Map<string, string>>(new Map());

  // Group variants by their attributes
  useEffect(() => {
    const attrsMap = new Map<string, VariantAttributeValue[]>();
    
    variants.forEach((variant, idx) => {
      variant.attributes?.forEach((attr) => {
        const attrName = attr.attribute?.name || attr.attribute_id;
        if (!attrsMap.has(attrName)) {
          attrsMap.set(attrName, []);
        }
        // Avoid duplicates
        const existing = attrsMap.get(attrName)?.find(a => a.value === attr.value);
        if (!existing) {
          attrsMap.get(attrName)?.push({ ...attr, variantIndex: idx } as any);
        }
      });
    });

    setAttributes(attrsMap);

    // Initialize selected attributes based on current variant
    const currentVariant = variants[selectedIndex];
    const initialSelected = new Map<string, string>();
    currentVariant?.attributes?.forEach((attr) => {
      const attrName = attr.attribute?.name || attr.attribute_id;
      initialSelected.set(attrName, attr.value);
    });
    setSelectedAttributes(initialSelected);
  }, [variants, selectedIndex]);

  // Find variant index based on selected attributes
  const findVariantIndex = (attrName: string, value: string) => {
    const newSelected = new Map(selectedAttributes);
    newSelected.set(attrName, value);
    
    // Find variant that matches all selected attributes
    return variants.findIndex((variant) => {
      const variantAttrs = variant.attributes || [];
      return Array.from(newSelected.entries()).every(([name, val]) => {
        return variantAttrs.some((a) => {
          const aName = a.attribute?.name || a.attribute_id;
          return aName === name && a.value === val;
        });
      });
    });
  };

  const handleAttributeSelect = (attrName: string, value: string) => {
    const newIndex = findVariantIndex(attrName, value);
    if (newIndex !== -1) {
      onSelect(newIndex);
    }
  };

  // Check if attribute is a color attribute or has images
  const isColorAttribute = (attrName: string, values: VariantAttributeValue[]) => {
    const colorKeywords = ['renk', 'color', 'colour', 'rengi'];
    const nameLower = attrName.toLowerCase();
    const isColorName = colorKeywords.some(keyword => nameLower.includes(keyword));
    // Eğer değerlerden herhangi birinde görsel veya renk kodu varsa, görsel seçici göster
    const hasVisuals = values.some(v => v.color_code || v.image_url);
    return isColorName || hasVisuals;
  };

  // Eğer hiç varyant yoksa gösterme
  if (variants.length === 0) return null;

  // Eğer tek varyant varsa ve nitelik yoksa, sadece bilgi göster
  if (variants.length === 1 && attributes.size === 0) {
    const variant = variants[0];
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-medium text-[#7B1113]">Seçenek</span>
          <span className="text-sm text-[#6b4b4c] bg-[#F3E0E1] px-3 py-1 rounded-full">
            {variant.weight}g
          </span>
        </div>
        <div className="flex items-center gap-2 p-3 bg-[#F3E0E1]/50 rounded-xl border border-[#7B1113]/10">
          <span className="font-medium text-[#7B1113]">{variant.name}</span>
          {variant.stock <= 5 && variant.stock > 0 && (
            <span className="text-xs text-amber-600">(Son {variant.stock} adet!)</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dynamic Attribute Groups */}
      {Array.from(attributes.entries()).map(([attrName, values]) => {
        const isColor = isColorAttribute(attrName, values);
        const selectedValue = selectedAttributes.get(attrName);

        return (
          <div key={attrName} className="space-y-3">
            {/* Header: Nitelik Adı - Seçili Değer */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-[#7B1113] uppercase tracking-wide">{attrName}</span>
              <span className="text-gray-400">—</span>
              <span className="text-[#6b4b4c]">{selectedValue}</span>
            </div>

            {isColor || values.some(v => v.image_url) ? (
              // Color/Image Selector - Circular Style (Example Image Style)
              <div className="flex flex-wrap gap-3">
                {values.map((value, idx) => {
                  const isSelected = selectedValue === value.value;
                  const variantIndex = (value as any).variantIndex;
                  const isOutOfStock = variants[variantIndex]?.stock <= 0;

                  return (
                    <button
                      key={`${value.id}-${idx}`}
                      onClick={() => !isOutOfStock && handleAttributeSelect(attrName, value.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "relative w-14 h-14 rounded-full border-2 transition-all duration-200 overflow-hidden flex items-center justify-center",
                        isSelected
                          ? "border-[#7B1113] ring-2 ring-[#7B1113]/30" 
                          : "border-gray-300 hover:border-gray-400",
                        isOutOfStock && "opacity-50 cursor-not-allowed"
                      )}
                      title={value.value}
                    >
                      {/* Inner circle with image or color */}
                      <div className={cn(
                        "w-12 h-12 rounded-full overflow-hidden",
                        isSelected ? "ring-2 ring-white" : ""
                      )}>
                        {value.image_url ? (
                          <img
                            src={value.image_url}
                            alt={value.value}
                            className="w-full h-full object-cover"
                          />
                        ) : value.color_code ? (
                          <span
                            className="w-full h-full block"
                            style={{ backgroundColor: value.color_code }}
                          />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-xs font-medium text-gray-600 bg-gray-100">
                            {value.value.slice(0, 2)}
                          </span>
                        )}
                      </div>

                      {/* Selected indicator - border only */}
                      {isSelected && (
                        <div className="absolute inset-0 rounded-full border-2 border-[#7B1113]" />
                      )}

                      {/* Out of stock X */}
                      {isOutOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-full">
                          <X className="w-6 h-6 text-gray-500" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              // Text/Button Selector (Pill style)
              <div className="flex flex-wrap gap-2">
                {values.map((value, idx) => {
                  const isSelected = selectedValue === value.value;
                  const variantIndex = (value as any).variantIndex;
                  const isOutOfStock = variants[variantIndex]?.stock <= 0;

                  return (
                    <button
                      key={`${value.id}-${idx}`}
                      onClick={() => !isOutOfStock && handleAttributeSelect(attrName, value.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "relative px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border",
                        isSelected
                          ? "bg-[#7B1113] text-white border-[#7B1113] shadow-md"
                          : isOutOfStock
                            ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                            : "bg-white text-[#7B1113] border-gray-300 hover:border-[#7B1113]"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {isSelected && <Check className="w-4 h-4" />}
                        {value.value}
                      </span>

                      {/* Out of stock badge */}
                      {isOutOfStock && (
                        <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gray-400 text-white text-[10px] rounded-full whitespace-nowrap">
                          Tükendi
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Fallback: Simple variant selector if no attributes but multiple variants */}
      {attributes.size === 0 && variants.length > 1 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-[#7B1113]">Boyut Seçin</span>
            <span className="text-sm text-[#6b4b4c] bg-[#F3E0E1] px-3 py-1 rounded-full">
              {variants[selectedIndex]?.weight}g
            </span>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {variants.map((variant, index) => {
              const isSelected = index === selectedIndex;
              const isOutOfStock = variant.stock <= 0;

              return (
                <button
                  key={variant.id}
                  onClick={() => !isOutOfStock && onSelect(index)}
                  disabled={isOutOfStock}
                  className={cn(
                    "relative px-5 py-3 rounded-full text-sm font-medium transition-all duration-200 border",
                    isSelected
                      ? "bg-[#7B1113] text-white border-[#7B1113] shadow-md"
                      : isOutOfStock
                        ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-white text-[#7B1113] border-gray-300 hover:border-[#7B1113]"
                  )}
                >
                  <span className="flex items-center gap-2">
                    {isSelected && <Check className="w-4 h-4" />}
                    <span>{variant.name}</span>
                    {variant.originalPrice && variant.price < variant.originalPrice && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full",
                        isSelected ? "bg-white/20" : "bg-red-100 text-red-600"
                      )}>
                        %{Math.round((1 - variant.price / variant.originalPrice) * 100)}
                      </span>
                    )}
                  </span>

                  {variant.stock > 0 && variant.stock <= 5 && !isSelected && (
                    <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
                  )}

                  {isOutOfStock && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-gray-400 text-white text-[10px] rounded-full whitespace-nowrap">
                      Tükendi
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Selected Variant Info */}
      {variants[selectedIndex] && (
        <p className="text-sm text-[#6b4b4c]">
          Seçilen: <span className="font-medium text-[#7B1113]">{variants[selectedIndex].name}</span>
          {variants[selectedIndex].stock > 0 && variants[selectedIndex].stock <= 5 && (
            <span className="text-amber-600 ml-2">(Son {variants[selectedIndex].stock} adet!)</span>
          )}
        </p>
      )}
    </div>
  );
}
