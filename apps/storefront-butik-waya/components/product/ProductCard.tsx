"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
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
    <div className="mt-4 flex items-center gap-2">
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
    <div className="mt-4 flex items-center gap-1 text-[#7D756D]">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={`${product.id}-rating-${index}`}
          className={`h-3.5 w-3.5 ${
            index < filledStars ? "fill-current text-current" : "fill-[#E2DDD8] text-[#E2DDD8]"
          }`}
        />
      ))}
      <span className="ml-1 text-[11px] uppercase tracking-[0.18em] text-[#7A736D]">
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
  const productLabel = product.category || product.subcategory || "Secili urun";

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block">
        <div className="grid gap-5 rounded-[2rem] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.9)] p-4 shadow-[0_24px_70px_-54px_rgba(0,0,0,0.26)] sm:grid-cols-[200px_1fr] sm:p-5">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.55rem] bg-[#ECE8E3]">
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

          <div className="flex flex-1 flex-col justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">{productLabel}</p>
              <h3 className="mt-3 font-serif text-[2.2rem] leading-[0.92] tracking-[-0.045em] text-[#000000]">
                {product.name}
              </h3>
              {product.shortDescription ? (
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#655E58] line-clamp-2">
                  {product.shortDescription}
                </p>
              ) : null}
              <ProductCardRating product={product} />
              <ProductCardSwatches product={product} />
            </div>

            {typeof displayPrice === "number" ? (
              <div className="mt-6 flex items-end justify-between gap-4 border-t border-[rgba(26,26,26,0.08)] pt-5">
                <div className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">Fiyat</span>
                  <div className="mt-2 flex items-baseline gap-3">
                    <span className="text-[1.15rem] font-semibold text-[#000000]">
                      {formatPrice(displayPrice)}
                    </span>
                    {originalPrice ? (
                      <span className="text-sm text-[#9A928A] line-through">
                        {formatPrice(originalPrice)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#6B645E]">
                  Urunu incele
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block">
      <article className="h-full overflow-hidden rounded-[2rem] border border-[rgba(26,26,26,0.08)] bg-[rgba(255,255,255,0.92)] shadow-[0_26px_70px_-54px_rgba(0,0,0,0.24)]">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#ECE8E3]">
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

        <div className="flex h-full flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">
              {productLabel}
            </span>
            {product.new ? (
              <span className="rounded-full border border-[rgba(26,26,26,0.1)] bg-[#F7F5F2] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#000000]">
                Yeni sezon
              </span>
            ) : null}
            {originalPrice ? (
              <span className="rounded-full border border-[rgba(26,26,26,0.08)] bg-white px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#6B645E]">
                Fiyat avantaji
              </span>
            ) : null}
          </div>

          <h3 className="mt-4 font-serif text-[2rem] leading-[0.92] tracking-[-0.045em] text-[#000000]">
            {product.name}
          </h3>

          {product.shortDescription ? (
            <p className="mt-3 line-clamp-2 text-sm leading-7 text-[#655E58]">
              {product.shortDescription}
            </p>
          ) : null}

          <ProductCardRating product={product} />
          <ProductCardSwatches product={product} />

          {typeof displayPrice === "number" ? (
            <div className="mt-6 flex items-end justify-between gap-4 border-t border-[rgba(26,26,26,0.08)] pt-5">
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">Fiyat</span>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-[1.15rem] font-semibold text-[#000000]">
                    {formatPrice(displayPrice)}
                  </span>
                  {originalPrice ? (
                    <span className="text-sm text-[#9A928A] line-through">
                      {formatPrice(originalPrice)}
                    </span>
                  ) : null}
                </div>
              </div>
              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#6B645E] transition-transform duration-300 group-hover:translate-x-1">
                Urunu incele
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
