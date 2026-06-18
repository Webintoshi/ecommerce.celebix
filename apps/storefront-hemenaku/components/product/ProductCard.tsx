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
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";
import { getProductPlaceholder } from "@/lib/default-demo-theme";

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
              ? "fill-[#FACC15] text-[#FACC15]"
              : "fill-neutral-200 text-neutral-200"
          }`}
        />
      ))}
    </div>
  );
}

export function ProductCard({ product, index = 0, viewMode = "grid" }: ProductCardProps) {
  const { buildPath } = useStorefrontRoute();
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  const displayVariant = product.variants?.[0];
  const displayPrice = displayVariant?.price;
  const priceLabel = typeof displayPrice === "number" ? formatPrice(displayPrice) : "Fiyat bilgisi yakinda";
  const stockLabel =
    typeof displayVariant?.stock === "number"
      ? displayVariant.stock > 0
        ? "Stokta"
        : "Stok bilgisi yakinda"
      : "Secenekler yakinda";
  const originalPrice =
    displayVariant?.originalPrice && displayVariant.originalPrice > (displayPrice ?? 0)
      ? displayVariant.originalPrice
      : undefined;
  const productHref = buildPath(ROUTES.product(product.slug));
  const productName = product.name?.trim() || "Hemenaku ürünü";

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22C55E]">
        <div className="flex gap-4 rounded-lg border border-[#D7DEE8] bg-white p-4 shadow-sm transition group-hover:-translate-y-0.5 group-hover:border-[#94A3B8] group-hover:shadow-md sm:gap-6">
          <div className="relative h-36 w-28 flex-shrink-0 overflow-hidden rounded-lg bg-[#EEF2F7] sm:h-40 sm:w-32">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={productName}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <DefaultDemoPlaceholder id={getProductPlaceholder(index)} label={productName} compact />
            )}
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <p className="mb-2 text-[11px] font-semibold uppercase text-[#166534]">{stockLabel}</p>
            <h3 className="store-product-title text-[#0B1220] transition-colors group-hover:text-[#166534]">
              {productName}
            </h3>
            <ProductCardRating product={product} />
            <div className="mt-1 flex items-baseline gap-2">
              {originalPrice ? (
                <span className="text-xs text-neutral-400 line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : null}
              <p className="text-sm font-semibold text-[#0B1220]">{priceLabel}</p>
            </div>
            <ProductCardSwatches product={product} />
            <span className="mt-4 inline-flex w-fit rounded-lg bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white transition group-hover:bg-[#1E293B]">
              Ürünü incele
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={productHref}
      className="group block h-full rounded-lg border border-[#D7DEE8] bg-white p-2 shadow-sm transition hover:-translate-y-0.5 hover:border-[#94A3B8] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22C55E]"
    >
      <div className="relative mb-3 aspect-square overflow-hidden rounded-md bg-[#EEF2F7]">
        <div className="absolute left-2 top-2 z-10 rounded-md bg-white/92 px-2.5 py-1 text-[10px] font-semibold text-[#166534] shadow-sm">
          {stockLabel}
        </div>
        {primaryImage ? (
          <Image
            src={primaryImage}
            alt={productName}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            unoptimized={usesProxiedPrimaryImage}
          />
        ) : (
          <DefaultDemoPlaceholder
            id={getProductPlaceholder(index)}
            label={productName}
            compact
            className="absolute inset-0"
          />
        )}
      </div>

      <div className="flex min-h-[148px] flex-col px-1 pb-2 text-center">
      <h3 className="store-product-title line-clamp-2 text-[#0B1220] transition-colors group-hover:text-[#166534]">
        {productName}
      </h3>

      <ProductCardRating product={product} />

      <div className="mt-1 flex items-baseline justify-center gap-2">
        {originalPrice ? (
          <span className="text-xs text-neutral-400 line-through">
            {formatPrice(originalPrice)}
          </span>
        ) : null}
        <p className="text-sm font-semibold text-[#0B1220]">{priceLabel}</p>
      </div>

      <ProductCardSwatches product={product} />
        <span className="mt-auto inline-flex w-full items-center justify-center rounded-lg border border-[#D7DEE8] bg-[#F8FAFC] px-3 py-2 text-xs font-semibold text-[#0B1220] transition group-hover:border-[#22C55E] group-hover:text-[#166534]">
          Ürünü İncele
        </span>
      </div>
    </Link>
  );
}
