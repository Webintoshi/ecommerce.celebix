"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Star } from "lucide-react";
import {
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";
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
    ? (((product as Product & { images_v2?: Array<string | { url?: string }> }).images_v2 ?? [])
        .map((image) => (typeof image === "string" ? image : image?.url ?? ""))
        .filter((image) => image.length > 0))
    : [];

  return (
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : legacyImagesV2
  )
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter((image) => image.length > 0);
}

function humanizeValue(value?: string | null) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatVariantWeight(value: unknown, unit?: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/[a-zA-Z]/.test(raw)) {
    return raw;
  }

  if (unit) {
    return `${raw} ${unit}`;
  }

  return `${raw} g`;
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
          className="relative h-4 w-4 overflow-hidden rounded-full border border-[rgba(36,25,21,0.1)] bg-[rgba(36,25,21,0.05)]"
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
            <span className="block h-full w-full bg-[rgba(36,25,21,0.08)]" />
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
    <div className="mt-3 flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={`${product.id}-rating-${index}`}
          className={`h-3.5 w-3.5 ${
            index < filledStars
              ? "fill-[var(--hazelnut)] text-[var(--hazelnut)]"
              : "fill-[rgba(36,25,21,0.08)] text-[rgba(36,25,21,0.08)]"
          }`}
        />
      ))}
      <span className="ml-2 text-xs uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
        {product.reviewCount || 0}
      </span>
    </div>
  );
}

function ProductBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/18 bg-[rgba(32,22,17,0.76)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
      {label}
    </span>
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
  const weightLabel = formatVariantWeight(displayVariant?.weight, displayVariant?.unit);
  const productHref = buildLocalizedPath(ROUTES.product(product.slug), locale);
  const descriptor =
    product.shortDescription ||
    humanizeValue(product.subcategory) ||
    humanizeValue(product.category);
  const topLabel = humanizeValue(product.category) || "Ezmeo secimi";
  const statusLabel = product.new ? "Yeni" : product.featured ? "One cikan" : null;

  if (viewMode === "list") {
    return (
      <Link href={productHref} className="group block h-full">
        <article className="flex h-full flex-col overflow-hidden rounded-[1.7rem] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-1 md:p-4">
          <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
            <div className="relative aspect-[1/1.08] overflow-hidden rounded-[1.35rem] bg-[var(--background-strong)]">
              {primaryImage ? (
                <Image
                  src={primaryImage}
                  alt={product.name}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, 12rem"
                  unoptimized={usesProxiedPrimaryImage}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
                  Gorsel yok
                </div>
              )}

              {statusLabel ? (
                <div className="absolute left-3 top-3">
                  <ProductBadge label={statusLabel} />
                </div>
              ) : null}
            </div>

            <div className="flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                  <span>{topLabel}</span>
                  {weightLabel ? <span>{weightLabel}</span> : null}
                </div>
                <h3 className="store-product-title mt-3 text-xl text-[var(--foreground)] md:text-2xl">
                  {product.name}
                </h3>
                <p className="mt-3 line-clamp-2 text-sm leading-7 text-[var(--muted-foreground)] md:text-base">
                  {descriptor}
                </p>
                <ProductCardRating product={product} />
                <ProductCardSwatches product={product} />
              </div>

              <div className="mt-6 flex items-end justify-between gap-4 border-t border-[var(--border)] pt-5">
                <div className="flex items-baseline gap-2">
                  {originalPrice ? (
                    <span className="text-sm text-[var(--muted-foreground)] line-through">
                      {formatPrice(originalPrice)}
                    </span>
                  ) : null}
                  {typeof displayPrice === "number" ? (
                    <span className="text-lg font-semibold text-[var(--foreground)] md:text-xl">
                      {formatPrice(displayPrice)}
                    </span>
                  ) : null}
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">
                  Incele
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block h-full">
      <article className="flex h-full flex-col overflow-hidden rounded-[1.7rem] border border-[var(--border)] bg-[var(--card)] p-3 shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-1 md:p-4">
        <div className="relative aspect-[1/1.08] overflow-hidden rounded-[1.35rem] bg-[var(--background-strong)]">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 25vw"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted-foreground)]">
              Gorsel yok
            </div>
          )}

          {statusLabel ? (
            <div className="absolute left-3 top-3">
              <ProductBadge label={statusLabel} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-1 flex-col px-1 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
            <span>{topLabel}</span>
            {weightLabel ? <span>{weightLabel}</span> : null}
          </div>

          <h3 className="store-product-title mt-3 text-[1.12rem] text-[var(--foreground)] md:text-[1.24rem]">
            {product.name}
          </h3>
          <p className="mt-3 line-clamp-2 text-sm leading-7 text-[var(--muted-foreground)]">
            {descriptor}
          </p>

          <ProductCardRating product={product} />
          <ProductCardSwatches product={product} />

          <div className="mt-auto flex items-end justify-between gap-4 border-t border-[var(--border)] pt-5">
            <div className="flex items-baseline gap-2">
              {originalPrice ? (
                <span className="text-sm text-[var(--muted-foreground)] line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : null}
              {typeof displayPrice === "number" ? (
                <span className="text-lg font-semibold text-[var(--foreground)] md:text-xl">
                  {formatPrice(displayPrice)}
                </span>
              ) : null}
            </div>

            <span className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">
              Incele
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
