"use client";

import Link from "next/link";
import Image from "next/image";
import { Product } from "@/types/product";
import { ROUTES } from "@/lib/constants";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface PremiumProductCardProps {
  product: Product;
  variant?: "hero" | "standard";
  index?: number;
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

  return (
    <Link href={ROUTES.product(product.slug)} className="group block">
      {/* Image Container - No border, no shadow, no padding - Clean like the reference */}
      <div className="relative aspect-square mb-4 overflow-hidden bg-transparent">
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

      {/* Product Name - Below image, simple and clean */}
      <h3 className="text-sm sm:text-base font-medium text-neutral-900 group-hover:text-neutral-600 transition-colors text-center leading-snug">
        {product.name}
      </h3>
    </Link>
  );
}
