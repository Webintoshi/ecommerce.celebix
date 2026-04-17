"use client";

import type { MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Star } from "lucide-react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { useWishlist } from "@/lib/wishlist-context";
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

function getDiscountPercentage(originalPrice?: number, displayPrice?: number) {
  if (
    typeof originalPrice !== "number" ||
    typeof displayPrice !== "number" ||
    originalPrice <= displayPrice ||
    originalPrice <= 0
  ) {
    return null;
  }

  return Math.round(((originalPrice - displayPrice) / originalPrice) * 100);
}

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const { locale } = useStorefrontRoute();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
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
  const discountPercentage = getDiscountPercentage(originalPrice, displayPrice);
  const isWishlisted = isInWishlist(product.id);

  const handleWishlist = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isWishlisted) {
      removeFromWishlist(product.id);
      return;
    }

    addToWishlist(product);
  };

  if (viewMode === "list") {
    return (
      <Link
        href={productHref}
        className="group grid gap-5 rounded-[28px] border border-[var(--store-border)] bg-white p-4 shadow-[var(--store-shadow-soft)] transition hover:border-[var(--store-accent)] hover:shadow-[0_24px_55px_rgba(80,94,113,0.14)] sm:grid-cols-[160px_minmax(0,1fr)]"
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
    <div className="group relative">
      <button
        type="button"
        onClick={handleWishlist}
        aria-label={isWishlisted ? "Favorilerden kald\u0131r" : "Favorilere ekle"}
        className="absolute right-4 top-4 z-20 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--store-border-strong)] bg-white/95 text-[var(--store-ink)] shadow-[0_14px_30px_rgba(80,94,113,0.12)] transition hover:border-[var(--store-accent)] hover:text-[var(--store-accent)]"
      >
        <Heart className={`h-5 w-5 ${isWishlisted ? "fill-[var(--store-accent)] text-[var(--store-accent)]" : ""}`} />
      </button>

      <Link
        href={productHref}
        className="block rounded-[32px] bg-white px-4 pb-5 pt-4 shadow-[0_16px_40px_rgba(80,94,113,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(80,94,113,0.12)]"
      >
        <div className="relative mb-5 aspect-square overflow-hidden rounded-[28px] bg-white">
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={product.name}
              fill
              className="object-contain p-4 transition duration-500 group-hover:scale-[1.03] sm:p-5"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              unoptimized={usesProxiedPrimaryImage}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--store-muted)]">
              {"G\u00f6rsel yok"}
            </div>
          )}
        </div>

        <h3 className="store-product-title mx-auto min-h-[3.6rem] max-w-[18ch] line-clamp-2 text-center text-[var(--store-ink)] transition group-hover:text-[var(--store-accent)]">
          {product.name}
        </h3>

        <div className="mt-4 flex min-h-[44px] items-end justify-center gap-2.5">
          {discountPercentage ? (
            <span className="inline-flex h-8 min-w-[54px] items-center justify-center rounded-full bg-[var(--store-accent)] px-3 text-sm font-semibold text-white">
              %{discountPercentage}
            </span>
          ) : null}

          <div className="flex items-end gap-2">
            {originalPrice ? (
              <span className="pb-0.5 text-sm text-[var(--store-muted)] line-through">
                {formatPrice(originalPrice)}
              </span>
            ) : null}
            <p className="text-[1.95rem] font-semibold leading-none tracking-[-0.03em] text-[var(--store-ink)]">
              {typeof displayPrice === "number" ? formatPrice(displayPrice) : "Bilgi al"}
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}
