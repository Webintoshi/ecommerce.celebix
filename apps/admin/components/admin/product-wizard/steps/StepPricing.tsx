"use client";

import { useState, useEffect } from "react";
import { Tag, Plus, X, Percent, Calculator, Package, ChevronDown, Palette, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductVariant, DiscountRule, TaxRate, ProductImage } from "@/types/product";
import { VariantAttribute, VariantAttributeValue } from "@/types/variant-attributes";
import { buildGeneratedSku } from "@/lib/sku";
import { toast } from "sonner";

interface StepPricingProps {
  variants: ProductVariant[];
  taxRate: TaxRate;
  discountRules: DiscountRule[];
  productImages: ProductImage[];
  onVariantsChange: (variants: ProductVariant[]) => void;
  onTaxRateChange: (taxRate: TaxRate) => void;
  onDiscountRulesChange: (rules: DiscountRule[]) => void;
  errors: Record<string, string>;
}

// Varyant için nitelik seçimi
interface VariantAttributeSelection {
  attributeId: string;
  attributeName: string;
  valueId: string;
  value: string;
  colorCode?: string | null;
  imageUrl?: string | null;
}

export function StepPricing({
  variants,
  taxRate,
  discountRules,
  productImages,
  onVariantsChange,
  onTaxRateChange,
  onDiscountRulesChange,
  errors,
}: StepPricingProps) {
  const [activeVariant, setActiveVariant] = useState<number | null>(0);
  const [attributes, setAttributes] = useState<VariantAttribute[]>([]);
  const [loadingAttributes, setLoadingAttributes] = useState(true);
  const [showNewAttributeForm, setShowNewAttributeForm] = useState<string | null>(null);
  const [newAttributeValue, setNewAttributeValue] = useState("");

  // Nitelikleri yükle
  useEffect(() => {
    fetchAttributes();
  }, []);

  const fetchAttributes = async () => {
    try {
      setLoadingAttributes(true);
      const response = await fetch("/api/admin/variant-attributes?withValues=true");
      const data = await response.json();
      if (data.success) {
        setAttributes(data.attributes);
      }
    } catch (error) {
      console.error("Error fetching attributes:", error);
    } finally {
      setLoadingAttributes(false);
    }
  };

  const addVariant = () => {
    const newVariant: ProductVariant = {
      id: `variant-${Date.now()}`,
      name: `${variants.length + 1}. Varyant`,
      weight: 0,
      price: 0,
      stock: 50,
      sku: buildGeneratedSku(),
      unit: "adet",
    };
    onVariantsChange([...variants, newVariant]);
    setActiveVariant(variants.length);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 1) {
      toast.error("En az bir varyant olmalı");
      return;
    }
    const newVariants = variants.filter((_, i) => i !== index);
    onVariantsChange(newVariants);
    if (activeVariant === index) {
      setActiveVariant(0);
    }
  };

  const updateVariant = (index: number, field: keyof ProductVariant, value: any) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    onVariantsChange(newVariants);
  };

  // Nitelik ekle/çıkar
  const toggleVariantAttribute = (
    variantIndex: number,
    attributeId: string,
    valueId: string
  ) => {
    const variant = variants[variantIndex];
    const currentAttributes: VariantAttributeSelection[] =
      (variant as any).attributes || [];

    const attribute = attributes.find((a) => a.id === attributeId);
    const value = attribute?.values?.find((v) => v.id === valueId);

    if (!attribute || !value) return;

    // Aynı nitelikten başka bir değer seçiliyse, onu değiştir
    const existingIndex = currentAttributes.findIndex(
      (a) => a.attributeId === attributeId
    );

    let newAttributes: VariantAttributeSelection[];
    if (existingIndex >= 0) {
      // Mevcut değeri güncelle
      newAttributes = [...currentAttributes];
      newAttributes[existingIndex] = {
        attributeId,
        attributeName: attribute.name,
        valueId,
        value: value.value,
        colorCode: value.color_code,
        imageUrl: value.image_url,
      };
    } else {
      // Yeni nitelik ekle
      newAttributes = [
        ...currentAttributes,
        {
          attributeId,
          attributeName: attribute.name,
          valueId,
          value: value.value,
          colorCode: value.color_code,
          imageUrl: value.image_url,
        },
      ];
    }

    updateVariant(variantIndex, "attributes" as any, newAttributes);

    // Varyant adını otomatik güncelle (opsiyonel)
    const attributeNames = newAttributes.map((a) => a.value).join(" / ");
    if (attributeNames) {
      updateVariant(variantIndex, "name", attributeNames);
    }
  };

  // Nitelik kaldır
  const removeVariantAttribute = (variantIndex: number, attributeId: string) => {
    const variant = variants[variantIndex];
    const currentAttributes: VariantAttributeSelection[] =
      (variant as any).attributes || [];

    const newAttributes = currentAttributes.filter(
      (a) => a.attributeId !== attributeId
    );

    updateVariant(variantIndex, "attributes" as any, newAttributes);

    // Varyant adını güncelle
    const attributeNames = newAttributes.map((a) => a.value).join(" / ");
    updateVariant(
      variantIndex,
      "name",
      attributeNames || `${variantIndex + 1}. Varyant`
    );
  };

  // Yeni nitelik değeri ekle (anında)
  const addNewAttributeValue = async (attributeId: string) => {
    if (!newAttributeValue.trim()) return;

    try {
      const response = await fetch("/api/admin/variant-attributes/values", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attribute_id: attributeId,
          value: newAttributeValue.trim(),
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Nitelikleri yeniden yükle
        await fetchAttributes();
        // Yeni eklenen değeri seç
        if (activeVariant !== null) {
          toggleVariantAttribute(activeVariant, attributeId, data.value.id);
        }
        setNewAttributeValue("");
        setShowNewAttributeForm(null);
        toast.success("Değer eklendi");
      } else {
        toast.error(data.error || "Değer eklenemedi");
      }
    } catch (error) {
      toast.error("Değer eklenirken hata oluştu");
    }
  };

  const calculateMargin = (price: number, cost: number = 0) => {
    if (!price || price <= 0) return { margin: 0, marginPercent: 0 };
    const margin = price - cost;
    const marginPercent = ((margin / price) * 100).toFixed(1);
    return { margin, marginPercent };
  };

  const calculateWithTax = (price: number, tax: number) => {
    return (price * (1 + tax / 100)).toFixed(2);
  };

  const addDiscountRule = () => {
    const newRule: DiscountRule = {
      id: `discount-${Date.now()}`,
      name: "Yeni İndirim",
      type: "percentage",
      config: { minQty: 2, discountPercent: 10 },
      isActive: true,
    };
    onDiscountRulesChange([...discountRules, newRule]);
  };

  const removeDiscountRule = (index: number) => {
    const newRules = discountRules.filter((_, i) => i !== index);
    onDiscountRulesChange(newRules);
  };

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      {/* Section Header */}
      <div className="flex items-center gap-4 border-b border-[var(--admin-border)] pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--admin-accent)] text-white shadow-[0_14px_28px_rgba(255,106,0,0.22)]">
          <Tag className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-stone-900">Fiyatlandırma</h3>
          <p className="text-sm text-stone-500">Varyantlar, KDV ve indirim kuralları</p>
        </div>
      </div>

      {/* KDV Oranı */}
      <div className="rounded-[26px] border border-[var(--admin-border)] bg-white p-6 shadow-sm">
        <label className="mb-3 block text-sm font-semibold text-stone-700">KDV Oranı</label>
        <div className="flex items-center gap-2 flex-wrap">
          {[0, 1, 8, 10, 20].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => onTaxRateChange(rate as TaxRate)}
              className={cn(
                "rounded-2xl px-5 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25",
                taxRate === rate
                  ? "bg-[var(--admin-accent)] text-white shadow-[0_14px_28px_rgba(255,106,0,0.2)]"
                  : "border border-[var(--admin-border)] bg-white text-stone-600 hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)]"
              )}
            >
              %{rate}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-500" aria-live="polite">
          {taxRate === 0 
            ? "KDV uygulanmayacak" 
            : `Fiyatlara KDV ${taxRate}% olarak eklenecek`}
        </p>
      </div>

      {/* Variants */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-semibold text-stone-900">Varyantlar</h4>
          <button
            type="button"
            onClick={addVariant}
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(255,106,0,0.2)] transition-all hover:from-[#E45700] hover:to-[#D34D00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25"
          >
            <Plus className="w-4 h-4" />
            Varyant Ekle
          </button>
        </div>

        {/* Variant Tabs */}
        {variants.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto rounded-[24px] border border-[var(--admin-border)] bg-[#FCFDFE] p-2 pb-2">
            {variants.map((variant, index) => {
              const attrs = (variant as any).attributes || [];
              const displayName = attrs.length > 0 
                ? attrs.map((a: any) => a.value).join(" / ")
                : (variant.name || `Varyant ${index + 1}`);
              
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setActiveVariant(index)}
                  className={cn(
                    "whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25",
                    activeVariant === index
                      ? "bg-[var(--admin-accent)] text-white shadow-[0_12px_24px_rgba(255,106,0,0.18)]"
                      : "bg-white text-stone-600 hover:bg-[var(--admin-accent-soft)]"
                  )}
                >
                  {displayName}
                </button>
              );
            })}
          </div>
        )}

        {/* Active Variant Form */}
        {activeVariant !== null && variants[activeVariant] && (
          <div className="space-y-6 rounded-[28px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_16px_40px_rgba(72,36,8,0.06)] md:p-6">
            <div className="flex items-center justify-between">
              <h5 className="font-semibold text-stone-900">
                Varyant Detayları
              </h5>
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(activeVariant)}
                  className="rounded-xl p-2 text-rose-500 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                  aria-label="Aktif varyantı kaldır"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Variant Attributes Section */}
            <div className="space-y-4 rounded-[24px] border border-[var(--admin-border)] bg-[#fff9f4] p-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-[var(--admin-accent)]" />
                <span className="text-sm font-medium text-stone-700">Nitelikler</span>
                <span className="text-xs text-stone-400">(İsteğe bağlı)</span>
              </div>

              {loadingAttributes ? (
                <div className="text-sm text-gray-500">Yükleniyor...</div>
              ) : attributes.length === 0 ? (
                <div className="text-sm text-gray-500">
                  Henüz nitelik tanımlanmamış.{" "}
                  <a
                    href="/admin/urunler/nitelikler"
                    target="_blank"
                    className="text-emerald-600 hover:underline"
                  >
                    Nitelik oluştur
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-stone-500">
                    Gramaj ve birim alanlari bu akistan kaldirildi. Gerekiyorsa varyant nitelikleri uzerinden tanimlayin.
                  </p>
                  {/* Selected Attributes Display */}
                  {((variants[activeVariant] as any).attributes || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {((variants[activeVariant] as any).attributes as VariantAttributeSelection[]).map(
                        (attr) => (
                          <div
                            key={attr.attributeId}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-border)] bg-[#fff1e7] px-3 py-1.5 text-sm text-[#9f3d00]"
                          >
                            <span className="font-medium">{attr.attributeName}:</span>
                            <span className="flex items-center gap-1">
                              {attr.imageUrl ? (
                                <img 
                                  src={attr.imageUrl} 
                                  alt={attr.value}
                                  className="w-5 h-5 rounded object-cover border border-gray-200"
                                />
                              ) : attr.colorCode ? (
                                <span
                                  className="w-3 h-3 rounded-full border border-gray-200"
                                  style={{ backgroundColor: attr.colorCode }}
                                />
                              ) : null}
                              {attr.value}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                removeVariantAttribute(activeVariant, attr.attributeId)
                              }
                              className="ml-1 text-[var(--admin-accent-hover)] hover:text-[#9f3d00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25"
                              aria-label={`${attr.attributeName} niteliğini kaldır`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Attribute Selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {attributes.map((attribute) => {
                      const selectedValue = (
                        (variants[activeVariant] as any).attributes || []
                      ).find((a: any) => a.attributeId === attribute.id);

                      return (
                        <div key={attribute.id} className="space-y-2">
                          <label className="text-sm font-medium text-stone-700">
                            {attribute.name}
                          </label>
                          <div className="relative">
                            <select
                              value={selectedValue?.valueId || ""}
                              onChange={(e) => {
                                if (e.target.value === "__new__") {
                                  setShowNewAttributeForm(attribute.id);
                                } else if (e.target.value) {
                                  toggleVariantAttribute(
                                    activeVariant,
                                    attribute.id,
                                    e.target.value
                                  );
                                }
                              }}
                              className="w-full appearance-none rounded-2xl border border-[#e8dbcf] bg-white px-4 py-3 pr-10 outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                            >
                              <option value="">Seçin...</option>
                              {attribute.values?.map((value) => (
                                <option key={value.id} value={value.id}>
                                  {value.value}
                                </option>
                              ))}
                              <option value="__new__" className="text-[var(--admin-accent-hover)]">
                                + Yeni {attribute.name} Ekle
                              </option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                          </div>

                          {/* New Value Form */}
                          {showNewAttributeForm === attribute.id && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="text"
                                value={newAttributeValue}
                                onChange={(e) => setNewAttributeValue(e.target.value)}
                                placeholder={`Yeni ${attribute.name}`}
                                className="flex-1 rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => addNewAttributeValue(attribute.id)}
                                className="rounded-xl bg-[var(--admin-accent)] px-3 py-2 text-sm font-medium text-white transition-all hover:from-[#E45700] hover:to-[#D34D00]"
                              >
                                Ekle
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowNewAttributeForm(null);
                                  setNewAttributeValue("");
                                }}
                                className="rounded-xl bg-stone-200 px-3 py-2 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-300"
                              >
                                İptal
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 min-[1025px]:grid-cols-2">
              {/* Variant Name */}
              <div className="space-y-2 min-[1025px]:col-span-2">
                <label className="text-sm font-semibold text-stone-700">
                  Varyant Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={variants[activeVariant].name}
                  onChange={(e) => updateVariant(activeVariant, "name", e.target.value)}
                  placeholder="Örn: 2'li Avantaj Paketi"
                  className={cn(
                    "w-full rounded-2xl border bg-[#FCFDFE] px-4 py-3 outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20",
                    errors[`variant_${activeVariant}_name`] ? "border-rose-300" : "border-[#e8dbcf]"
                  )}
                />
                {errors[`variant_${activeVariant}_name`] && (
                  <p className="text-xs text-rose-500">{errors[`variant_${activeVariant}_name`]}</p>
                )}
              </div>

              {/* Variant Image Selector */}
              {productImages.length > 0 && (
                <div className="space-y-2 min-[1025px]:col-span-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
                    <ImageIcon className="w-4 h-4" />
                    Varyant Görseli
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {productImages.map((img, idx) => {
                      const isSelected = variants[activeVariant].images?.[0] === img.url;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            const newImages = isSelected ? [] : [img.url];
                            updateVariant(activeVariant, "images", newImages);
                          }}
                          className={cn(
                            "relative h-20 w-20 overflow-hidden rounded-2xl border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25",
                            isSelected
                              ? "border-[var(--admin-accent)] ring-2 ring-[#FF6A00]/20"
                              : "border-[#eadfd4] hover:border-[var(--admin-accent-border)]"
                          )}
                          aria-label={isSelected ? `Varyant görseli seçildi: ${idx + 1}` : `Varyant görseli olarak ${idx + 1}. görseli seç`}
                        >
                          <img
                            src={img.url}
                            alt={img.alt || `Görsel ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 flex items-center justify-center bg-[var(--admin-accent)]/20">
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--admin-accent)]">
                                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })}
                    {/* Görseli kaldır */}
                    {variants[activeVariant].images?.[0] && (
                      <button
                        type="button"
                        onClick={() => updateVariant(activeVariant, "images", [])}
                        className="flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-dashed border-[#eadfd4] text-stone-400 transition-colors hover:border-rose-300 hover:text-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                        aria-label="Varyant görselini kaldır"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-stone-500">
                    Bu varyant için ürün galerisinden bir görsel seçin. Müşteri bu varyanta tıkladığında bu görsel gösterilecek.
                  </p>
                </div>
              )}

              {/* Price */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">
                  Satış Fiyatı (₺) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">₺</span>
                  <input
                    type="number"
                    step="0.01"
                    value={variants[activeVariant].price}
                    onChange={(e) => updateVariant(activeVariant, "price", parseFloat(e.target.value) || 0)}
                    className={cn(
                      "w-full rounded-2xl border bg-[#FCFDFE] py-3 pl-10 pr-4 outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20",
                      errors[`variant_${activeVariant}_price`] ? "border-rose-300" : "border-[#e8dbcf]"
                    )}
                  />
                </div>
                {errors[`variant_${activeVariant}_price`] && (
                  <p className="text-xs text-rose-500">{errors[`variant_${activeVariant}_price`]}</p>
                )}
                {variants[activeVariant].price > 0 && (
                  <p className="text-xs text-emerald-600" aria-live="polite">
                    KDV Dahil: ₺{calculateWithTax(variants[activeVariant].price, taxRate)}
                  </p>
                )}
              </div>

              {/* Original Price */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">Eski Fiyat / Compare At (Opsiyonel)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">₺</span>
                  <input
                    type="number"
                    step="0.01"
                    value={variants[activeVariant].originalPrice || ""}
                    onChange={(e) => updateVariant(activeVariant, "originalPrice", parseFloat(e.target.value) || undefined)}
                    placeholder="Normal fiyat"
                    className="w-full rounded-2xl border border-[#e8dbcf] bg-[#FCFDFE] py-3 pl-10 pr-4 outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                  />
                </div>
                {variants[activeVariant].originalPrice && variants[activeVariant].originalPrice > variants[activeVariant].price && (
                  <p className="text-xs font-medium text-emerald-600" aria-live="polite">
                    %{Math.round(((variants[activeVariant].originalPrice - variants[activeVariant].price) / variants[activeVariant].originalPrice) * 100)} indirim
                  </p>
                )}
              </div>

              {/* Cost */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">Maliyet (Opsiyonel)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">₺</span>
                  <input
                    type="number"
                    step="0.01"
                    value={variants[activeVariant].cost || ""}
                    onChange={(e) => updateVariant(activeVariant, "cost", parseFloat(e.target.value) || undefined)}
                    placeholder="Alış fiyatı"
                    className="w-full rounded-2xl border border-[#e8dbcf] bg-[#FCFDFE] py-3 pl-10 pr-4 outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                  />
                </div>
                {variants[activeVariant].cost && variants[activeVariant].cost > 0 && (
                  <p className="text-xs text-emerald-600" aria-live="polite">
                    <Calculator className="w-3 h-3 inline mr-1" />
                    Kar: ₺{calculateMargin(variants[activeVariant].price, variants[activeVariant].cost).margin}
                    (%{calculateMargin(variants[activeVariant].price, variants[activeVariant].cost).marginPercent})
                  </p>
                )}
              </div>

              {/* SKU */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">SKU/Barkod</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={variants[activeVariant].sku}
                    onChange={(e) => updateVariant(activeVariant, "sku", e.target.value)}
                    className="flex-1 rounded-2xl border border-[#e8dbcf] bg-[#FCFDFE] px-4 py-3 font-mono text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                  />
                  <button
                    type="button"
                    onClick={() => updateVariant(activeVariant, "sku", buildGeneratedSku())}
                    className="rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-2 text-xs font-semibold text-[var(--admin-accent-hover)] transition-all hover:border-[var(--admin-accent-border)] hover:bg-[#fff5ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25"
                  >
                    Oluştur
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Discount Rules */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-2 text-lg font-semibold text-stone-900">
            <Percent className="w-5 h-5 text-[var(--admin-accent)]" />
            İndirim Kuralları
          </h4>
          <button
            type="button"
            onClick={addDiscountRule}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--admin-accent-hover)] shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[#fff5ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25"
          >
            <Plus className="w-4 h-4" />
            Kural Ekle
          </button>
        </div>

        {discountRules.length === 0 && (
          <p className="text-sm text-stone-400">Henüz indirim kuralı eklenmemiş.</p>
        )}

        <div className="space-y-3">
          {discountRules.map((rule, index) => (
            <div key={rule.id} className="rounded-[24px] border border-[var(--admin-border)] bg-gradient-to-br from-white to-[#fff7f1] p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => {
                    const newRules = [...discountRules];
                    newRules[index].name = e.target.value;
                    onDiscountRulesChange(newRules);
                  }}
                  className="flex-1 rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm font-semibold outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                />
                <div className="flex items-center gap-2 ml-2">
                  <button
                    type="button"
                    onClick={() => {
                      const newRules = [...discountRules];
                      newRules[index].isActive = !newRules[index].isActive;
                      onDiscountRulesChange(newRules);
                    }}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,106,0,0.20)]",
                      rule.isActive
                        ? "bg-emerald-500 text-white"
                        : "bg-stone-200 text-stone-600"
                    )}
                  >
                    {rule.isActive ? "Aktif" : "Pasif"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDiscountRule(index)}
                    className="rounded-lg p-2 text-rose-500 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-200"
                    aria-label={`${rule.name} kuralını kaldır`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 min-[1025px]:grid-cols-3">
                <select
                  value={rule.type}
                  onChange={(e) => {
                    const newRules = [...discountRules];
                    newRules[index].type = e.target.value as DiscountRule["type"];
                    // Reset config based on type
                    if (e.target.value === "buy_x_get_y") {
                      newRules[index].config = { buy: 2, get: 1 };
                    } else if (e.target.value === "bulk") {
                      newRules[index].config = { minQty: 3, discountPercent: 10 };
                    } else {
                      newRules[index].config = { discountPercent: 10 };
                    }
                    onDiscountRulesChange(newRules);
                  }}
                  className="rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                >
                  <option value="buy_x_get_y">2+1 Kampanya</option>
                  <option value="bulk">Toplu Alım</option>
                  <option value="percentage">Yüzde İndirim</option>
                  <option value="fixed">Sabit İndirim</option>
                </select>

                {rule.type === "buy_x_get_y" && (
                  <>
                    <input
                      type="number"
                      value={rule.config.buy}
                      onChange={(e) => {
                        const newRules = [...discountRules];
                        newRules[index].config.buy = parseInt(e.target.value) || 2;
                        onDiscountRulesChange(newRules);
                      }}
                      placeholder="Al"
                       className="rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                     />
                     <input
                      type="number"
                      value={rule.config.get}
                      onChange={(e) => {
                        const newRules = [...discountRules];
                        newRules[index].config.get = parseInt(e.target.value) || 1;
                        onDiscountRulesChange(newRules);
                      }}
                      placeholder="Öde"
                       className="rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                     />
                   </>
                 )}

                {rule.type === "bulk" && (
                  <>
                    <input
                      type="number"
                      value={rule.config.minQty}
                      onChange={(e) => {
                        const newRules = [...discountRules];
                        newRules[index].config.minQty = parseInt(e.target.value) || 3;
                        onDiscountRulesChange(newRules);
                      }}
                      placeholder="Min. adet"
                       className="rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                     />
                     <input
                      type="number"
                      value={rule.config.discountPercent}
                      onChange={(e) => {
                        const newRules = [...discountRules];
                        newRules[index].config.discountPercent = parseInt(e.target.value) || 10;
                        onDiscountRulesChange(newRules);
                      }}
                      placeholder="İndirim %"
                       className="rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                     />
                   </>
                 )}

                {(rule.type === "percentage" || rule.type === "fixed") && (
                  <input
                    type="number"
                    value={rule.config.discountPercent || rule.config.discountAmount}
                    onChange={(e) => {
                      const newRules = [...discountRules];
                      if (rule.type === "percentage") {
                        newRules[index].config.discountPercent = parseInt(e.target.value) || 10;
                      } else {
                        newRules[index].config.discountAmount = parseInt(e.target.value) || 10;
                      }
                      onDiscountRulesChange(newRules);
                    }}
                    placeholder={rule.type === "percentage" ? "İndirim %" : "İndirim ₺"}
                    className="rounded-xl border border-[#e8dbcf] bg-white px-3 py-2 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
