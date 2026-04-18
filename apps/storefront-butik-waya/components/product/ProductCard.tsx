"use client";

import Image from "next/image";
import Link from "next/link";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { ROUTES } from "@/lib/constants";
import { buildLocalizedPath } from "@/lib/i18n";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { formatPrice } from "@/lib/utils";
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
                {"G\u00F6rsel bekleniyor"}
              </div>
            )}
          </div>

          <div className="py-1">
            <div className="flex items-start justify-between gap-4 border-b border-[#E6E0DA] pb-3">
              <h3 className="line-clamp-2 max-w-[22ch] text-[14px] leading-[22px] tracking-[-0.01em] text-[#171311] transition-colors duration-300 group-hover:text-[#4E4640]">
                {product.name}
              </h3>

              {typeof displayPrice === "number" ? (
                <div className="shrink-0 text-right">
                  <div className="text-[0.92rem] font-medium leading-none tracking-[-0.015em] text-[#171311]">
                    {formatPrice(displayPrice)}
                  </div>
                  {originalPrice ? (
                    <div className="mt-1 text-[11px] leading-none text-[#A1978E] line-through">
                      {formatPrice(originalPrice)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link href={productHref} className="group block">
      <article className="h-full">
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
              {"G\u00F6rsel bekleniyor"}
            </div>
          )}
        </div>

        <div className="pt-3">
          <div className="flex items-start justify-between gap-4 border-b border-[#E6E0DA] pb-3">
            <h3 className="line-clamp-2 max-w-[18ch] text-[14px] leading-[22px] tracking-[-0.008em] text-[#171311] transition-colors duration-300 group-hover:text-[#4E4640]">
              {product.name}
            </h3>

            {typeof displayPrice === "number" ? (
              <div className="shrink-0 text-right">
                <div className="text-[0.9rem] font-medium leading-none tracking-[-0.015em] text-[#171311] sm:text-[0.92rem]">
                  {formatPrice(displayPrice)}
                </div>
                {originalPrice ? (
                  <div className="mt-1 text-[10px] leading-none text-[#A1978E] line-through">
                    {formatPrice(originalPrice)}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </article>
    </Link>
  );
}
