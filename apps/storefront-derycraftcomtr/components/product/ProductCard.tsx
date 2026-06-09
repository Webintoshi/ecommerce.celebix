"use client";

import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { cn, formatPrice } from "@/lib/utils";
import { getProductCardSwatches } from "@/lib/variant-selection";
import { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
}

function getResolvedProductImages(product: Product) {
  const legacyImagesV2 = Array.isArray(
    (product as Product & { images_v2?: Array<string | { url?: string }> }).images_v2,
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

const MAX_VISIBLE_SWATCHES = 3;

function ProductCardSwatches({ product, className }: { product: Product; className?: string }) {
  const allSwatches = getProductCardSwatches(product.variants ?? [], 24);
  const visibleSwatches = allSwatches.slice(0, MAX_VISIBLE_SWATCHES);
  const showMoreIndicator = allSwatches.length >= 4;

  if (allSwatches.length === 0) {
    return null;
  }

  return (
    <div className={cn("mt-2.5 flex items-center justify-center gap-1.5", className)}>
      {visibleSwatches.map((swatch) => (
        <span
          key={swatch.key}
          title={swatch.value}
          aria-label={swatch.value}
          className="relative h-3.5 w-3.5 overflow-hidden rounded-full sm:h-4 sm:w-4"
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
            <span className="block h-full w-full bg-neutral-300" />
          )}
        </span>
      ))}
      {showMoreIndicator ? (
        <span
          className="font-sans text-[10px] font-medium tracking-wide text-neutral-500"
          aria-label={`${allSwatches.length} renk seçeneği`}
        >
          4+
        </span>
      ) : null}
    </div>
  );
}

function ProductCardRating({ product, className }: { product: Product; className?: string }) {
  const rating = Number(product.rating || 0);

  if (!Number.isFinite(rating) || rating <= 0) {
    return null;
  }

  const filledStars = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <div className={cn("mt-2 flex items-center justify-center gap-0.5", className)}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={`${product.id}-rating-${index}`}
          className={cn(
            "h-3 w-3 sm:h-3.5 sm:w-3.5",
            index < filledStars
              ? "fill-[#8B6914] text-[#8B6914]"
              : "fill-neutral-200 text-neutral-200",
          )}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function ProductCardPrice({
  displayPrice,
  originalPrice,
  align = "center",
}: {
  displayPrice?: number;
  originalPrice?: number;
  align?: "center" | "start";
}) {
  if (typeof displayPrice !== "number") {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap items-baseline gap-2",
        align === "center" ? "justify-center" : "justify-start",
      )}
    >
      {originalPrice ? (
        <span className="font-serif text-xs text-neutral-400 line-through">{formatPrice(originalPrice)}</span>
      ) : null}
      <p className="font-serif text-[11px] font-normal text-neutral-700 sm:text-[12px]">{formatPrice(displayPrice)}</p>
    </div>
  );
}

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const { buildPath } = useStorefrontRoute();
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  const displayVariant = product.variants?.[0];
  const displayPrice = displayVariant?.price;
  const originalPrice =
    displayVariant?.originalPrice && displayVariant.originalPrice > (displayPrice ?? 0)
      ? displayVariant.originalPrice
      : undefined;
  const productHref = buildPath(ROUTES.product(product.slug));

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block">
        <div className="flex gap-5 bg-white p-4 sm:gap-6 sm:p-5">
          <div className="relative h-36 w-28 shrink-0 overflow-hidden sm:h-40 sm:w-32">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-contain p-1.5 transition-transform duration-700 group-hover:scale-[1.03]"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-50 text-sm text-neutral-400">
                Görsel yok
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <h3 className="font-serif text-[11px] font-normal leading-[1.4] text-neutral-800 transition-colors group-hover:text-neutral-600 sm:text-[12px]">
              {product.name}
            </h3>
            <ProductCardRating product={product} className="justify-start" />
            <ProductCardPrice
              displayPrice={displayPrice}
              originalPrice={originalPrice}
              align="start"
            />
            <ProductCardSwatches product={product} className="justify-start" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block h-full">
      <article className="flex h-full flex-col">
        <div className="relative mb-3 aspect-[4/5] overflow-hidden sm:mb-4 sm:aspect-square">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-contain p-2 transition-transform duration-700 ease-out group-hover:scale-[1.03] sm:p-3"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-neutral-400">
              Görsel yok
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col items-center px-0.5 text-center">
          <h3 className="line-clamp-2 font-serif text-[10px] font-normal leading-[1.45] text-neutral-800 transition-colors group-hover:text-neutral-600 sm:text-[11px]">
            {product.name}
          </h3>

          <ProductCardPrice displayPrice={displayPrice} originalPrice={originalPrice} />

          <ProductCardRating product={product} />

          <ProductCardSwatches product={product} />
        </div>
      </article>
    </Link>
  );
}
