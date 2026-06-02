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

function ProductCardSwatches({
  product,
  align = "center",
}: {
  product: Product;
  align?: "center" | "start";
}) {
  const swatches = getProductCardSwatches(product.variants ?? [], 4);

  if (swatches.length === 0) {
    return null;
  }

  return (
    <div
      className={`mt-2 flex items-center gap-2 ${
        align === "start" ? "justify-start" : "justify-center"
      }`}
    >
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

function ProductCardRating({
  product,
  align = "center",
}: {
  product: Product;
  align?: "center" | "start";
}) {
  const rating = Number(product.rating || 0);

  if (!Number.isFinite(rating) || rating <= 0) {
    return null;
  }

  const filledStars = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <div
      className={`flex items-center gap-0.5 ${
        align === "start" ? "justify-start" : "justify-center"
      }`}
    >
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
  const displayVariant = product.variants?.[0];
  const displayPrice = displayVariant?.price;
  const originalPrice =
    displayVariant?.originalPrice && displayVariant.originalPrice > (displayPrice ?? 0)
      ? displayVariant.originalPrice
      : undefined;
  const productHref = buildLocalizedPath(ROUTES.product(product.slug), locale);
  const discountPercent =
    originalPrice && displayPrice ? Math.round((1 - displayPrice / originalPrice) * 100) : 0;

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block">
        <div className="flex gap-6 rounded-[28px] border border-[#E9DED1] bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] p-4 shadow-[0_24px_60px_-48px_rgba(49,32,14,0.42)] transition-transform duration-300 group-hover:-translate-y-1">
          <div className="relative h-40 w-32 flex-shrink-0 overflow-hidden rounded-[22px] bg-[#F2EBE2]">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-400">
                No image
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {product.featured ? (
                <span className="rounded-full border border-[#D7C3A4] bg-[#FFF7EC] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#8A6847]">
                  Featured
                </span>
              ) : null}
              {discountPercent > 0 ? (
                <span className="rounded-full bg-[#17110B] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white">
                  {discountPercent}% Off
                </span>
              ) : null}
            </div>
            <h3 className="store-product-title text-neutral-900 transition-colors group-hover:text-neutral-600">
              {product.name}
            </h3>
            <div className="mt-2">
              <ProductCardRating product={product} align="start" />
            </div>
            {typeof displayPrice === "number" ? (
              <div className="mt-2 flex items-baseline gap-2">
                {originalPrice ? (
                  <span className="text-xs text-neutral-400 line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
                <p className="text-sm font-semibold text-neutral-900">{formatPrice(displayPrice)}</p>
              </div>
            ) : null}
            <ProductCardSwatches product={product} align="start" />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block h-full">
      <article className="flex h-full flex-col rounded-[28px] border border-[#E9DED1] bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] p-3 shadow-[0_24px_60px_-48px_rgba(49,32,14,0.42)] transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_32px_70px_-46px_rgba(49,32,14,0.5)] sm:p-4">
        <div className="relative mb-4 aspect-square overflow-hidden rounded-[24px] bg-[#F2EBE2]">
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
              No image
            </div>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
            {product.featured ? (
              <span className="rounded-full border border-white/70 bg-white/88 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-[#6D563C] backdrop-blur">
                Featured
              </span>
            ) : (
              <span />
            )}
            {discountPercent > 0 ? (
              <span className="rounded-full bg-[#17110B] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-white shadow-[0_12px_30px_-18px_rgba(23,17,11,0.9)]">
                %{discountPercent}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-[0.24em] text-[#8A6847]">
              Leather collection
            </span>
            <ProductCardRating product={product} />
          </div>

          <h3 className="store-product-title line-clamp-2 text-left text-neutral-900 transition-colors group-hover:text-neutral-600">
            {product.name}
          </h3>

          {typeof displayPrice === "number" ? (
            <div className="mt-3 flex items-baseline gap-2">
              {originalPrice ? (
                <span className="text-xs text-neutral-400 line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : null}
              <p className="text-base font-semibold text-neutral-900">{formatPrice(displayPrice)}</p>
            </div>
          ) : null}

          <div className="mt-auto pt-3">
            <ProductCardSwatches product={product} align="start" />
          </div>
        </div>
      </article>
    </Link>
  );
}
