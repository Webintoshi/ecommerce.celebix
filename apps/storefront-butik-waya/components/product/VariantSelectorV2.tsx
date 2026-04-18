"use client";

import { useEffect, useState } from "react";
import { resolveStorefrontAssetUrl } from "@/lib/asset-url";
import {
  getOrderedVariantAttributeGroups,
  normalizeVariantAttributeEntries,
} from "@/lib/variant-selection";
import { cn } from "@/lib/utils";

interface Props {
  variants: any[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

function getAttributeId(attribute: any) {
  return (
    attribute?.attribute?.id ||
    attribute?.attribute_id ||
    attribute?.attributeId ||
    attribute?.name
  );
}

function getVariantAttributes(variant: any) {
  const directAttributes = normalizeVariantAttributeEntries(variant?.attributes);

  if (directAttributes.length > 0) {
    return directAttributes;
  }

  return normalizeVariantAttributeEntries(variant?.raw_attributes);
}

function hasStock(variant: any) {
  return Number(variant?.stock ?? 0) > 0;
}

export function VariantSelectorV2({ variants, selectedIndex, onSelect }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !Array.isArray(variants) || variants.length === 0) {
    return null;
  }

  const currentVariant = variants[selectedIndex] || variants[0];
  if (!currentVariant) {
    return null;
  }

  const attributeGroups = getOrderedVariantAttributeGroups(variants);

  if (attributeGroups.length === 0) {
    return null;
  }

  const isVisualGroup = (
    name: string,
    values: Array<{ image_url?: string | null; color_code?: string | null }>,
  ) => {
    const lower = name.toLowerCase();
    const nameSuggestsVisual =
      lower.includes("renk") || lower.includes("color") || lower.includes("rengi");

    return nameSuggestsVisual || values.some((value) => value.image_url || value.color_code);
  };

  const getSelectedValue = (attributeId: string, variant: any = currentVariant) => {
    const attributes = getVariantAttributes(variant);
    const match = attributes.find(
      (attribute: any) => getAttributeId(attribute) === attributeId,
    );

    return match?.value;
  };

  const getSelectionMap = (variant: any) => {
    return getVariantAttributes(variant).reduce<Record<string, string>>(
      (accumulator, attribute: any) => {
        const attributeId = getAttributeId(attribute);
        if (attributeId && typeof attribute.value === "string") {
          accumulator[attributeId] = attribute.value;
        }

        return accumulator;
      },
      {},
    );
  };

  const variantMatchesSelection = (variant: any, selections: Record<string, string>) => {
    const variantSelectionMap = getSelectionMap(variant);

    return Object.entries(selections).every(
      ([attributeId, value]) => variantSelectionMap[attributeId] === value,
    );
  };

  const getCandidateIndex = (attributeId: string, value: string) => {
    const targetSelection = {
      ...getSelectionMap(currentVariant),
      [attributeId]: value,
    };

    const exactInStockIndex = variants.findIndex(
      (variant) => hasStock(variant) && variantMatchesSelection(variant, targetSelection),
    );
    if (exactInStockIndex !== -1) {
      return exactInStockIndex;
    }

    const exactIndex = variants.findIndex((variant) =>
      variantMatchesSelection(variant, targetSelection),
    );
    if (exactIndex !== -1) {
      return exactIndex;
    }

    const relaxedInStockIndex = variants.findIndex(
      (variant) => hasStock(variant) && getSelectedValue(attributeId, variant) === value,
    );
    if (relaxedInStockIndex !== -1) {
      return relaxedInStockIndex;
    }

    return variants.findIndex(
      (variant) => getSelectedValue(attributeId, variant) === value,
    );
  };

  const handleSelect = (attributeId: string, value: string) => {
    const nextIndex = getCandidateIndex(attributeId, value);
    if (nextIndex !== -1) {
      onSelect(nextIndex);
    }
  };

  const isLowStock =
    Number(currentVariant?.stock ?? 0) > 0 && Number(currentVariant?.stock ?? 0) <= 5;

  return (
    <div className="space-y-6">
      {attributeGroups.map((group) => {
        const selectedValue = getSelectedValue(group.id);
        const showVisualSelector = isVisualGroup(group.name, group.values);

        return (
          <div key={group.id} className="space-y-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.22em] text-[#7A736D]">
                {group.name}
              </span>
              {selectedValue ? (
                <span className="text-sm text-[#222222]">{selectedValue}</span>
              ) : null}
            </div>

            {showVisualSelector ? (
              <div className="flex flex-wrap gap-3">
                {group.values.map((value) => {
                  const candidateIndex = getCandidateIndex(group.id, value.value);
                  const previewVariant =
                    candidateIndex !== -1 ? variants[candidateIndex] : variants[value.variantIndex];
                  const isSelected = selectedValue === value.value;
                  const isOutOfStock = !previewVariant || !hasStock(previewVariant);

                  return (
                    <button
                      key={value.key}
                      type="button"
                      onClick={() => !isOutOfStock && handleSelect(group.id, value.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "group relative w-[4.5rem] overflow-hidden rounded-[0.9rem] transition-all duration-200",
                        isSelected
                          ? "ring-1 ring-[#222222]"
                          : "hover:ring-1 hover:ring-[rgba(26,26,26,0.18)]",
                        isOutOfStock && "cursor-not-allowed opacity-45",
                      )}
                      title={value.value}
                    >
                      <span
                        className={cn(
                          "absolute inset-0 rounded-[0.9rem] border",
                          isSelected
                            ? "border-[#222222]"
                            : "border-[rgba(26,26,26,0.12)]",
                        )}
                      />
                      <span className="relative block aspect-[3/4] overflow-hidden rounded-[0.85rem] bg-[#F7F4F1]">
                        {value.image_url ? (
                          <img
                            src={resolveStorefrontAssetUrl(value.image_url)}
                            alt={value.value}
                            className="h-full w-full object-cover"
                          />
                        ) : value.color_code ? (
                          <span
                            className="block h-full w-full"
                            style={{ backgroundColor: value.color_code }}
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.16em] text-[#222222]">
                            {value.value.slice(0, 2)}
                          </span>
                        )}
                        {isOutOfStock ? (
                          <span className="absolute inset-x-2 top-1/2 h-px -rotate-45 bg-[#222222]/70" />
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                {group.values.map((value) => {
                  const candidateIndex = getCandidateIndex(group.id, value.value);
                  const previewVariant =
                    candidateIndex !== -1 ? variants[candidateIndex] : variants[value.variantIndex];
                  const isSelected = selectedValue === value.value;
                  const isOutOfStock = !previewVariant || !hasStock(previewVariant);

                  return (
                    <button
                      key={value.key}
                      type="button"
                      onClick={() => !isOutOfStock && handleSelect(group.id, value.value)}
                      disabled={isOutOfStock}
                      className={cn(
                        "relative flex min-h-[54px] items-center justify-center overflow-hidden rounded-[0.9rem] border px-4 py-3 text-sm transition-all duration-200",
                        isSelected
                          ? "border-[#171311] bg-[#171311] text-white"
                          : isOutOfStock
                            ? "cursor-not-allowed border-[rgba(26,26,26,0.08)] bg-[#F8F6F3] text-[#9A928A]"
                            : "border-[rgba(26,26,26,0.12)] bg-white text-[#222222] hover:border-[#171311]",
                      )}
                    >
                      <span className="truncate">{value.value}</span>
                      {isOutOfStock ? (
                        <span className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 rotate-[-8deg] bg-current opacity-60" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {isLowStock ? (
        <p className="text-[12px] leading-6 text-[#A0651B]">
          Secili varyantta stok sinirli. Hemen seciminizi tamamlayin.
        </p>
      ) : null}
    </div>
  );
}
