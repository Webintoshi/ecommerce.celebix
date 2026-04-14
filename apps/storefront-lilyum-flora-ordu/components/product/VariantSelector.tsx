"use client";

import { Check } from "lucide-react";
import { ProductVariant } from "@/types/product";

interface VariantSelectorProps {
  variants: ProductVariant[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function VariantSelector({ variants, selectedIndex, onSelect }: VariantSelectorProps) {
  if (variants.length <= 1) return null;

  const selectedVariant = variants[selectedIndex];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-medium text-[#7B1113]">Boyut Seçin</span>
        <span className="text-sm text-[#6b4b4c] bg-[#F3E0E1] px-3 py-1 rounded-full">
          {selectedVariant?.weight}g
        </span>
      </div>
      
      <div className="flex flex-wrap gap-3">
        {variants.map((variant, index) => {
          const isSelected = index === selectedIndex;
          const isOutOfStock = variant.stock <= 0;
          
          return (
            <button
              key={variant.id}
              onClick={() => !isOutOfStock && onSelect(index)}
              disabled={isOutOfStock}
              className={`
                relative px-5 py-3 rounded-xl text-sm font-medium
                transition-all duration-200 border-2
                ${isSelected 
                  ? "bg-[#7B1113] text-white border-[#7B1113] shadow-lg shadow-[#7B1113]/25" 
                  : isOutOfStock
                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                    : "bg-white text-[#7B1113] border-[#7B1113]/20 hover:border-[#7B1113]/50"
                }
              `}
            >
              <span className="flex items-center gap-2">
                {isSelected && <Check className="w-4 h-4" />}
                <span>{variant.name}</span>
                {variant.originalPrice && variant.price < variant.originalPrice && (
                  <span className={`
                    text-xs px-2 py-0.5 rounded-full
                    ${isSelected ? "bg-white/20" : "bg-red-100 text-red-600"}
                  `}>
                    %{Math.round((1 - variant.price / variant.originalPrice) * 100)}
                  </span>
                )}
              </span>
              
              {/* Low stock indicator */}
              {variant.stock > 0 && variant.stock <= 5 && !isSelected && (
                <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white" />
              )}
              
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
      
      {/* Variant Info */}
      <p className="text-sm text-[#6b4b4c]">
        Seçilen: <span className="font-medium text-[#7B1113]">{selectedVariant?.name}</span>
        {selectedVariant?.stock > 0 && selectedVariant?.stock <= 5 && (
          <span className="text-amber-600 ml-2">(Son {selectedVariant.stock} adet!)</span>
        )}
      </p>
    </div>
  );
}
