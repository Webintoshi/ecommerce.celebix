"use client";

import { Product } from "@/types/product";
import { motion } from "framer-motion";

interface NutritionLabelProps {
  product: Product;
}

export function NutritionLabel({ product }: NutritionLabelProps) {
  const nutrition = product.nutritionalInfo;
  const vitamins = product.nutritionSettings?.vitamins;
  const basis = product.nutritionSettings?.basis || "per_100g";
  const servingSize = product.nutritionSettings?.servingSize || 100;

  if (!nutrition) {
    return (
      <div className="text-center py-16 bg-white rounded-3xl border border-[#7B1113]/10">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#F3E0E1] flex items-center justify-center">
          <svg className="w-10 h-10 text-[#7B1113]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-lg font-medium text-[#7B1113]">Besin Değeri Bilgisi Bulunmuyor</p>
        <p className="text-[#6b4b4c] mt-2">Bu ürün için besin değeri bilgisi eklenmemiş.</p>
      </div>
    );
  }

  const nutrients = [
    { label: "Enerji", value: `${nutrition.calories} kcal`, highlight: true, icon: "🔥" },
    { label: "Protein", value: `${nutrition.protein}g`, icon: "💪" },
    { label: "Karbonhidrat", value: `${nutrition.carbs}g`, icon: "🌾" },
    { label: "Yağ", value: `${nutrition.fat}g`, icon: "🥑" },
    { label: "Lif", value: `${nutrition.fiber}g`, icon: "🌿" },
    { label: "Şeker", value: nutrition.sugar ? `${nutrition.sugar}g` : "0g", icon: "🍯" },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-[#7B1113]/10 overflow-hidden shadow-sm"
      >
        {/* Header */}
        <div className="bg-[#7B1113] text-white p-6">
          <h3 className="text-2xl font-bold">Besin Değerleri</h3>
          <p className="text-white/80 mt-1">
            {basis === "per_100g" ? "100g" : `${servingSize}g`} başına
          </p>
        </div>

        {/* Main Nutrients */}
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            {nutrients.map((item, idx) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className={`
                  p-4 rounded-2xl border transition-all hover:shadow-md
                  ${item.highlight 
                    ? "bg-[#7B1113] text-white border-[#7B1113] col-span-2" 
                    : "bg-[#F3E0E1]/30 border-[#7B1113]/10"
                  }
                `}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{item.icon}</span>
                    <span className={item.highlight ? "text-white/90" : "text-[#6b4b4c]"}>
                      {item.label}
                    </span>
                  </div>
                  <span className={`text-xl font-bold ${item.highlight ? "text-white" : "text-[#7B1113]"}`}>
                    {item.value}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Vitamins & Minerals */}
          {vitamins && Object.keys(vitamins).length > 0 && (
            <div className="mt-8 pt-8 border-t border-[#7B1113]/10">
              <h4 className="text-lg font-semibold text-[#7B1113] mb-4">Vitamin & Mineral</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(vitamins).map(([key, value], idx) => {
                  const labelMap: Record<string, string> = {
                    a: "A Vitamini",
                    c: "C Vitamini",
                    d: "D Vitamini",
                    e: "E Vitamini",
                    calcium: "Kalsiyum",
                    iron: "Demir",
                    magnesium: "Magnezyum",
                    zinc: "Çinko",
                  };
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + idx * 0.05 }}
                      className="p-3 bg-[#F3E0E1]/30 rounded-xl text-center"
                    >
                      <p className="text-xs text-[#6b4b4c] mb-1">{labelMap[key] || key}</p>
                      <p className="font-semibold text-[#7B1113]">{value as string}</p>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Note */}
        <div className="bg-[#F3E0E1]/30 p-4 text-center">
          <p className="text-sm text-[#6b4b4c]">
            Günlük besin değeri ihtiyacının %{Math.round((nutrition.calories / 2000) * 100)}'ini karşılar
          </p>
        </div>
      </motion.div>

      {/* Allergens */}
      {product.nutritionSettings?.allergens && product.nutritionSettings.allergens.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 p-6 bg-amber-50 rounded-2xl border border-amber-200"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-amber-900 mb-1">Alerjen Uyarısı</p>
              <p className="text-sm text-amber-700">
                Bu ürün <span className="font-medium">{product.nutritionSettings.allergens.join(", ")}</span> içerir.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
