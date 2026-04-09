"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { formatPrice } from "@/lib/utils";
import { getProductCardSwatches } from "@/lib/variant-selection";
import { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
}

function getResolvedProductImages(product: Product) {
  const legacyImagesV2 = Array.isArray(
    (product as Product & { images_v2?: Array<string | { url?: string }> }).images_v2
  )
    ? (
        (product as Product & { images_v2?: Array<string | { url?: string }> }).images_v2 ?? []
      )
        .map((image) => (typeof image === "string" ? image : image?.url ?? ""))
        .filter((image) => image.length > 0)
    : [];

  return (
    Array.isArray(product.images) && product.images.length > 0 ? product.images : legacyImagesV2
  )
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter((image) => image.length > 0);
}

function ProductCardSwatches({ product }: { product: Product }) {
  const swatches = getProductCardSwatches(product.variants ?? [], 4);

  if (swatches.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex items-center justify-center gap-2">
      {swatches.map((swatch) => (
        <span
          key={swatch.key}
          title={swatch.value}
          aria-label={swatch.value}
          className="relative h-4 w-4 overflow-hidden rounded-full border border-neutral-300 bg-neutral-100"
        >
          {swatch.image_url ? (
            <img
              src={resolveStorefrontAssetUrl(swatch.image_url)}
              alt={swatch.value}
              className="h-full w-full object-cover"
            />
          ) : swatch.color_code ? (
            <span className="block h-full w-full" style={{ backgroundColor: swatch.color_code }} />
          ) : (
            <span className="block h-full w-full bg-neutral-200" />
          )}
        </span>
      ))}
    </div>
  );
}

function ProductCardRating({ product }: { product: Product }) {
  const rating = Number(product.rating || 0);

  if (!Number.isFinite(rating) || rating <= 0) {
    return null;
  }

  const filledStars = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <div className="mt-2 flex items-center justify-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={`${product.id}-rating-${index}`}
          className={`h-3.5 w-3.5 ${
            index < filledStars
              ? "fill-[#8A6B37] text-[#8A6B37]"
              : "fill-neutral-200 text-neutral-200"
          }`}
        />
      ))}
    </div>
  );
}

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const { locale } = useStorefrontRoute();
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  const displayPrice = product.variants?.[0]?.price;
  const productHref = buildLocalizedPath(ROUTES.product(product.slug), locale);

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block">
        <div className="flex gap-6 bg-white p-4">
          <div className="relative h-40 w-32 flex-shrink-0 overflow-hidden">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-cover"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-400">
                Gorsel yok
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <h3 className="store-product-title text-neutral-900 transition-colors group-hover:text-neutral-600">
              {product.name}
            </h3>
            <ProductCardRating product={product} />
            {typeof displayPrice === "number" ? (
              <p className="mt-1 text-sm font-medium text-neutral-900">{formatPrice(displayPrice)}</p>
            ) : null}
            <ProductCardSwatches product={product} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block">
      <div className="relative mb-3 aspect-square overflow-hidden bg-neutral-100">
        {primaryImage ? (
          <Image
            src={primaryImage}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            unoptimized={usesProxiedPrimaryImage}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-sm text-neutral-400">
            Gorsel yok
          </div>
        )}
      </div>

      <h3 className="store-product-title line-clamp-2 text-center text-neutral-900 transition-colors group-hover:text-neutral-600">
        {product.name}
      </h3>

      <ProductCardRating product={product} />

      {typeof displayPrice === "number" ? (
        <p className="mt-1 text-center text-sm font-medium text-neutral-900">{formatPrice(displayPrice)}</p>
      ) : null}

      <ProductCardSwatches product={product} />
    </Link>
  );
}
