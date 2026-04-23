"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
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
    <div className="mt-2 flex items-center gap-2">
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
    <div className="mt-2 flex items-center gap-0.5">
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

function formatCategoryLabel(value?: string | null) {
  return String(value || "Alpler Spor")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const { buildPath } = useStorefrontRoute();
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  const displayVariant = [...(product.variants || [])]
    .filter((variant) => typeof variant.price === "number")
    .sort((left, right) => left.price - right.price)[0];
  const displayPrice = displayVariant?.price;
  const originalPrice =
    displayVariant?.originalPrice && displayVariant.originalPrice > (displayPrice ?? 0)
      ? displayVariant.originalPrice
      : undefined;
  const productHref = buildPath(ROUTES.product(product.slug));
  const discountPercent = originalPrice && displayPrice
    ? Math.round((1 - displayPrice / originalPrice) * 100)
    : 0;
  const isOutOfStock = product.variants?.every((variant) => Number(variant.stock || 0) <= 0);

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block">
        <div className="flex gap-4 border border-black/5 bg-white p-3 transition-colors hover:border-[#173D32]/25 sm:gap-6 sm:p-4">
          <div className="relative h-32 w-28 flex-shrink-0 overflow-hidden bg-[#EEF2EA] sm:h-40 sm:w-32">
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
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#66746B]">
              {formatCategoryLabel(product.category)}
            </p>
            <h3 className="store-product-title text-neutral-950 transition-colors group-hover:text-[#173D32]">
              {product.name}
            </h3>
            <ProductCardRating product={product} />
            {typeof displayPrice === "number" ? (
              <div className="mt-1 flex items-baseline gap-2">
                {originalPrice ? (
                  <span className="text-xs text-neutral-400 line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
                <p className="text-sm font-semibold text-neutral-900">{formatPrice(displayPrice)}</p>
              </div>
            ) : null}
            <ProductCardSwatches product={product} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block">
      <div className="relative mb-3 aspect-[4/5] overflow-hidden bg-[#EEF2EA]">
        {primaryImage ? (
          <Image
            src={primaryImage}
            alt={product.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={usesProxiedPrimaryImage}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 text-sm text-neutral-400">
            Gorsel yok
          </div>
        )}
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {product.new ? (
            <span className="bg-white/92 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#173D32] backdrop-blur">
              Yeni
            </span>
          ) : null}
          {discountPercent > 0 ? (
            <span className="bg-[#F26A21] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
              %{discountPercent}
            </span>
          ) : null}
          {isOutOfStock ? (
            <span className="bg-neutral-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
              Tukendi
            </span>
          ) : null}
        </div>
      </div>

      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#66746B]">
        {formatCategoryLabel(product.category)}
      </p>

      <h3 className="store-product-title line-clamp-2 text-neutral-950 transition-colors group-hover:text-[#173D32]">
        {product.name}
      </h3>

      <ProductCardRating product={product} />

      {typeof displayPrice === "number" ? (
        <div className="mt-2 flex items-baseline gap-2">
          {originalPrice ? (
            <span className="text-xs text-neutral-400 line-through">
              {formatPrice(originalPrice)}
            </span>
          ) : null}
          <p className="text-[15px] font-bold text-neutral-950">{formatPrice(displayPrice)}</p>
        </div>
      ) : null}

      <ProductCardSwatches product={product} />
    </Link>
  );
}
