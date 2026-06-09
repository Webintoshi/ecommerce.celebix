"use client";

import Link from "next/link";
import Image from "next/image";
import { Product, ProductVariant } from "@/types/product";
import { ROUTES } from "@/lib/constants";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface PremiumProductCardProps {
  product: Product;
  variant?: "hero" | "standard";
  index?: number;
}

// Renk isimlerini hex kodlarıyla eşleştiren harita
const COLOR_MAP: Record<string, string> = {
  // Temel renkler
  "siyah": "#1A1A1A",
  "black": "#1A1A1A",
  "beyaz": "#FFFFFF",
  "white": "#FFFFFF",
  "kahverengi": "#8B4513",
  "brown": "#8B4513",
  "koyu kahve": "#5D4037",
  "dark brown": "#5D4037",
  "açık kahve": "#A0522D",
  "light brown": "#A0522D",
  "taba": "#C4A484",
  "tan": "#C4A484",
  "camel": "#C19A6B",
  "krem": "#F5F5DC",
  "cream": "#F5F5DC",
  "bej": "#E8DCC4",
  "beige": "#E8DCC4",
  "lacivert": "#000080",
  "navy": "#000080",
  "mavi": "#4169E1",
  "blue": "#4169E1",
  "yeşil": "#228B22",
  "green": "#228B22",
  "haki": "#6B8E23",
  "khaki": "#6B8E23",
  "kırmızı": "#DC143C",
  "red": "#DC143C",
  "bordo": "#800000",
  "burgundy": "#800000",
  "gri": "#808080",
  "gray": "#808080",
  "gümüş": "#C0C0C0",
  "silver": "#C0C0C0",
  "altın": "#D4AF37",
  "gold": "#D4AF37",
  "sarı": "#FFD700",
  "yellow": "#FFD700",
  "turuncu": "#FF8C00",
  "orange": "#FF8C00",
  "pembe": "#FFB6C1",
  "pink": "#FFB6C1",
  "mor": "#800080",
  "purple": "#800080",
  "vizon": "#9E8B7D",
  "mink": "#9E8B7D",
  "cappuccino": "#A68B6C",
  "espresso": "#4B3621",
  "cognac": "#9A463D",
  "konyak": "#9A463D",
  "terracotta": "#E2725B",
  "toprak": "#E2725B",
  "antik kahve": "#704214",
  "antique brown": "#704214",
  "fındık": "#C4A77D",
  "hazelnut": "#C4A77D",
  "çikolata": "#3D2314",
  "chocolate": "#3D2314",
  "taupe": "#8B8589",
  "gül kurusu": "#D4A5A5",
  "dusty rose": "#D4A5A5",
};

// Renk ismini normalize et ve eşleştir
function getColorHex(colorName: string): string {
  const normalizedName = colorName.toLowerCase().trim();
  
  // Tam eşleşme dene
  if (COLOR_MAP[normalizedName]) {
    return COLOR_MAP[normalizedName];
  }
  
  // İçeren renkleri dene (örn: "Koyu Kahverengi" -> "koyu kahve")
  for (const [key, value] of Object.entries(COLOR_MAP)) {
    if (normalizedName.includes(key)) {
      return value;
    }
  }
  
  // Varsayılan: nötr gri
  return "#9CA3AF";
}

// Ürünün renk varyantlarını bul
function getColorVariants(product: Product): ProductVariant[] {
  if (!product.variants || product.variants.length === 0) {
    return [];
  }
  
  // GroupName'i "Renk" olan varyantları bul
  const colorVariants = product.variants.filter(
    (v) => v.groupName?.toLowerCase() === "renk" || 
           v.groupName?.toLowerCase() === "color" ||
           v.groupName?.toLowerCase() === "colour"
  );
  
  if (colorVariants.length > 0) {
    return colorVariants;
  }
  
  // Eğer groupName yoksa, varyant isimlerinden renk içerenleri bul
  const colorKeywords = Object.keys(COLOR_MAP);
  return product.variants.filter((v) => {
    const nameLower = v.name.toLowerCase();
    return colorKeywords.some(keyword => nameLower.includes(keyword));
  });
}

function getResolvedProductImages(product: Product) {
  const legacyImagesV2 = Array.isArray((product as Product & { images_v2?: Array<string | { url?: string }> }).images_v2)
    ? ((product as Product & { images_v2?: Array<string | { url?: string }> }).images_v2 ?? [])
      .map((image) => (typeof image === "string" ? image : image?.url ?? ""))
      .filter((image) => image.length > 0)
    : [];

  return (Array.isArray(product.images) && product.images.length > 0 ? product.images : legacyImagesV2)
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter((image) => image.length > 0);
}

export function PremiumProductCard({ product }: PremiumProductCardProps) {
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  
  // Renk varyantlarını al
  const colorVariants = getColorVariants(product);
  const uniqueColors = colorVariants.slice(0, 4); // Max 4 renk göster

  return (
    <Link href={ROUTES.product(product.slug)} className="group block">
      {/* Image Container - No border, no shadow, no padding - Clean like the reference */}
      <div className="relative aspect-square mb-3 overflow-hidden bg-transparent">
        {primaryImage ? (
          <Image
            src={primaryImage}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, 25vw"
            className="object-contain group-hover:scale-105 transition-transform duration-500"
            unoptimized={usesProxiedPrimaryImage}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 bg-neutral-50">
            <span className="text-sm">Görsel yok</span>
          </div>
        )}
      </div>

      {/* Product Name - Below image */}
      <h3 className="mb-2 line-clamp-2 px-0.5 text-center font-serif text-[10px] font-normal leading-[1.45] tracking-[0.01em] text-neutral-800 transition-colors group-hover:text-neutral-600 sm:text-[11px]">
        {product.name}
      </h3>
      
      {/* Color Variants - Small circular buttons like Roarcraft */}
      {uniqueColors.length > 0 && (
        <div className="flex items-center justify-center gap-1.5">
          {uniqueColors.map((variant, index) => {
            const colorHex = getColorHex(variant.name);
            const isLightColor = colorHex.toLowerCase() === "#ffffff" || 
                                 colorHex.toLowerCase() === "#f5f5dc" ||
                                 colorHex.toLowerCase() === "#fffdd0" ||
                                 colorHex.toLowerCase() === "#e8dcc4";
            
            return (
              <div
                key={variant.id || index}
                className={`
                  w-5 h-5 rounded-full border 
                  ${isLightColor ? "border-neutral-300" : "border-transparent"}
                  transition-transform duration-200
                  hover:scale-110
                `}
                style={{ backgroundColor: colorHex }}
                title={variant.name}
              />
            );
          })}
          {colorVariants.length > 4 && (
            <span className="text-xs text-neutral-400 ml-0.5">
              +{colorVariants.length - 4}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
