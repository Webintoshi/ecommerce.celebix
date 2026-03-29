"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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
  
  // DEBUG: Show data structure
  const debugInfo = {
    variantCount: variants.length,
    attributeKeys: attrKeys,
    firstVariantAttrs: variants[0]?.attributes?.map((a: any) => ({
      name: a.attribute?.name || a.name,
      value: a.value,
      hasImage: !!a.image_url,
      hasColor: !!a.color_code
    }))
  };
  
  // Force debug to be visible
  const debugHtml = JSON.stringify(debugInfo, null, 2).replace(/\n/g, '<br/>').replace(/ /g, '&nbsp;');

  // DEBUG: Always show this to understand data structure
  const showDebug = true; // Force debug for troubleshooting
  
  // If no attributes found, show simple variant selector with debug
  if (attrKeys.length === 0) {
    return (
      <div className="space-y-3">
        {showDebug && (
          <div className="p-2 bg-red-100 text-xs font-mono rounded text-red-800 mb-2">
            DEBUG (NO ATTRIBUTES):<br/>
            variants.length: {variants.length}<br/>
            firstVariant: {variants[0] ? JSON.stringify({
              id: variants[0].id,
              name: variants[0].name,
              hasAttributes: !!variants[0].attributes,
              attrLength: variants[0].attributes?.length || 0
            }) : 'none'}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="font-medium text-[#7B1113]">Boyut</span>
          <span className="text-sm text-[#6b4b4c] bg-[#F3E0E1] px-3 py-1 rounded-full">
            {currentVariant?.weight}g
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {variants.map((v, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <button
                key={v.id}
                onClick={() => onSelect(idx)}
                className={cn(
                  "px-5 py-2.5 rounded-full text-sm font-medium border transition-all",
                  isSelected
                    ? "bg-[#7B1113] text-white border-[#7B1113]"
                    : "bg-white text-[#7B1113] border-gray-300 hover:border-[#7B1113]"
                )}
              >
                {isSelected && <Check className="w-4 h-4 inline mr-1" />}
                {v.name}
              </button>
            );
          })}
        </div>
      </div>
    );
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
              <span className="font-semibold text-[#7B1113] text-sm uppercase tracking-wide">
                {group.name}
              </span>
              {selectedValue && (
                <>
                  <span className="text-gray-400">—</span>
                  <span className="text-[#6b4b4c] text-sm font-medium">{selectedValue}</span>
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
                        "relative w-16 h-16 rounded-full border-2 transition-all duration-200 overflow-hidden",
                        isSelected
                          ? "border-[#7B1113] ring-2 ring-[#7B1113]/30"
                          : "border-gray-300 hover:border-gray-400",
                        isOutOfStock && "opacity-50 cursor-not-allowed"
                      )}
                      title={val.value}
                    >
                      {/* Inner content */}
                      <div className="absolute inset-1 rounded-full overflow-hidden bg-gray-100">
                        {val.image_url ? (
                          <img
                            src={val.image_url}
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
                        <div className="absolute inset-0 rounded-full border-2 border-[#7B1113]" />
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
                        "relative px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border",
                        isSelected
                          ? "bg-[#7B1113] text-white border-[#7B1113]"
                          : isOutOfStock
                          ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                          : "bg-white text-[#7B1113] border-gray-300 hover:border-[#7B1113]"
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

      {/* Selected info */}
      <p className="text-sm text-[#6b4b4c]">
        Seçilen: <span className="font-medium text-[#7B1113]">{currentVariant?.name}</span>
      </p>
    </div>
  );
}
