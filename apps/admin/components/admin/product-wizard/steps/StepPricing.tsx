"use client";

import { useState, useEffect } from "react";
import { Tag, Plus, X, Percent, Calculator, Package, ChevronDown, Palette, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductVariant, DiscountRule, TaxRate, ProductImage } from "@/types/product";
import { VariantAttribute, VariantAttributeValue } from "@/types/variant-attributes";
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
      weight: 450,
      price: 0,
      stock: 50,
      sku: `EZM-${Date.now()}`,
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
    <div className="p-8 space-y-8">
      {/* Section Header */}
      <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
        <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <Tag className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Fiyatlandırma</h3>
          <p className="text-sm text-gray-500">Varyantlar, KDV ve indirim kuralları</p>
        </div>
      </div>

      {/* KDV Oranı */}
      <div className="bg-gray-50 rounded-2xl p-6">
        <label className="text-sm font-bold text-gray-700 mb-3 block">KDV Oranı</label>
        <div className="flex items-center gap-2 flex-wrap">
          {[0, 1, 8, 10, 20].map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => onTaxRateChange(rate as TaxRate)}
              className={cn(
                "px-6 py-3 rounded-xl text-sm font-bold transition-all",
                taxRate === rate
                  ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              )}
            >
              %{rate}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {taxRate === 0 
            ? "KDV uygulanmayacak" 
            : `Fiyatlara KDV ${taxRate}% olarak eklenecek`}
        </p>
      </div>

      {/* Variants */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-lg font-bold text-gray-900">Varyantlar</h4>
          <button
            type="button"
            onClick={addVariant}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-bold hover:bg-emerald-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Varyant Ekle
          </button>
        </div>

        {/* Variant Tabs */}
        {variants.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
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
                    "px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                    activeVariant === index
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-gray-900">
                Varyant Detayları
              </h5>
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(activeVariant)}
                  className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Variant Attributes Section */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium text-gray-700">Nitelikler</span>
                <span className="text-xs text-gray-400">(İsteğe bağlı)</span>
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
                  {/* Selected Attributes Display */}
                  {((variants[activeVariant] as any).attributes || []).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {((variants[activeVariant] as any).attributes as VariantAttributeSelection[]).map(
                        (attr) => (
                          <div
                            key={attr.attributeId}
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-lg text-sm"
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
                              className="ml-1 text-emerald-600 hover:text-emerald-800"
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
                          <label className="text-sm font-medium text-gray-700">
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
                              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all appearance-none"
                            >
                              <option value="">Seçin...</option>
                              {attribute.values?.map((value) => (
                                <option key={value.id} value={value.id}>
                                  {value.value}
                                </option>
                              ))}
                              <option value="__new__" className="text-emerald-600">
                                + Yeni {attribute.name} Ekle
                              </option>
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                          </div>

                          {/* New Value Form */}
                          {showNewAttributeForm === attribute.id && (
                            <div className="flex items-center gap-2 mt-2">
                              <input
                                type="text"
                                value={newAttributeValue}
                                onChange={(e) => setNewAttributeValue(e.target.value)}
                                placeholder={`Yeni ${attribute.name}`}
                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => addNewAttributeValue(attribute.id)}
                                className="px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600"
                              >
                                Ekle
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowNewAttributeForm(null);
                                  setNewAttributeValue("");
                                }}
                                className="px-3 py-2 bg-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-300"
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Variant Name */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-bold text-gray-700">
                  Varyant Adı <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={variants[activeVariant].name}
                  onChange={(e) => updateVariant(activeVariant, "name", e.target.value)}
                  placeholder="Örn: 2'li Avantaj Paketi"
                  className={cn(
                    "w-full px-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all",
                    errors[`variant_${activeVariant}_name`] ? "border-rose-300" : "border-gray-200"
                  )}
                />
                {errors[`variant_${activeVariant}_name`] && (
                  <p className="text-xs text-rose-500">{errors[`variant_${activeVariant}_name`]}</p>
                )}
              </div>

              {/* Variant Image Selector */}
              {productImages.length > 0 && (
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
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
                            "relative w-20 h-20 rounded-xl overflow-hidden border-2 transition-all",
                            isSelected 
                              ? "border-emerald-500 ring-2 ring-emerald-500/20" 
                              : "border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <img
                            src={img.url}
                            alt={img.alt || `Görsel ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          {isSelected && (
                            <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
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
                        className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors"
                      >
                        <X className="w-6 h-6" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Bu varyant için ürün galerisinden bir görsel seçin. Müşteri bu varyanta tıkladığında bu görsel gösterilecek.
                  </p>
                </div>
              )}
              
              {/* Weight */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Gramaj</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={variants[activeVariant].weight}
                    onChange={(e) => updateVariant(activeVariant, "weight", parseInt(e.target.value) || 0)}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                  />
                  <span className="text-gray-500 text-sm font-medium">g</span>
                </div>
              </div>

              {/* Unit */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Birim</label>
                <select
                  value={variants[activeVariant].unit}
                  onChange={(e) => updateVariant(activeVariant, "unit", e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                >
                  <option value="adet">Adet</option>
                  <option value="kg">Kilogram</option>
                  <option value="g">Gram</option>
                  <option value="lt">Litre</option>
                  <option value="ml">Mililitre</option>
                  <option value="paket">Paket</option>
                  <option value="kutu">Kutu</option>
                </select>
              </div>

              {/* Price */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">
                  Satış Fiyatı (₺) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">₺</span>
                  <input
                    type="number"
                    step="0.01"
                    value={variants[activeVariant].price}
                    onChange={(e) => updateVariant(activeVariant, "price", parseFloat(e.target.value) || 0)}
                    className={cn(
                      "w-full pl-10 pr-4 py-3 bg-gray-50 border rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all",
                      errors[`variant_${activeVariant}_price`] ? "border-rose-300" : "border-gray-200"
                    )}
                  />
                </div>
                {errors[`variant_${activeVariant}_price`] && (
                  <p className="text-xs text-rose-500">{errors[`variant_${activeVariant}_price`]}</p>
                )}
                {variants[activeVariant].price > 0 && (
                  <p className="text-xs text-emerald-600">
                    KDV Dahil: ₺{calculateWithTax(variants[activeVariant].price, taxRate)}
                  </p>
                )}
              </div>

              {/* Original Price */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">İndirimli Fiyat (Opsiyonel)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">₺</span>
                  <input
                    type="number"
                    step="0.01"
                    value={variants[activeVariant].originalPrice || ""}
                    onChange={(e) => updateVariant(activeVariant, "originalPrice", parseFloat(e.target.value) || undefined)}
                    placeholder="Normal fiyat"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                {variants[activeVariant].originalPrice && variants[activeVariant].originalPrice > variants[activeVariant].price && (
                  <p className="text-xs text-emerald-600 font-medium">
                    %{Math.round(((variants[activeVariant].originalPrice - variants[activeVariant].price) / variants[activeVariant].originalPrice) * 100)} indirim
                  </p>
                )}
              </div>

              {/* Cost */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Maliyet (Opsiyonel)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">₺</span>
                  <input
                    type="number"
                    step="0.01"
                    value={variants[activeVariant].cost || ""}
                    onChange={(e) => updateVariant(activeVariant, "cost", parseFloat(e.target.value) || undefined)}
                    placeholder="Alış fiyatı"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
                  />
                </div>
                {variants[activeVariant].cost && variants[activeVariant].cost > 0 && (
                  <p className="text-xs text-emerald-600">
                    <Calculator className="w-3 h-3 inline mr-1" />
                    Kar: ₺{calculateMargin(variants[activeVariant].price, variants[activeVariant].cost).margin}
                    (%{calculateMargin(variants[activeVariant].price, variants[activeVariant].cost).marginPercent})
                  </p>
                )}
              </div>

              {/* SKU */}
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">SKU/Barkod</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={variants[activeVariant].sku}
                    onChange={(e) => updateVariant(activeVariant, "sku", e.target.value)}
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => updateVariant(activeVariant, "sku", `EZM-${Date.now().toString().slice(-6)}`)}
                    className="px-3 py-2 bg-gray-200 text-gray-600 rounded-xl text-xs font-bold hover:bg-gray-300 transition-colors"
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
          <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-purple-500" />
            İndirim Kuralları
          </h4>
          <button
            type="button"
            onClick={addDiscountRule}
            className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-xl text-sm font-bold hover:bg-purple-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Kural Ekle
          </button>
        </div>

        {discountRules.length === 0 && (
          <p className="text-sm text-gray-400">Henüz indirim kuralı eklenmemiş.</p>
        )}

        <div className="space-y-3">
          {discountRules.map((rule, index) => (
            <div key={rule.id} className="bg-purple-50 border border-purple-100 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <input
                  type="text"
                  value={rule.name}
                  onChange={(e) => {
                    const newRules = [...discountRules];
                    newRules[index].name = e.target.value;
                    onDiscountRulesChange(newRules);
                  }}
                  className="flex-1 px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
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
                      "px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                      rule.isActive
                        ? "bg-emerald-500 text-white"
                        : "bg-gray-200 text-gray-600"
                    )}
                  >
                    {rule.isActive ? "Aktif" : "Pasif"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeDiscountRule(index)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
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
                  className="px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none"
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
                      className="px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm"
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
                      className="px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm"
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
                      className="px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm"
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
                      className="px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm"
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
                    className="px-3 py-2 bg-white border border-purple-200 rounded-lg text-sm"
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
