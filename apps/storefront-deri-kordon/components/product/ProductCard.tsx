"use client";

import Link from "next/link";
import Image from "next/image";
import { Product } from "@/types/product";
import { formatPrice } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
  featured?: boolean; // First card can be featured/promo style
}

// Sample color variants for demo (would come from product data)
const sampleColors = [
  { name: "Brown", color: "#8B4513" },
  { name: "Black", color: "#1A1A1A" },
  { name: "Tan", color: "#C4956A" },
  { name: "Olive", color: "#556B2F" },
];

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

// Get product colors from attributes/options
function getProductColors(product: Product): { name: string; color: string }[] {
  // Check if product has color attribute/option
  const colorOption = product.options?.find(opt => 
    opt.name.toLowerCase().includes("renk") || 
    opt.name.toLowerCase().includes("color")
  );
  
  if (colorOption && colorOption.values.length > 0) {
    return colorOption.values.map((value, i) => ({
      name: value,
      color: getColorHex(value) || sampleColors[i % sampleColors.length].color
    }));
  }
  
  // Fallback: use sample colors based on product id for consistency
  const colorCount = 3 + (product.id % 2); // 3 or 4 colors
  return sampleColors.slice(0, colorCount);
}

// Map color names to hex
function getColorHex(colorName: string): string | null {
  const colorMap: Record<string, string> = {
    "kahverengi": "#8B4513",
    "brown": "#8B4513",
    "siyah": "#1A1A1A",
    "black": "#1A1A1A",
    "taba": "#C4956A",
    "tan": "#C4956A",
    "camel": "#C4956A",
    "koyu kahve": "#5C4033",
    "dark brown": "#5C4033",
    "krem": "#F5F5DC",
    "bej": "#F5F5DC",
    "cream": "#F5F5DC",
    "haki": "#556B2F",
    "olive": "#556B2F",
    "yeşil": "#556B2F",
    "green": "#556B2F",
    "bordo": "#800020",
    "burgundy": "#800020",
  };
  
  return colorMap[colorName.toLowerCase()] || null;
}

export function ProductCard({ product, viewMode = "grid", featured = false }: ProductCardProps) {
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  const colors = getProductColors(product);

  if (!product.variants || product.variants.length === 0) {
    return (
      <Link href={ROUTES.product(product.slug)} className="group block">
        <div className="bg-white">
          {/* Image Container - Clean white background */}
          <div className="relative aspect-[4/5] bg-[#F5F5F5] mb-5 overflow-hidden">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-contain p-4 group-hover:scale-105 transition-transform duration-500"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
                Görsel yok
              </div>
            )}
          </div>
          
          {/* Product Info */}
          <div>
            <h3 className="text-base font-medium text-neutral-900 mb-1 group-hover:text-neutral-600 transition-colors line-clamp-2">
              {product.name}
            </h3>
            <p className="text-sm text-neutral-500">Varyant seçin</p>
          </div>
        </div>
      </Link>
    );
  }

  const displayVariant = product.variants[0];
  const isOutOfStock = displayVariant?.stock === 0;
  const originalPrice = displayVariant?.originalPrice || displayVariant?.price;
  const hasDiscount = displayVariant?.originalPrice
    ? displayVariant.originalPrice > displayVariant.price
    : false;

  if (viewMode === "list") {
    return (
      <Link href={ROUTES.product(product.slug)} className="group block">
        <div className="flex gap-6 bg-white p-4">
          <div className="relative w-32 h-40 flex-shrink-0 bg-[#F5F5F5]">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-contain p-2"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm">
                Görsel yok
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">
                {product.category}
              </p>
              <h3 className="font-medium text-lg text-neutral-900 group-hover:text-neutral-600 transition-colors mb-2">
                {product.name}
              </h3>
              
              {/* Color variants */}
              <div className="flex items-center gap-1.5 mt-2">
                {colors.slice(0, 4).map((color, i) => (
                  <span
                    key={i}
                    className="w-5 h-5 rounded-full border border-neutral-200"
                    style={{ backgroundColor: color.color }}
                    title={color.name}
                  />
                ))}
              </div>
            </div>
            
            <div className="flex items-center gap-3 mt-3">
              <span className="text-lg font-medium text-neutral-900">
                {formatPrice(displayVariant.price)}
              </span>
              {hasDiscount && (
                <span className="text-sm text-neutral-400 line-through">
                  {formatPrice(originalPrice)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Featured/Promo style (like the iPhone 17 card in reference)
  if (featured) {
    return (
      <Link href={ROUTES.product(product.slug)} className="group block">
        <div className="relative aspect-[3/4] bg-neutral-900 overflow-hidden">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
              sizes="(max-width: 1024px) 100vw, 50vw"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 bg-neutral-800" />
          )}
          
          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          {/* Promo content */}
          <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8">
            <span className="text-xs uppercase tracking-wider text-white/70 mb-2 block">
              Yeni Gelen
            </span>
            <h3 className="text-2xl lg:text-3xl font-medium text-white mb-2">
              {product.name.split(" ").slice(0, 3).join(" ")}
            </h3>
            <p className="text-white/80 text-sm mb-4">
              Daha yeni, daha havalı. Deri ürünleri keşfet.
            </p>
            <span className="text-xl font-medium text-white">
              {formatPrice(displayVariant.price)}
            </span>
          </div>
        </div>
      </Link>
    );
  }

  // Standard Grid Card - Roarcraft Style
  return (
    <Link href={ROUTES.product(product.slug)} className="group block">
      <div className="bg-white">
        {/* Image Container - Light gray background, centered product */}
        <div className="relative aspect-[4/5] bg-[#F5F5F5] mb-4 overflow-hidden">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-contain p-6 lg:p-8 group-hover:scale-105 transition-transform duration-500"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
              Görsel yok
            </div>
          )}

          {/* Badges - Subtle top-right */}
          {(hasDiscount || product.new) && (
            <div className="absolute top-3 right-3">
              {hasDiscount ? (
                <span className="bg-white text-neutral-900 text-xs px-2 py-1 font-medium shadow-sm">
                  İndirim
                </span>
              ) : product.new ? (
                <span className="bg-white text-neutral-900 text-xs px-2 py-1 font-medium shadow-sm">
                  Yeni
                </span>
              ) : null}
            </div>
          )}
          
          {/* Out of stock overlay */}
          {isOutOfStock && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <span className="bg-white text-neutral-900 text-xs px-3 py-1.5 font-medium">
                Stokta Yok
              </span>
            </div>
          )}
        </div>

        {/* Product Info - Clean typography */}
        <div className="space-y-2">
          {/* Product Name */}
          <h3 className="text-[15px] font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-2 leading-snug">
            {product.name}
          </h3>

          {/* Price */}
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-neutral-900">
              {formatPrice(displayVariant.price)}
            </span>
            {hasDiscount && (
              <span className="text-sm text-neutral-400 line-through">
                {formatPrice(originalPrice)}
              </span>
            )}
          </div>

          {/* Color Variants - Small circles */}
          <div className="flex items-center gap-1.5 pt-1">
            {colors.slice(0, 4).map((color, i) => (
              <span
                key={i}
                className={cn(
                  "w-4 h-4 rounded-full border cursor-pointer transition-transform hover:scale-110",
                  i === 0 ? "border-neutral-400" : "border-neutral-200"
                )}
                style={{ backgroundColor: color.color }}
                title={color.name}
              />
            ))}
            {colors.length > 4 && (
              <span className="text-xs text-neutral-400 ml-1">
                +{colors.length - 4}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
