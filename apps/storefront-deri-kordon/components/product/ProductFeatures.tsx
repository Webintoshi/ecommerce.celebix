"use client";

import {
  Check,
  Package,
  Clock,
  ThermometerSnowflake,
  Leaf,
  Shield,
  Sparkles,
  Info,
} from "lucide-react";
import { motion } from "framer-motion";
import { Product } from "@/types/product";

interface ProductFeaturesProps {
  product: Product;
}

// Feature Card Component
function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="p-6 bg-white rounded-2xl border border-[#7B1113]/10 shadow-sm"
    >
      <div className="w-12 h-12 rounded-xl bg-[#F3E0E1] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-[#7B1113]" />
      </div>
      <h4 className="font-semibold text-[#7B1113] mb-2">{title}</h4>
      <p className="text-sm text-[#6b4b4c] leading-relaxed">{description}</p>
    </motion.div>
  );
}

export function ProductFeatures({ product }: ProductFeaturesProps) {
  const features = [
    product.vegan && { label: "%100 Vegan", icon: Leaf },
    product.glutenFree && { label: "Glutensiz", icon: Shield },
    product.sugarFree && { label: "Şeker İçermez", icon: Sparkles },
    product.highProtein && { label: "Yüksek Protein", icon: Sparkles },
  ].filter(Boolean);

  const defaultFeatures = [
    { label: "Katkı Maddesi İçermez", icon: Shield },
    { label: "Palm Yağı İçermez", icon: Leaf },
    { label: "Doğal İçerik", icon: Sparkles },
  ];

  return (
    <div className="space-y-12">
      {/* Main Description - Editorial Style */}
      {product.description && (
        <div className="bg-white rounded-3xl p-8 lg:p-12 border border-[#7B1113]/10">
          <h3 className="text-2xl font-semibold text-[#7B1113] mb-6">
            Ürün Açıklaması
          </h3>
          <div className="prose prose-lg max-w-none">
            <p className="text-[#6b4b4c] leading-relaxed whitespace-pre-line text-lg">
              {product.description}
            </p>
          </div>
        </div>
      )}

      {/* Key Features Grid */}
      <div>
        <h3 className="text-xl font-semibold text-[#7B1113] mb-6 text-center">
          Ürün Özellikleri
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Dynamic features from product */}
          {features.map(
            (feature, idx) =>
              feature && (
                <FeatureCard
                  key={idx}
                  icon={feature.icon as React.ElementType}
                  title={feature.label}
                  description=""
                />
              )
          )}
          
          {/* Default features */}
          {defaultFeatures.map((feature, idx) => (
            <FeatureCard
              key={`default-${idx}`}
              icon={feature.icon}
              title={feature.label}
              description=""
            />
          ))}
        </div>
      </div>

      {/* Ingredients Section */}
      {product.nutritionSettings?.ingredients && (
        <div className="bg-[#F3E0E1]/30 rounded-3xl p-8 border border-[#7B1113]/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#7B1113] flex items-center justify-center">
              <Info className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-xl font-semibold text-[#7B1113]">
              İçindekiler
            </h3>
          </div>
          <p className="text-[#6b4b4c] leading-relaxed text-lg">
            {product.nutritionSettings.ingredients}
          </p>
        </div>
      )}

      {/* Storage & Shelf Life Info */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          whileHover={{ y: -4 }}
          className="flex items-start gap-4 p-6 bg-white rounded-2xl border border-[#7B1113]/10"
        >
          <div className="w-12 h-12 rounded-xl bg-[#F3E0E1] flex items-center justify-center flex-shrink-0">
            <ThermometerSnowflake className="w-6 h-6 text-[#7B1113]" />
          </div>
          <div>
            <p className="font-semibold text-[#7B1113] mb-1">Saklama Koşulları</p>
            <p className="text-sm text-[#6b4b4c]">
              {product.nutritionSettings?.storageConditions ||
                "Serin ve kuru yerde, doğrudan güneş ışığından uzak tutun."}
            </p>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -4 }}
          className="flex items-start gap-4 p-6 bg-white rounded-2xl border border-[#7B1113]/10"
        >
          <div className="w-12 h-12 rounded-xl bg-[#F3E0E1] flex items-center justify-center flex-shrink-0">
            <Clock className="w-6 h-6 text-[#7B1113]" />
          </div>
          <div>
            <p className="font-semibold text-[#7B1113] mb-1">Raf Ömrü</p>
            <p className="text-sm text-[#6b4b4c]">
              {product.nutritionSettings?.shelfLifeDays
                ? `${product.nutritionSettings.shelfLifeDays} gün`
                : "6 ay (açılmamış kavanozda)"}
            </p>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ y: -4 }}
          className="flex items-start gap-4 p-6 bg-white rounded-2xl border border-[#7B1113]/10"
        >
          <div className="w-12 h-12 rounded-xl bg-[#F3E0E1] flex items-center justify-center flex-shrink-0">
            <Package className="w-6 h-6 text-[#7B1113]" />
          </div>
          <div>
            <p className="font-semibold text-[#7B1113] mb-1">Paketleme</p>
            <p className="text-sm text-[#6b4b4c]">
              Hijyenik cam kavanozda, koruyucu ambalaj ile gönderilir.
            </p>
          </div>
        </motion.div>
      </div>

      {/* Allergen Warning */}
      <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h4 className="font-semibold text-amber-800 mb-1">
              Alerjen Uyarısı
            </h4>
            <p className="text-sm text-amber-700">
              Bu ürün fıstık, fındık ve süt ürünleri içerebilir. Alerjiniz varsa
              içindekiler listesini dikkatlice okuyunuz.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
