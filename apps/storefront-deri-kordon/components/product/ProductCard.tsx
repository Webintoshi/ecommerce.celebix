"use client";

import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
import { Product } from "@/types/product";
import { formatPrice } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { cn } from "@/lib/utils";
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
  const { addToCart } = useCart();
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);

  if (!product.variants || product.variants.length === 0) {
    return (
      <Link href={ROUTES.product(product.slug)} className="group block">
        <div className="bg-white border border-neutral-200 hover:border-neutral-400 transition-colors">
          <div className="relative aspect-square bg-neutral-100">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
                Görsel yok
              </div>
            )}
          </div>
          <div className="p-4">
            <h3 className="font-medium text-neutral-900 mb-1 group-hover:text-neutral-600 transition-colors">
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

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isOutOfStock) {
      addToCart(product, displayVariant, 1);
    }
  };

  if (viewMode === "list") {
    return (
      <Link href={ROUTES.product(product.slug)} className="group block">
        <div className="flex gap-6 bg-white border border-neutral-200 hover:border-neutral-400 transition-colors p-4">
          <div className="relative w-32 h-32 flex-shrink-0 bg-neutral-100">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-cover"
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
              {product.rating > 0 && (
                <div className="flex items-center gap-1">
                  <Star className="w-3 h-3 fill-neutral-900 text-neutral-900" />
                  <span className="text-sm text-neutral-600">{product.rating}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
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

  return (
    <Link href={ROUTES.product(product.slug)} className="group block">
      <div className="bg-white">
        <div className="relative aspect-square bg-neutral-100 mb-4 overflow-hidden">
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
            <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
              Görsel yok
            </div>
          )}

          {hasDiscount && (
            <span className="absolute top-3 left-3 bg-neutral-900 text-white text-xs px-2 py-1">
              İndirim
            </span>
          )}
          {product.new && !hasDiscount && (
            <span className="absolute top-3 left-3 bg-neutral-600 text-white text-xs px-2 py-1">
              Yeni
            </span>
          )}
        </div>

        <div>
          <h3 className="font-medium text-neutral-900 mb-1 group-hover:text-neutral-600 transition-colors">
            {product.name}
          </h3>

          {product.rating > 0 && (
            <div className="flex items-center gap-1 mb-2">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    "w-3 h-3",
                    i < Math.floor(product.rating)
                      ? "fill-neutral-900 text-neutral-900"
                      : "fill-neutral-200 text-neutral-200"
                  )}
                />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="font-medium text-neutral-900">
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
