"use client";

import { useMemo, useState } from "react";
import { Layers3, Plus, Search, X } from "lucide-react";

import { buildGeneratedSku } from "@/lib/sku";
import { cn } from "@/lib/utils";
import type { AdminVariantOptionDraft } from "@/types/admin-product-wizard";
import type { ProductVariant } from "@/types/product";

type VariantOptionBuilderProps = {
  options: AdminVariantOptionDraft[];
  variants: ProductVariant[];
  defaultPrice: number;
  defaultStock: number;
  defaultWeight?: number;
  defaultUnit?: ProductVariant["unit"];
  errors: Record<string, string>;
  onOptionsChange: (options: AdminVariantOptionDraft[]) => void;
  onVariantsChange: (variants: ProductVariant[]) => void;
};

type Combination = {
  label: string;
  values: string[];
};

const MAX_OPTIONS = 3;
const MAX_VALUES_PER_OPTION = 12;
const MAX_COMBINATIONS = 80;

function createDraftOption(): AdminVariantOptionDraft {
  return {
    id: `option-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    values: [],
  };
}

function getUsableOptions(options: AdminVariantOptionDraft[]) {
  return options
    .map((option) => ({
      ...option,
      name: option.name.trim(),
      values: option.values.map((value) => value.trim()).filter(Boolean),
    }))
    .filter((option) => option.name && option.values.length > 0);
}

function buildCombinations(options: AdminVariantOptionDraft[]): Combination[] {
  const usableOptions = getUsableOptions(options);
  if (usableOptions.length === 0) {
    return [];
  }

  const combinations = usableOptions.reduce<Combination[]>(
    (acc, option) =>
      acc.flatMap((combo) =>
        option.values.map((value) => ({
          values: [...combo.values, value],
          label: [...combo.values, value].join(" / "),
        })),
      ),
    [{ label: "", values: [] }],
  );

  return combinations.slice(0, MAX_COMBINATIONS);
}

function rebuildVariantsFromOptions(
  nextOptions: AdminVariantOptionDraft[],
  currentVariants: ProductVariant[],
  defaultPrice: number,
  defaultStock: number,
  defaultWeight = 0,
  defaultUnit: ProductVariant["unit"] = "adet",
) {
  const combinations = buildCombinations(nextOptions);
  if (combinations.length === 0) {
    return currentVariants;
  }

  const currentByName = new Map(currentVariants.map((variant) => [variant.name, variant]));

  return combinations.map((combo, index) => {
    const existing = currentByName.get(combo.label);
    return {
      id: existing?.id || `variant-${Date.now()}-${index}`,
      name: combo.label,
      weight: existing?.weight || defaultWeight,
      price: Number(existing?.price ?? defaultPrice) || 0,
      originalPrice: existing?.originalPrice,
      cost: existing?.cost,
      stock: Number(existing?.stock ?? defaultStock) || 0,
      sku: existing?.sku || buildGeneratedSku({ context: combo.label, index }),
      barcode: existing?.barcode,
      groupName: getUsableOptions(nextOptions)[0]?.name || "Varyasyon",
      unit: existing?.unit || defaultUnit,
      images: existing?.images || [],
      isEnabled: existing?.isEnabled !== false,
      maxPurchaseQuantity: existing?.maxPurchaseQuantity,
      warehouseLocation: existing?.warehouseLocation,
    } satisfies ProductVariant;
  });
}

export function VariantOptionBuilder({
  options,
  variants,
  defaultPrice,
  defaultStock,
  defaultWeight = 0,
  defaultUnit = "adet",
  errors,
  onOptionsChange,
  onVariantsChange,
}: VariantOptionBuilderProps) {
  const [valueInputs, setValueInputs] = useState<Record<string, string>>({});
  const [bulkPrice, setBulkPrice] = useState("");
  const [bulkStock, setBulkStock] = useState("");
  const combinations = useMemo(() => buildCombinations(options), [options]);

  const syncOptions = (nextOptions: AdminVariantOptionDraft[]) => {
    onOptionsChange(nextOptions);
    onVariantsChange(rebuildVariantsFromOptions(nextOptions, variants, defaultPrice, defaultStock, defaultWeight, defaultUnit));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) {
      return;
    }
    syncOptions([...options, createDraftOption()]);
  };

  const updateOptionName = (optionId: string, name: string) => {
    syncOptions(options.map((option) => (option.id === optionId ? { ...option, name } : option)));
  };

  const removeOption = (optionId: string) => {
    syncOptions(options.filter((option) => option.id !== optionId));
  };

  const addOptionValue = (optionId: string) => {
    const rawValue = valueInputs[optionId]?.trim();
    if (!rawValue) {
      return;
    }

    const nextOptions = options.map((option) => {
      if (option.id !== optionId) {
        return option;
      }

      const nextValues = rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .reduce<string[]>((acc, value) => {
          if (!acc.includes(value) && !option.values.includes(value) && acc.length + option.values.length < MAX_VALUES_PER_OPTION) {
            acc.push(value);
          }
          return acc;
        }, []);

      return { ...option, values: [...option.values, ...nextValues] };
    });

    setValueInputs((current) => ({ ...current, [optionId]: "" }));
    syncOptions(nextOptions);
  };

  const removeOptionValue = (optionId: string, value: string) => {
    syncOptions(
      options.map((option) =>
        option.id === optionId
          ? { ...option, values: option.values.filter((entry) => entry !== value) }
          : option,
      ),
    );
  };

  const updateVariant = (variantName: string, updates: Partial<ProductVariant>) => {
    onVariantsChange(
      variants.map((variant) =>
        variant.name === variantName ? { ...variant, ...updates } : variant,
      ),
    );
  };

  const applyBulkPrice = () => {
    const parsedPrice = Number(bulkPrice);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return;
    }
    onVariantsChange(variants.map((variant) => ({ ...variant, price: parsedPrice })));
  };

  const applyBulkStock = () => {
    const parsedStock = Number.parseInt(bulkStock, 10);
    if (!Number.isFinite(parsedStock) || parsedStock < 0) {
      return;
    }
    onVariantsChange(variants.map((variant) => ({ ...variant, stock: parsedStock })));
  };

  return (
    <section className="space-y-5 rounded-[8px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.05)] md:p-6">
      <div className="flex flex-col gap-3 border-b border-[var(--admin-border)] pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--admin-accent)] text-white">
            <Layers3 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-stone-950">Varyasyon seçenekleri</h2>
            <p className="text-sm text-stone-500">Seçenek ve değerleri girin; varyant satırları otomatik oluşsun.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={addOption}
          disabled={options.length >= MAX_OPTIONS}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-stone-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--admin-accent)] disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          <Plus className="h-4 w-4" />
          Seçenek ekle
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {options.map((option, optionIndex) => (
          <div key={option.id} className="space-y-4 rounded-[8px] border border-[#E7EAF0] bg-[#FCFDFE] p-4">
            <div className="flex items-start justify-between gap-3">
              <label className="flex-1 space-y-2">
                <span className="text-sm font-semibold text-stone-700">Seçenek adı</span>
                <input
                  type="text"
                  value={option.name}
                  onChange={(event) => updateOptionName(option.id, event.target.value)}
                  placeholder={optionIndex === 0 ? "Kapasite" : "Voltaj"}
                  className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-white px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                />
              </label>
              {options.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeOption(option.id)}
                  className="mt-7 inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-rose-200 bg-white text-rose-500 transition-colors hover:bg-rose-50"
                  aria-label={`${option.name || "Seçenek"} sil`}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="space-y-2">
              <span className="text-sm font-semibold text-stone-700">Değerler</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={valueInputs[option.id] || ""}
                  onChange={(event) =>
                    setValueInputs((current) => ({ ...current, [option.id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addOptionValue(option.id);
                    }
                  }}
                  placeholder={optionIndex === 0 ? "60Ah, 72Ah" : "12V"}
                  className="h-11 flex-1 rounded-[8px] border border-[#e8dbcf] bg-white px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                />
                <button
                  type="button"
                  onClick={() => addOptionValue(option.id)}
                  className="h-11 rounded-[8px] bg-[var(--admin-accent)] px-4 text-sm font-semibold text-white"
                >
                  Ekle
                </button>
              </div>
              {option.values.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {option.values.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => removeOptionValue(option.id, value)}
                      className="rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--admin-accent-hover)]"
                    >
                      {value} ×
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-stone-500">Enter veya virgül ile değer ekleyebilirsiniz.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {errors.variantOptions ? (
        <div className="rounded-[8px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
          {errors.variantOptions}
        </div>
      ) : null}

      <div className="rounded-[8px] border border-[#E7EAF0] bg-[#FCFDFE]">
        <div className="flex flex-col gap-3 border-b border-[#E7EAF0] p-4 min-[1025px]:flex-row min-[1025px]:items-center min-[1025px]:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--admin-accent-hover)]">
              Varyant matrix
            </h3>
            <p className="mt-1 text-sm text-stone-500">
              {combinations.length > 0
                ? `${combinations.length} kombinasyon üretildi.`
                : "Seçenek adı ve en az bir değer girildiğinde tablo oluşur."}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="flex overflow-hidden rounded-[8px] border border-[#E7EAF0] bg-white">
              <input
                type="number"
                min={0}
                step="0.01"
                value={bulkPrice}
                onChange={(event) => setBulkPrice(event.target.value)}
                placeholder="Toplu fiyat"
                className="h-10 w-28 px-3 text-sm outline-none"
              />
              <button type="button" onClick={applyBulkPrice} className="border-l border-[#E7EAF0] px-3 text-xs font-semibold text-stone-700">
                Uygula
              </button>
            </div>
            <div className="flex overflow-hidden rounded-[8px] border border-[#E7EAF0] bg-white">
              <input
                type="number"
                min={0}
                step={1}
                value={bulkStock}
                onChange={(event) => setBulkStock(event.target.value)}
                placeholder="Toplu stok"
                className="h-10 w-28 px-3 text-sm outline-none"
              />
              <button type="button" onClick={applyBulkStock} className="border-l border-[#E7EAF0] px-3 text-xs font-semibold text-stone-700">
                Uygula
              </button>
            </div>
          </div>
        </div>

        {combinations.length > 0 ? (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#E7EAF0] bg-white text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                  <th className="px-4 py-3">Kullan</th>
                  <th className="px-4 py-3">Varyant</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Fiyat</th>
                  <th className="px-4 py-3">Stok</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => (
                  <tr
                    key={variant.name}
                    className={cn(
                      "border-b border-[#EEF1F4] bg-white",
                      variant.isEnabled === false && "opacity-50",
                    )}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={variant.isEnabled !== false}
                        onChange={(event) => updateVariant(variant.name, { isEnabled: event.target.checked })}
                        aria-label={`${variant.name} varyantını kullan`}
                        className="h-4 w-4 rounded border-[#D1D5DB] accent-[#FF6A00]"
                      />
                    </td>
                    <td className="min-w-[180px] px-4 py-3 font-semibold text-stone-900">{variant.name}</td>
                    <td className="min-w-[190px] px-4 py-3">
                      <input
                        type="text"
                        value={variant.sku}
                        onChange={(event) => updateVariant(variant.name, { sku: event.target.value })}
                        className="h-10 w-full rounded-[8px] border border-[#E7EAF0] bg-[#FCFDFE] px-3 font-mono text-xs outline-none focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                      />
                    </td>
                    <td className="min-w-[150px] px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={variant.price || ""}
                        onChange={(event) => updateVariant(variant.name, { price: Number(event.target.value) || 0 })}
                        className="h-10 w-full rounded-[8px] border border-[#E7EAF0] bg-[#FCFDFE] px-3 text-sm outline-none focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                      />
                    </td>
                    <td className="min-w-[130px] px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={variant.stock}
                        onChange={(event) => updateVariant(variant.name, { stock: Number.parseInt(event.target.value, 10) || 0 })}
                        className="h-10 w-full rounded-[8px] border border-[#E7EAF0] bg-[#FCFDFE] px-3 text-sm outline-none focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex min-h-44 items-center justify-center p-6 text-center">
            <div className="max-w-md space-y-2">
              <Search className="mx-auto h-6 w-6 text-stone-300" />
              <p className="text-sm font-semibold text-stone-700">Henüz matrix oluşmadı</p>
              <p className="text-sm text-stone-500">Örnek: Kapasite için 60Ah ve 72Ah, Voltaj için 12V ekleyin.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export { createDraftOption, rebuildVariantsFromOptions };
