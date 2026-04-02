"use client";

import Link from "next/link";
import Image from "next/image";
import { Product } from "@/types/product";
import { ROUTES } from "@/lib/constants";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
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

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);

  if (viewMode === "list") {
    return (
      <Link href={ROUTES.product(product.slug)} className="group block">
        <div className="flex gap-6 bg-white p-4">
          <div className="relative w-32 h-40 flex-shrink-0 overflow-hidden">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-cover"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-neutral-400 text-sm bg-neutral-100">
                Görsel yok
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <h3 className="store-product-title text-neutral-900 group-hover:text-neutral-600 transition-colors">
              {product.name}
            </h3>
          </div>
        </div>
      </Link>
    );
  }

  // Minimal Grid Card - Only image + title
  return (
    <Link href={ROUTES.product(product.slug)} className="group block">
      {/* Image Container - No background, no padding */}
      <div className="relative aspect-square mb-3 overflow-hidden bg-neutral-100">
        {primaryImage ? (
          <Image
            src={primaryImage}
            alt={product.name}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-500"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            unoptimized={usesProxiedPrimaryImage}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm bg-neutral-100">
            Görsel yok
          </div>
        )}
      </div>

      {/* Product Name - Centered */}
      <h3 className="store-product-title text-neutral-900 group-hover:text-neutral-600 transition-colors line-clamp-2 text-center">
        {product.name}
      </h3>

      {/* Product Price - Centered */}
      {product.variants && product.variants.length > 0 && (
        <p className="mt-1 text-sm font-medium text-neutral-900 text-center">
          {product.variants[0].price} ₺
        </p>
      )}
    </Link>
  );
}
