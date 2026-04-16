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
import { BadgePill } from "./BadgePill";

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
          className="relative h-4 w-4 overflow-hidden rounded-full border border-[var(--store-border-strong)] bg-[var(--store-surface-alt)]"
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
            <span className="block h-full w-full bg-[var(--store-surface-alt)]" />
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

  return (
    <div className="mt-2 flex items-center gap-2 text-sm text-[var(--store-ink-soft)]">
      <span className="inline-flex items-center gap-1 text-[var(--store-accent)]">
        <Star className="h-4 w-4 fill-current" />
        <span className="font-semibold">{rating.toFixed(1)}</span>
      </span>
      {product.reviewCount ? <span>({product.reviewCount})</span> : null}
    </div>
  );
}

function ProductCardBadges({ product, hasDiscount }: { product: Product; hasDiscount: boolean }) {
  const badges = [
    product.new ? { label: "Yeni", tone: "solid" as const } : null,
    product.isBestseller ? { label: "\u00c7ok Satan", tone: "soft" as const } : null,
    product.featured ? { label: "Se\u00e7ili", tone: "outline" as const } : null,
    hasDiscount ? { label: "\u0130ndirim", tone: "soft" as const } : null,
  ].filter(Boolean) as Array<{ label: string; tone: "soft" | "solid" | "outline" }>;

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
      {badges.slice(0, 3).map((badge) => (
        <BadgePill key={badge.label} tone={badge.tone}>
          {badge.label}
        </BadgePill>
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
  const hasDiscount = Boolean(originalPrice && displayPrice && originalPrice > displayPrice);
  const productHref = buildLocalizedPath(ROUTES.product(product.slug), locale);
  const categoryLabel = product.category || "\u00c7i\u00e7ek";

  if (viewMode === "list") {
    return (
      <Link
        href={productHref}
        className="group grid gap-5 rounded-[28px] border border-[var(--store-border)] bg-white p-4 shadow-[var(--store-shadow-soft)] transition hover:border-[var(--store-accent)] hover:shadow-[0_24px_55px_rgba(61,37,29,0.12)] sm:grid-cols-[160px_minmax(0,1fr)]"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] bg-[var(--store-surface-alt)]">
          <ProductCardBadges product={product} hasDiscount={hasDiscount} />
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-cover transition duration-700 group-hover:scale-[1.04]"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--store-muted)]">
              {"G\u00f6rsel yok"}
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
              {categoryLabel}
            </p>
            <h3 className="store-product-title mt-2 text-[var(--store-ink)] transition group-hover:text-[var(--store-accent)]">
              {product.name}
            </h3>
            {product.shortDescription ? (
              <p className="mt-3 line-clamp-2 text-sm leading-7 text-[var(--store-ink-soft)]">
                {product.shortDescription}
              </p>
            ) : null}
            <ProductCardRating product={product} />
          </div>

          <div className="mt-5">
            <div className="flex items-end gap-2">
              <p className="text-xl font-semibold text-[var(--store-accent)]">
                {typeof displayPrice === "number" ? formatPrice(displayPrice) : "Bilgi al"}
              </p>
              {originalPrice ? (
                <span className="pb-0.5 text-sm text-[var(--store-muted)] line-through">
                  {formatPrice(originalPrice)}
                </span>
              ) : null}
            </div>
            <ProductCardSwatches product={product} />
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={productHref}
      className="group block rounded-[28px] border border-[var(--store-border)] bg-white p-3 shadow-[var(--store-shadow-soft)] transition hover:-translate-y-0.5 hover:border-[var(--store-accent)] hover:shadow-[0_24px_55px_rgba(61,37,29,0.12)]"
    >
      <div className="relative overflow-hidden rounded-[22px] bg-[var(--store-surface-alt)]">
        <ProductCardBadges product={product} hasDiscount={hasDiscount} />
        <div className="relative aspect-[4/5]">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-cover transition duration-700 group-hover:scale-[1.04]"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--store-muted)]">
              {"G\u00f6rsel yok"}
            </div>
          )}
        </div>
      </div>

      <div className="px-1 pb-1 pt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--store-muted)]">
          {categoryLabel}
        </p>
        <h3 className="store-product-title mt-2 line-clamp-2 text-[var(--store-ink)] transition group-hover:text-[var(--store-accent)]">
          {product.name}
        </h3>
        <ProductCardRating product={product} />

        <div className="mt-3 flex items-end gap-2">
          <p className="text-lg font-semibold text-[var(--store-accent)]">
            {typeof displayPrice === "number" ? formatPrice(displayPrice) : "Bilgi al"}
          </p>
          {originalPrice ? (
            <span className="pb-0.5 text-sm text-[var(--store-muted)] line-through">
              {formatPrice(originalPrice)}
            </span>
          ) : null}
        </div>

        <ProductCardSwatches product={product} />
      </div>
    </Link>
  );
}
