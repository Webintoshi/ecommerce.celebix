"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { getOrderedVariantAttributeGroups } from "@/lib/variant-selection";
import { cn } from "@/lib/utils";

interface Props {
  variants: any[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function getAttributeId(attribute: any) {
  return attribute?.attribute?.id || attribute?.attribute_id || attribute?.attributeId || attribute?.name;
}

function getVariantAttributes(variant: any) {
  const directAttributes = Array.isArray(variant?.attributes)
    ? variant.attributes.filter(
        (attribute: any) =>
          attribute &&
          typeof attribute === "object" &&
          typeof attribute.value === "string" &&
          attribute.value.trim().length > 0,
      )
    : [];

  if (directAttributes.length > 0) {
    return directAttributes;
  }

  return Array.isArray(variant?.raw_attributes)
    ? variant.raw_attributes.filter(
        (attribute: any) =>
          attribute &&
          typeof attribute === "object" &&
          typeof attribute.value === "string" &&
          attribute.value.trim().length > 0,
      )
    : [];
}

export function VariantSelectorV2({ variants, selectedIndex, onSelect }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  const currentVariant = variants[selectedIndex];
  const attributeGroups = getOrderedVariantAttributeGroups(variants);

  if (attributeGroups.length === 0) {
    return null;
  }

  const isColor = (name: string, values: Array<{ image_url?: string | null; color_code?: string | null }>) => {
    const lower = name.toLowerCase();
    const isColorName = lower.includes("renk") || lower.includes("color") || lower.includes("rengi");
    return isColorName || values.some((value) => value.image_url || value.color_code);
  };

  const getSelectedValue = (attributeId: string, variant: any = currentVariant) => {
    const attributes = getVariantAttributes(variant);
    const match = attributes.find((attribute: any) => getAttributeId(attribute) === attributeId);
    return match?.value;
  };

  const getSelectionMap = (variant: any) => {
    return getVariantAttributes(variant).reduce<Record<string, string>>((accumulator, attribute: any) => {
      const attributeId = getAttributeId(attribute);
      if (attributeId && typeof attribute.value === "string") {
        accumulator[attributeId] = attribute.value;
      }

      return accumulator;
    }, {});
  };

  const variantMatchesSelection = (variant: any, selections: Record<string, string>) => {
    const variantSelectionMap = getSelectionMap(variant);

    return Object.entries(selections).every(
      ([attributeId, value]) => variantSelectionMap[attributeId] === value,
    );
  };

  const handleSelect = (attributeId: string, value: string) => {
    const targetSelection = {
      ...getSelectionMap(currentVariant),
      [attributeId]: value,
    };

    const nextIndex = variants.findIndex((variant) =>
      variantMatchesSelection(variant, targetSelection),
    );

    const fallbackIndex =
      nextIndex !== -1
        ? nextIndex
        : variants.findIndex((variant) => getSelectedValue(attributeId, variant) === value);

    if (fallbackIndex !== -1) {
      onSelect(fallbackIndex);
    }
  };

  return (
    <div className="space-y-6">
      {attributeGroups.map((group) => {
        const selectedValue = getSelectedValue(group.id);
        const showVisualSelector = isColor(group.name, group.values);

        return (
          <div key={group.id} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-900">
                {group.name}
              </span>
              {selectedValue ? (
                <>
                  <span className="text-gray-400">-</span>
                  <span className="text-sm font-medium text-neutral-500">{selectedValue}</span>
                </>
              ) : null}
            </div>

            {showVisualSelector ? (
              <div className="flex flex-wrap gap-2.5">
                {group.values.map((value) => {
                  const isSelected = selectedValue === value.value;
                  const variant = variants[value.variantIndex];
                  const isOutOfStock = Number(variant?.stock ?? 0) <= 0;

                  return (
                    <button
                      key={value.key}
                      type="button"
                      onClick={() => !isOutOfStock && handleSelect(group.id, value.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "relative h-11 w-11 overflow-hidden rounded-full border-2 transition-all duration-200",
                        isSelected
                          ? "border-[#171311] ring-2 ring-[#171311]/10"
                          : "border-gray-300 hover:border-gray-400",
                        isOutOfStock && "cursor-not-allowed opacity-50",
                      )}
                      title={value.value}
                    >
                      <div className="absolute inset-1 overflow-hidden rounded-full bg-gray-100">
                        {value.image_url ? (
                          <img
                            src={resolveStorefrontAssetUrl(value.image_url)}
                            alt={value.value}
                            className="h-full w-full object-cover"
                          />
                        ) : value.color_code ? (
                          <div className="h-full w-full" style={{ backgroundColor: value.color_code }} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-xs font-medium text-gray-600">
                            {value.value.slice(0, 2)}
                          </div>
                        )}
                      </div>
                      {isSelected ? <div className="absolute inset-0 rounded-full border-2 border-[#171311]" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.values.map((value) => {
                  const isSelected = selectedValue === value.value;
                  const variant = variants[value.variantIndex];
                  const isOutOfStock = Number(variant?.stock ?? 0) <= 0;

                  return (
                    <button
                      key={value.key}
                      type="button"
                      onClick={() => !isOutOfStock && handleSelect(group.id, value.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "relative rounded-full border px-4 py-2 text-xs font-medium transition-all duration-200",
                        isSelected
                          ? "border-[#171311] bg-[#171311] text-white"
                          : isOutOfStock
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                            : "border-gray-300 bg-white text-[#222222] hover:border-[#222222]",
                      )}
                    >
                      {isSelected ? <Check className="mr-1 inline h-4 w-4" /> : null}
                      {value.value}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
