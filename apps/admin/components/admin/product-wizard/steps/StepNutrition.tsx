"use client";

import { Apple, AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { NutritionalInfo, NutritionSettings, Allergen } from "@/types/product";

interface StepNutritionProps {
  nutritionalInfo: NutritionalInfo;
  nutritionSettings: NutritionSettings;
  vegan: boolean;
  glutenFree: boolean;
  sugarFree: boolean;
  highProtein: boolean;
  onNutritionalInfoChange: (info: NutritionalInfo) => void;
  onNutritionSettingsChange: (settings: NutritionSettings) => void;
  onFeaturesChange: (features: { vegan: boolean; glutenFree: boolean; sugarFree: boolean; highProtein: boolean }) => void;
}

const ALLERGENS = [
  { id: "fistik", label: "Fıstık" },
  { id: "sut", label: "Süt" },
  { id: "yumurta", label: "Yumurta" },
  { id: "gluten", label: "Gluten" },
  { id: "yerfistigi", label: "Yer Fıstığı" },
  { id: "badem", label: "Badem" },
  { id: "kaju", label: "Kaju" },
  { id: "ceviz", label: "Ceviz" },
];

const FEATURES = [
  { id: "vegan", label: "VEGAN", color: "emerald" },
  { id: "glutenFree", label: "GLUTENSİZ", color: "amber" },
  { id: "sugarFree", label: "ŞEKERSİZ", color: "blue" },
  { id: "highProtein", label: "YÜKSEK PROTEİN", color: "purple" },
];

export function StepNutrition({
  nutritionalInfo,
  nutritionSettings,
  vegan,
  glutenFree,
  sugarFree,
  highProtein,
  onNutritionalInfoChange,
  onNutritionSettingsChange,
  onFeaturesChange,
}: StepNutritionProps) {
  const toggleAllergen = (allergenId: string) => {
    const current = nutritionSettings.allergens;
    const allergen = allergenId as Allergen;
    const updated = current.includes(allergen)
      ? current.filter((a) => a !== allergen)
      : [...current, allergen];
    onNutritionSettingsChange({ ...nutritionSettings, allergens: updated });
  };

  const toggleFeature = (feature: string) => {
    const updates: any = { vegan, glutenFree, sugarFree, highProtein };
    updates[feature] = !updates[feature];
    onFeaturesChange(updates);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
        <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-rose-500/20">
          <Apple className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Besin Değerleri</h3>
          <p className="text-sm text-gray-500">Ürün içerik ve besin bilgileri</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Nutrition Basis */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-gray-700">Besin Değeri Bazı</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onNutritionSettingsChange({ ...nutritionSettings, basis: "per_100g" })}
                className={cn(
                  "px-6 py-3 rounded-xl text-sm font-bold transition-all",
                  nutritionSettings.basis === "per_100g"
                    ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                100g Bazında
              </button>
              <button
                type="button"
                onClick={() => onNutritionSettingsChange({ ...nutritionSettings, basis: "per_serving" })}
                className={cn(
                  "px-6 py-3 rounded-xl text-sm font-bold transition-all",
                  nutritionSettings.basis === "per_serving"
                    ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Per Serving
              </button>
            </div>
          </div>

          {/* Serving Size */}
          {nutritionSettings.basis === "per_serving" && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Servis Gramajı</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={nutritionSettings.servingSize}
                    onChange={(e) =>
                      onNutritionSettingsChange({
                        ...nutritionSettings,
                        servingSize: parseInt(e.target.value) || 30,
                      })
                    }
                    className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
                  />
                  <span className="text-gray-500 text-sm">g</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">Paket İçi Adet</label>
                <input
                  type="number"
                  value={nutritionSettings.servingPerContainer}
                  onChange={(e) =>
                    onNutritionSettingsChange({
                      ...nutritionSettings,
                      servingPerContainer: parseInt(e.target.value) || 1,
                    })
                  }
                  className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
                />
              </div>
            </div>
          )}

          {/* Nutritional Values */}
          <div className="space-y-4">
            <label className="text-sm font-bold text-gray-700">Besin Değerleri</label>
            <div className="grid grid-cols-2 gap-4">
              {[
                { key: "calories", label: "Kalori", unit: "kcal" },
                { key: "protein", label: "Protein", unit: "g" },
                { key: "carbs", label: "Karbonhidrat", unit: "g" },
                { key: "fat", label: "Yağ", unit: "g" },
                { key: "fiber", label: "Lif", unit: "g" },
                { key: "sugar", label: "Şeker", unit: "g" },
              ].map((item) => (
                <div key={item.key} className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">{item.label}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={nutritionalInfo[item.key as keyof NutritionalInfo] || ""}
                      onChange={(e) =>
                        onNutritionalInfoChange({
                          ...nutritionalInfo,
                          [item.key]: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
                    />
                    <span className="text-gray-400 text-sm w-12">{item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-700">İçindekiler</label>
            <textarea
              value={nutritionSettings.ingredients || ""}
              onChange={(e) =>
                onNutritionSettingsChange({
                  ...nutritionSettings,
                  ingredients: e.target.value,
                })
              }
              placeholder="Fıstık (%98), Tuz, ..."
              rows={3}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none resize-none"
            />
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Features */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-gray-700">Ürün Özellikleri</label>
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => toggleFeature(feature.id)}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2",
                    {
                      vegan,
                      glutenFree,
                      sugarFree,
                      highProtein,
                    }[feature.id]
                      ? `bg-${feature.color}-50 border-${feature.color}-200 text-${feature.color}-700`
                      : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                  )}
                >
                  {{
                    vegan,
                    glutenFree,
                    sugarFree,
                    highProtein,
                  }[feature.id] && <Check className="w-5 h-5" />}
                  <span className="text-xs font-black">{feature.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Allergens */}
          <div className="space-y-3">
            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Alerjen Uyarısı
            </label>
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((allergen) => (
                <button
                  key={allergen.id}
                  type="button"
                  onClick={() => toggleAllergen(allergen.id)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-sm font-bold transition-all",
                    nutritionSettings.allergens.includes(allergen.id as Allergen)
                      ? "bg-rose-100 border border-rose-300 text-rose-700"
                      : "bg-white border border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  {nutritionSettings.allergens.includes(allergen.id as Allergen) && (
                    <Check className="w-3 h-3 inline mr-1" />
                  )}
                  {allergen.label}
                </button>
              ))}
            </div>
            {nutritionSettings.allergens.length > 0 && (
              <p className="text-sm text-rose-600 bg-rose-50 p-3 rounded-xl">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Bu ürün {nutritionSettings.allergens.join(", ")} içerir.
              </p>
            )}
          </div>

          {/* Storage & Shelf Life */}
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Saklama Koşulları</label>
              <textarea
                value={nutritionSettings.storageConditions || ""}
                onChange={(e) =>
                  onNutritionSettingsChange({
                    ...nutritionSettings,
                    storageConditions: e.target.value,
                  })
                }
                placeholder="Serin ve kuru yerde saklayın..."
                rows={2}
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">Raf Ömrü (Gün)</label>
              <input
                type="number"
                value={nutritionSettings.shelfLifeDays || ""}
                onChange={(e) =>
                  onNutritionSettingsChange({
                    ...nutritionSettings,
                    shelfLifeDays: parseInt(e.target.value) || undefined,
                  })
                }
                placeholder="365"
                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
