"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, Ruler, ShoppingBag, Star } from "lucide-react";
import { toast } from "sonner";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { useCart } from "@/lib/cart-context";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { formatPrice } from "@/lib/utils";
import {
  getOrderedVariantAttributeGroups,
  getProductCardSwatches,
} from "@/lib/variant-selection";
import { useWishlist } from "@/lib/wishlist-context";
import type { Product, ProductVariant } from "@/types/product";

interface ProductCardProps {
  product: Product;
  index?: number;
  viewMode?: "grid" | "list";
}

type SizeOption = {
  key: string;
  label: string;
  variant: ProductVariant;
  stock: number;
};

function getResolvedProductImages(product: Product) {
  const imagesV2 = Array.isArray(product.imagesV2)
    ? product.imagesV2
        .map((image) => image?.url ?? "")
        .filter((image) => image.length > 0)
    : [];
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
    Array.isArray(product.images) && product.images.length > 0
      ? product.images
      : imagesV2.length > 0
        ? imagesV2
        : legacyImagesV2
  )
    .map((image) => resolveStorefrontAssetUrl(image))
    .filter((image) => image.length > 0);
}

function formatCategoryLabel(value?: string | null) {
  return String(value || "Alpler Spor")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1))
    .join(" ");
}

function getDisplayVariant(product: Product) {
  const variants = product.variants || [];
  const inStockVariant = variants
    .filter((variant) => typeof variant.price === "number" && Number(variant.stock || 0) > 0)
    .sort((left, right) => left.price - right.price)[0];

  return (
    inStockVariant ||
    variants
      .filter((variant) => typeof variant.price === "number")
      .sort((left, right) => left.price - right.price)[0]
  );
}

function isSizeLikeGroupName(name: string) {
  const normalized = name.toLocaleLowerCase("tr-TR");
  return (
    normalized.includes("beden") ||
    normalized.includes("numara") ||
    normalized.includes("size") ||
    normalized.includes("shoe") ||
    normalized.includes("ayakkabi")
  );
}

function isColorLikeGroupName(name: string) {
  const normalized = name.toLocaleLowerCase("tr-TR");
  return (
    normalized.includes("renk") ||
    normalized.includes("color") ||
    normalized.includes("rengi")
  );
}

function isLikelySizeValue(value?: string | null) {
  const normalized = String(value || "").trim().toLocaleLowerCase("tr-TR");
  return (
    /^\d{2}(?:[.,]5)?$/.test(normalized) ||
    /^(xs|s|m|l|xl|xxl|xxxl)$/.test(normalized) ||
    normalized.includes("beden") ||
    normalized.includes("numara")
  );
}

function getSizeOptions(product: Product): SizeOption[] {
  const variants = product.variants || [];
  if (variants.length < 2) return [];

  const groups = getOrderedVariantAttributeGroups(variants);
  const sizeGroup =
    groups.find((group) => isSizeLikeGroupName(group.name)) ||
    groups.find(
      (group) =>
        !isColorLikeGroupName(group.name) &&
        group.values.some((value) => isLikelySizeValue(value.value)),
    );

  if (sizeGroup && sizeGroup.values.length > 1) {
    const seenLabels = new Set<string>();
    return sizeGroup.values
      .map((value) => {
        const variant = variants[value.variantIndex];
        if (!variant || seenLabels.has(value.value)) return null;
        seenLabels.add(value.value);
        return {
          key: value.key,
          label: value.value,
          variant,
          stock: Number(variant.stock || 0),
        };
      })
      .filter((option): option is SizeOption => Boolean(option))
      .slice(0, 6);
  }

  const namedVariants = variants.filter(
    (variant) => variant.name && !/^default$/i.test(String(variant.name)),
  );

  if (
    namedVariants.length < 2 ||
    namedVariants.length > 6 ||
    !namedVariants.every((variant) => isLikelySizeValue(variant.name))
  ) {
    return [];
  }

  return namedVariants.map((variant) => ({
    key: variant.id,
    label: variant.name,
    variant,
    stock: Number(variant.stock || 0),
  }));
}

function ProductCardSwatches({ product }: { product: Product }) {
  const swatches = getProductCardSwatches(product.variants ?? [], 4);

  if (swatches.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5" aria-label="Renk seçenekleri">
      {swatches.map((swatch) => (
        <span
          key={swatch.key}
          title={swatch.value}
          aria-label={swatch.value}
          className="relative h-4 w-4 overflow-hidden rounded-full border border-[#D1D5DB] bg-[#EEF2F7] ring-2 ring-white"
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
            <span className="block h-full w-full bg-[#E5E7EB]" />
          )}
        </span>
      ))}
    </div>
  );
}

function ProductCardRating({ product }: { product: Product }) {
  const rating = Number(product.rating || 0);
  if (!Number.isFinite(rating) || rating <= 0) return null;

  const filledStars = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={`${product.id}-rating-${index}`}
          className={`h-3.5 w-3.5 ${
            index < filledStars
              ? "fill-[#F59E0B] text-[#F59E0B]"
              : "fill-[#E5E7EB] text-[#E5E7EB]"
          }`}
        />
      ))}
    </div>
  );
}

function ProductBadges({
  product,
  discountPercent,
  stock,
  isOutOfStock,
}: {
  product: Product;
  discountPercent: number;
  stock: number;
  isOutOfStock: boolean;
}) {
  const badges: Array<{ label: string; className: string }> = [];

  if (isOutOfStock) {
    badges.push({
      label: "Tükendi",
      className: "bg-[#E5E7EB] text-[#6B7280]",
    });
  } else if (discountPercent > 0) {
    badges.push({
      label: `%${discountPercent} İndirim`,
      className: "bg-[#FFF1E8] text-[#EA580C]",
    });
  }

  if (product.new) {
    badges.push({
      label: "Yeni",
      className: "bg-[#DCFCE7] text-[#15803D]",
    });
  }

  if (product.isBestseller) {
    badges.push({
      label: "Çok Satan",
      className: "bg-[#FEF3C7] text-[#D97706]",
    });
  }

  if (!isOutOfStock && stock > 0 && stock <= 5) {
    badges.push({
      label: "Sınırlı Stok",
      className: "bg-[#FFF7ED] text-[#EA580C]",
    });
  }

  return (
    <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-4rem)] flex-wrap gap-1.5">
      {badges.slice(0, 3).map((badge) => (
        <span
          key={badge.label}
          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] shadow-sm ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}

function ProductMetaLine({ product }: { product: Product }) {
  const pieces = [
    product.subcategory ? formatCategoryLabel(product.subcategory) : formatCategoryLabel(product.category),
    product.tags?.[0],
  ].filter(Boolean);

  if (pieces.length === 0) return null;

  return (
    <p className="line-clamp-1 text-[11px] font-medium leading-4 text-[#6B7280] sm:text-[12px]">
      {pieces.join(" / ")}
    </p>
  );
}

function StockLine({ stock, isOutOfStock }: { stock: number; isOutOfStock: boolean }) {
  if (isOutOfStock) {
    return (
      <div className="flex items-center gap-2 text-xs font-bold text-[#6B7280]">
        <span className="h-2 w-2 rounded-full bg-[#9CA3AF]" />
        Tükendi
      </div>
    );
  }

  if (stock > 0 && stock <= 5) {
    return (
      <div className="flex items-center gap-2 text-xs font-bold text-[#EA580C]">
        <span className="h-2 w-2 rounded-full bg-[#F97316]" />
        Son {stock} ürün
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs font-bold text-[#15803D]">
      <span className="h-2 w-2 rounded-full bg-[#16A34A]" />
      Stokta
    </div>
  );
}

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { buildPath } = useStorefrontRoute();
  const [selectedSizeKey, setSelectedSizeKey] = useState<string | null>(null);

  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const secondaryImage = productImages[1];
  const usesProxiedPrimaryImage = primaryImage
    ? isProxiedStorefrontAssetUrl(primaryImage)
    : false;
  const displayVariant = getDisplayVariant(product);
  const sizeOptions = getSizeOptions(product);
  const selectedSizeOption = sizeOptions.find((option) => option.key === selectedSizeKey);
  const selectedVariant = selectedSizeOption?.variant || displayVariant;
  const displayPrice = selectedVariant?.price ?? displayVariant?.price;
  const originalPrice =
    selectedVariant?.originalPrice && selectedVariant.originalPrice > (displayPrice ?? 0)
      ? selectedVariant.originalPrice
      : displayVariant?.originalPrice && displayVariant.originalPrice > (displayPrice ?? 0)
        ? displayVariant.originalPrice
        : undefined;
  const productHref = buildPath(ROUTES.product(product.slug));
  const discountPercent = originalPrice && displayPrice
    ? Math.round((1 - displayPrice / originalPrice) * 100)
    : 0;
  const totalStock = (product.variants || []).reduce(
    (sum, variant) => sum + Math.max(0, Number(variant.stock || 0)),
    0,
  );
  const activeStock = Number(selectedVariant?.stock ?? displayVariant?.stock ?? totalStock ?? 0);
  const isOutOfStock = (product.variants || []).length > 0
    ? product.variants.every((variant) => Number(variant.stock || 0) <= 0)
    : true;
  const wishlisted = isInWishlist(product.id);
  const canQuickAddSingleVariant = Boolean(
    displayVariant && !isOutOfStock && (product.variants || []).length === 1,
  );
  const canQuickAddSelectedSize = Boolean(
    selectedSizeOption && selectedSizeOption.stock > 0 && selectedSizeOption.variant,
  );
  const canQuickAdd = canQuickAddSingleVariant || canQuickAddSelectedSize;

  const toggleWishlist = () => {
    if (wishlisted) {
      removeFromWishlist(product.id);
      toast("Favorilerden çıkarıldı");
      return;
    }

    addToWishlist(product);
    toast.success("Favorilere eklendi");
  };

  const handleQuickAdd = () => {
    if (isOutOfStock) return;

    if (sizeOptions.length > 0 && !selectedSizeOption) {
      toast.error("Lütfen beden seçin");
      return;
    }

    const variantToAdd = selectedSizeOption?.variant || displayVariant;
    if (!variantToAdd || Number(variantToAdd.stock || 0) <= 0) {
      toast.error("Bu seçenek stokta yok");
      return;
    }

    addToCart(product, variantToAdd, 1);
    toast.success("Sepete eklendi");
  };

  const favoriteButton = (
    <button
      type="button"
      onClick={toggleWishlist}
      className={`absolute right-3 top-3 z-20 flex h-11 w-11 items-center justify-center rounded-full border bg-white/95 shadow-[0_10px_24px_rgba(15,23,42,0.12)] backdrop-blur transition hover:scale-105 focus:outline-none focus:ring-4 focus:ring-[#FF6A00]/20 active:scale-95 ${
        wishlisted
          ? "border-[#FF6A00]/30 text-[#FF6A00]"
          : "border-white/80 text-[#374151] hover:text-[#FF6A00]"
      }`}
      aria-label={wishlisted ? "Favorilerden çıkar" : "Favorilere ekle"}
    >
      <Heart className={`h-5 w-5 ${wishlisted ? "fill-current" : ""}`} />
    </button>
  );

  const imageBlock = (
    <Link
      href={productHref}
      className="group/image relative block aspect-square overflow-hidden rounded-[1.3rem] bg-[#F8FAFC]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(255,106,0,0.10),transparent_32%),linear-gradient(180deg,#FFFFFF_0%,#EEF2F7_100%)]" />
      {primaryImage ? (
        <>
          <Image
            src={primaryImage}
            alt={product.name}
            fill
            className="p-3.5 object-contain transition duration-500 group-hover/image:scale-[1.03] sm:p-4"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={usesProxiedPrimaryImage}
          />
          {secondaryImage ? (
            <img
              src={secondaryImage}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-contain p-3.5 opacity-0 transition duration-500 group-hover/image:opacity-100 sm:p-4"
              loading="lazy"
            />
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#9CA3AF]">
          Görsel yok
        </div>
      )}
    </Link>
  );

  if (viewMode === "list") {
    return (
      <article className="group rounded-[1.5rem] border border-[#E5E7EB] bg-white p-[14px] shadow-sm transition hover:-translate-y-0.5 hover:border-[#FF6A00]/35 hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-4">
        <div className="flex gap-3.5 sm:gap-4">
          <div className="relative h-36 w-32 flex-shrink-0 sm:h-44 sm:w-40">
            {imageBlock}
            <ProductBadges
              product={product}
              discountPercent={discountPercent}
              stock={activeStock}
              isOutOfStock={isOutOfStock}
            />
            {favoriteButton}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <Link href={productHref} className="store-product-title text-[#111827] transition-colors hover:text-[#FF6A00]">
              {product.name}
            </Link>
            <ProductMetaLine product={product} />
            <div className="flex items-center justify-between gap-3">
              <ProductCardRating product={product} />
              <StockLine stock={activeStock} isOutOfStock={isOutOfStock} />
            </div>
            {typeof displayPrice === "number" ? (
              <div className="flex items-baseline gap-2">
                <p className={`text-lg font-black ${originalPrice ? "text-[#F97316]" : "text-[#111827]"}`}>
                  {formatPrice(displayPrice)}
                </p>
                {originalPrice ? (
                  <span className="text-sm font-semibold text-[#9CA3AF] line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
              </div>
            ) : null}
            <ProductCardSwatches product={product} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-[#E5E7EB] bg-white p-[14px] shadow-[0_8px_28px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-1 hover:border-[#FF6A00]/45 hover:shadow-[0_22px_60px_rgba(15,23,42,0.14)] sm:p-4">
      <div className="relative">
        {imageBlock}
        <ProductBadges
          product={product}
          discountPercent={discountPercent}
          stock={activeStock}
          isOutOfStock={isOutOfStock}
        />
        {favoriteButton}
      </div>

      <div className="flex flex-1 flex-col px-0.5 pb-0.5 pt-3">
        <div className="mb-1.5 flex min-h-4 items-center justify-end">
          <ProductCardSwatches product={product} />
        </div>

        <Link href={productHref}>
          <h3 className="line-clamp-2 min-h-[2.35em] text-[15px] font-black leading-[1.16] tracking-[-0.01em] text-[#111827] transition-colors group-hover:text-[#FF6A00] sm:text-base">
            {product.name}
          </h3>
        </Link>

        <div className="mt-1 min-h-4">
          <ProductMetaLine product={product} />
        </div>

        <div className="mt-1.5 flex min-h-5 items-center justify-between gap-2">
          <ProductCardRating product={product} />
          <StockLine stock={activeStock} isOutOfStock={isOutOfStock} />
        </div>

        {typeof displayPrice === "number" ? (
          <div className="mt-2 flex flex-wrap items-end gap-x-2 gap-y-0.5">
            <p className={`text-[19px] font-black leading-none sm:text-[21px] ${originalPrice ? "text-[#F97316]" : "text-[#111827]"}`}>
              {formatPrice(displayPrice)}
            </p>
            {originalPrice ? (
              <span className="text-xs font-bold text-[#9CA3AF] line-through sm:text-sm">
                {formatPrice(originalPrice)}
              </span>
            ) : null}
          </div>
        ) : null}

        {sizeOptions.length > 0 ? (
          <div className="mt-3 rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#374151]">
                Beden
              </span>
              <Link
                href={productHref}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FF6A00]"
              >
                <Ruler className="h-3.5 w-3.5" />
                Rehber
              </Link>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
              {sizeOptions.map((option) => {
                const isSelected = selectedSizeKey === option.key;
                const isDisabled = option.stock <= 0;

                return (
                  <button
                    key={option.key}
                    type="button"
                    disabled={isDisabled}
                    onClick={() => setSelectedSizeKey(option.key)}
                    className={`min-h-[2.2rem] min-w-[2.2rem] rounded-xl border px-2 text-[11px] font-black transition focus:outline-none focus:ring-4 focus:ring-[#FF6A00]/20 ${
                      isSelected
                        ? "border-[#FF6A00] bg-[#FF6A00] text-white"
                        : isDisabled
                          ? "cursor-not-allowed border-[#E5E7EB] bg-white text-[#9CA3AF] line-through"
                          : "border-[#E5E7EB] bg-white text-[#111827] hover:border-[#FF6A00] hover:text-[#FF6A00]"
                    }`}
                    aria-label={`${option.label} beden${isDisabled ? " stokta yok" : ""}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="mt-auto pt-3">
          {isOutOfStock ? (
            <button
              type="button"
              disabled
              className="flex h-11 w-full cursor-not-allowed items-center justify-center rounded-2xl bg-[#E5E7EB] px-3 text-xs font-black uppercase tracking-[0.08em] text-[#6B7280]"
            >
              Tükendi
            </button>
          ) : canQuickAdd || sizeOptions.length > 0 ? (
            <button
              type="button"
              onClick={handleQuickAdd}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#FF6A00] px-3 text-xs font-black uppercase tracking-[0.08em] text-white shadow-[0_12px_24px_rgba(255,106,0,0.24)] transition hover:bg-[#E85F00] active:scale-[0.98]"
            >
              <ShoppingBag className="h-4 w-4" />
              Sepete Ekle
            </button>
          ) : (
            <Link
              href={productHref}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[#111827] px-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#1F2937]"
            >
              Beden Seç
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
