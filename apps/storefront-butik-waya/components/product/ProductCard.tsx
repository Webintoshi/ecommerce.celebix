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

function ProductCardSwatches({ product }: { product: Product }) {
  const swatches = getProductCardSwatches(product.variants ?? [], 4);

  if (swatches.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      {swatches.map((swatch) => (
        <span
          key={swatch.key}
          title={swatch.value}
          aria-label={swatch.value}
          className="relative h-4 w-4 overflow-hidden rounded-full border border-[rgba(26,26,26,0.16)] bg-white"
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
    <div className="mt-3 flex items-center gap-1 text-[#7D756D]">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={`${product.id}-rating-${index}`}
          className={`h-3.5 w-3.5 ${
            index < filledStars ? "fill-current text-current" : "fill-[#E2DDD8] text-[#E2DDD8]"
          }`}
        />
      ))}
      <span className="ml-1 text-[10px] tracking-[0.12em] text-[#8A827B]">
        {product.reviewCount || 0} yorum
      </span>
    </div>
  );
}

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const { locale } = useStorefrontRoute();
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const secondaryImage = productImages[1];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  const usesProxiedSecondaryImage = secondaryImage
    ? isProxiedStorefrontAssetUrl(secondaryImage)
    : false;
  const displayVariant = product.variants?.[0];
  const displayPrice = displayVariant?.price;
  const originalPrice =
    displayVariant?.originalPrice && displayVariant.originalPrice > (displayPrice ?? 0)
      ? displayVariant.originalPrice
      : undefined;
  const productHref = buildLocalizedPath(ROUTES.product(product.slug), locale);

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block">
        <div className="grid gap-5 sm:grid-cols-[200px_1fr] sm:items-start">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.65rem] bg-[#ECE8E3]">
            {primaryImage ? (
              <>
                <Image
                  src={primaryImage}
                  alt={product.name}
                  fill
                  className={`object-cover transition duration-700 ${
                    secondaryImage ? "group-hover:opacity-0" : "group-hover:scale-[1.03]"
                  }`}
                  unoptimized={usesProxiedPrimaryImage}
                />
                {secondaryImage ? (
                  <Image
                    src={secondaryImage}
                    alt={product.name}
                    fill
                    className="object-cover opacity-0 transition duration-700 group-hover:opacity-100"
                    unoptimized={usesProxiedSecondaryImage}
                  />
                ) : null}
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                Gorsel bekleniyor
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col justify-between py-2">
            <div>
              <h3 className="max-w-[18ch] font-serif text-[1.55rem] leading-[1.04] tracking-[-0.035em] text-[#171311] transition-colors duration-300 group-hover:text-[#4E4640] sm:text-[1.85rem]">
                {product.name}
              </h3>

              {typeof displayPrice === "number" ? (
                <div className="mt-3 flex items-baseline gap-3">
                  <span className="text-[1.05rem] font-semibold tracking-[-0.01em] text-[#171311]">
                    {formatPrice(displayPrice)}
                  </span>
                  {originalPrice ? (
                    <span className="text-sm text-[#9A928A] line-through">
                      {formatPrice(originalPrice)}
                    </span>
                  ) : null}
                </div>
              ) : null}

              <ProductCardRating product={product} />
              <ProductCardSwatches product={product} />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block">
      <article className="h-full">
        <div className="relative aspect-[4/5] overflow-hidden rounded-[1.85rem] bg-[#ECE8E3]">
          {primaryImage ? (
            <>
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className={`object-cover transition duration-700 ${
                  secondaryImage ? "group-hover:opacity-0" : "group-hover:scale-[1.03]"
                }`}
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                unoptimized={usesProxiedPrimaryImage}
              />
              {secondaryImage ? (
                <Image
                  src={secondaryImage}
                  alt={product.name}
                  fill
                  className="object-cover opacity-0 transition duration-700 group-hover:opacity-100"
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  unoptimized={usesProxiedSecondaryImage}
                />
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#ECE8E3] text-sm text-neutral-400">
              Gorsel bekleniyor
            </div>
          )}
        </div>

        <div className="pt-4">
          <h3 className="max-w-[18ch] font-serif text-[1.15rem] leading-[1.08] tracking-[-0.028em] text-[#171311] transition-colors duration-300 group-hover:text-[#4E4640] sm:text-[1.28rem]">
            {product.name}
          </h3>

          {typeof displayPrice === "number" ? (
            <div className="mt-2.5 flex items-baseline gap-2.5">
              <span className="text-[0.98rem] font-semibold tracking-[-0.01em] text-[#171311]">
                {formatPrice(displayPrice)}
              </span>
              {originalPrice ? (
                <span className="text-sm text-[#9A928A] line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : null}
            </div>
          ) : null}

          <ProductCardRating product={product} />
          <ProductCardSwatches product={product} />
        </div>
      </article>
    </Link>
  );
}
