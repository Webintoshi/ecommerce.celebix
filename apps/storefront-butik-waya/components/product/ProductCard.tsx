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
          className="relative h-4 w-4 overflow-hidden rounded-full border border-[rgba(35,24,21,0.18)] bg-white"
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
    <div className="mt-3 flex items-center gap-1 text-[#b9785a]">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={`${product.id}-rating-${index}`}
          className={`h-3.5 w-3.5 ${
            index < filledStars ? "fill-current text-current" : "fill-[#eadfd5] text-[#eadfd5]"
          }`}
        />
      ))}
      <span className="ml-1 text-[11px] uppercase tracking-[0.2em] text-[#7f6d62]">
        {product.reviewCount || 0} note
      </span>
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
  const productLabel = product.category || product.subcategory || "Waya Edit";

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block">
        <div className="grid gap-5 rounded-[2rem] border border-[rgba(35,24,21,0.08)] bg-[rgba(255,250,244,0.88)] p-4 shadow-[0_24px_70px_-50px_rgba(27,18,14,0.55)] sm:grid-cols-[180px_1fr] sm:p-5">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[1.5rem] bg-[#eadfd5]">
            {primaryImage ? (
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                unoptimized={usesProxiedPrimaryImage}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                Gorsel yok
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-[#8d644d]">{productLabel}</p>
              <h3 className="mt-3 font-serif text-3xl leading-[0.95] tracking-[-0.04em] text-[#1d1715]">
                {product.name}
              </h3>
              {product.shortDescription ? (
                <p className="mt-3 max-w-2xl text-sm leading-7 text-[#5f524a] line-clamp-2">
                  {product.shortDescription}
                </p>
              ) : null}
              <ProductCardRating product={product} />
              <ProductCardSwatches product={product} />
            </div>

            {typeof displayPrice === "number" ? (
              <div className="mt-5 flex items-end justify-between gap-4">
                <div className="flex items-baseline gap-3">
                  <span className="text-xl font-semibold text-[#1d1715]">{formatPrice(displayPrice)}</span>
                  {originalPrice ? (
                    <span className="text-sm text-[#9b8a80] line-through">
                      {formatPrice(originalPrice)}
                    </span>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#8d644d]">
                  Detaya git
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
      <article className="overflow-hidden rounded-[2rem] border border-[rgba(35,24,21,0.08)] bg-[rgba(255,250,244,0.88)] shadow-[0_24px_70px_-50px_rgba(27,18,14,0.55)]">
        <div className="relative aspect-[4/5] overflow-hidden bg-[#eadfd5]">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#eadfd5] text-sm text-neutral-400">
              Gorsel yok
            </div>
          )}

          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(20,12,10,0.03),transparent_38%,rgba(20,12,10,0.24))]" />

          <div className="absolute left-4 top-4 inline-flex items-center rounded-full border border-white/20 bg-white/70 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[#1d1715] backdrop-blur">
            {productLabel}
          </div>

          <div className="absolute right-4 top-4 flex gap-2">
            {product.new ? (
              <span className="rounded-full bg-[#1d1715] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white">
                Yeni
              </span>
            ) : null}
            {originalPrice ? (
              <span className="rounded-full bg-[#b9785a] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white">
                Indirim
              </span>
            ) : null}
          </div>
        </div>

        <div className="p-5">
          <h3 className="font-serif text-[1.9rem] leading-[0.95] tracking-[-0.04em] text-[#1d1715]">
            {product.name}
          </h3>
          {product.shortDescription ? (
            <p className="mt-3 line-clamp-2 text-sm leading-7 text-[#5f524a]">
              {product.shortDescription}
            </p>
          ) : null}

          <ProductCardRating product={product} />
          <ProductCardSwatches product={product} />

          {typeof displayPrice === "number" ? (
            <div className="mt-5 flex items-end justify-between gap-4 border-t border-[rgba(35,24,21,0.08)] pt-4">
              <div className="flex flex-col">
                <span className="text-[11px] uppercase tracking-[0.24em] text-[#8d644d]">Waya price</span>
                <div className="mt-2 flex items-baseline gap-3">
                  <span className="text-xl font-semibold text-[#1d1715]">{formatPrice(displayPrice)}</span>
                  {originalPrice ? (
                    <span className="text-sm text-[#9b8a80] line-through">
                      {formatPrice(originalPrice)}
                    </span>
                  ) : null}
                </div>
              </div>

              <span className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#8d644d] transition-transform duration-300 group-hover:translate-x-1">
                Detayi ac
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
