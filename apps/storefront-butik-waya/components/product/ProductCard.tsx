"use client";

import { type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { cn, formatPrice } from "@/lib/utils";
import { useWishlist } from "@/lib/wishlist-context";
import { Product } from "@/types/product";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
  cardStyle?: "standard" | "featured";
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

export function ProductCard({
  product,
  viewMode = "grid",
  cardStyle = "standard",
}: ProductCardProps) {
  const { locale } = useStorefrontRoute();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
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
  const isWishlisted = isInWishlist(product.id);
  const isFeatured = cardStyle === "featured";

  const handleWishlistToggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isWishlisted) {
      removeFromWishlist(product.id);
      return;
    }

    addToWishlist(product);
  };

  const titleClassName = cn(
    "text-[#171311] transition-colors duration-300 group-hover:text-[#4a403a]",
    "text-[14px] font-normal leading-[1.35] tracking-[-0.01em]",
    viewMode === "list" ? "line-clamp-2 max-w-[32ch]" : "truncate",
    isFeatured && "text-[14px]",
  );

  const priceMarkup =
    typeof displayPrice === "number" ? (
      <div className="shrink-0 text-right">
        <div
          className={cn(
            "text-[14px] font-normal leading-none tracking-[-0.01em] text-[#171311] tabular-nums",
            isFeatured && "text-[14px]",
          )}
        >
          {formatPrice(displayPrice)}
        </div>
        {originalPrice ? (
          <div className="mt-1 text-[11px] leading-none tracking-[-0.01em] text-[#9e9087] line-through tabular-nums">
            {formatPrice(originalPrice)}
          </div>
        ) : null}
      </div>
    ) : null;

  const wishlistButton = (
    <button
      type="button"
      onClick={handleWishlistToggle}
      aria-label={isWishlisted ? "Favorilerden cikar" : "Favorilere ekle"}
      className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-[rgba(255,255,255,0.88)] text-[#171311] shadow-[0_10px_24px_-18px_rgba(23,19,17,0.5)] backdrop-blur-sm transition-all duration-300 hover:scale-[1.03] hover:bg-white"
    >
      <Heart
        className={cn(
          "h-4 w-4 transition-all duration-300",
          isWishlisted ? "fill-[#171311] text-[#171311]" : "text-[#171311]/78",
        )}
      />
    </button>
  );

  const imageMarkup = (
    <div
      className={cn(
        "relative overflow-hidden bg-[#f3ede7]",
        viewMode === "grid" && isFeatured && "min-h-[24rem] sm:min-h-[30rem]",
      )}
    >
      <Link href={productHref} className="block h-full">
        <div
          className={cn(
            "relative h-full w-full overflow-hidden",
            viewMode === "list" ? "aspect-[4/5]" : "aspect-[4/5]",
          )}
        >
          {primaryImage ? (
            <>
              <Image
                src={primaryImage}
                alt={product.name}
                fill
                className={cn(
                  "object-cover transition duration-700 ease-out",
                  secondaryImage ? "group-hover:scale-[1.015] group-hover:opacity-0" : "group-hover:scale-[1.045]",
                )}
                sizes={
                  viewMode === "list"
                    ? "(max-width: 768px) 100vw, 220px"
                    : isFeatured
                      ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                }
                unoptimized={usesProxiedPrimaryImage}
              />
              {secondaryImage ? (
                <Image
                  src={secondaryImage}
                  alt={product.name}
                  fill
                  className="object-cover opacity-0 transition duration-700 ease-out group-hover:scale-[1.045] group-hover:opacity-100"
                  sizes={
                    viewMode === "list"
                      ? "(max-width: 768px) 100vw, 220px"
                      : isFeatured
                        ? "(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        : "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  }
                  unoptimized={usesProxiedSecondaryImage}
                />
              ) : null}
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm uppercase tracking-[0.14em] text-[#8f8177]">
              Gorsel bekleniyor
            </div>
          )}
        </div>
      </Link>
      {wishlistButton}
    </div>
  );

  if (viewMode === "list") {
    return (
      <article className="group">
        <div className="grid gap-5 sm:grid-cols-[220px_1fr] sm:items-end">
          {imageMarkup}

          <div className="flex min-h-full flex-col justify-end pt-1 sm:pb-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
              <Link href={productHref} className="min-w-0">
                <h3 className={titleClassName}>{product.name}</h3>
              </Link>
              {priceMarkup}
            </div>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex h-full flex-col">
      {imageMarkup}

      <div className="flex flex-1 items-start justify-between gap-4 pt-3">
        <Link href={productHref} className="min-w-0 flex-1">
          <h3 className={titleClassName}>{product.name}</h3>
        </Link>
        {priceMarkup}
      </div>
    </article>
  );
}
