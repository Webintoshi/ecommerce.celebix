"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { toast } from "sonner";
import { isProxiedStorefrontAssetUrl, resolveStorefrontAssetUrl } from "@/lib/asset-url";
import { useCart } from "@/lib/cart-context";
import { ROUTES } from "@/lib/constants";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { formatPrice } from "@/lib/utils";
import { getProductCardSwatches } from "@/lib/variant-selection";
import { useWishlist } from "@/lib/wishlist-context";
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

  if (swatches.length === 0) return null;

  return (
    <div className="mt-2 flex items-center gap-2">
      {swatches.map((swatch) => (
        <span
          key={swatch.key}
          title={swatch.value}
          aria-label={swatch.value}
          className="relative h-4 w-4 overflow-hidden rounded-full border border-[#D1D5DB] bg-[#EEF2F7]"
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
    <div className="mt-2 flex items-center gap-0.5">
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

export function ProductCard({ product, viewMode = "grid" }: ProductCardProps) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { buildPath } = useStorefrontRoute();
  const productImages = getResolvedProductImages(product);
  const primaryImage = productImages[0];
  const secondaryImage = productImages[1];
  const usesProxiedPrimaryImage = isProxiedStorefrontAssetUrl(primaryImage);
  const displayVariant = getDisplayVariant(product);
  const displayPrice = displayVariant?.price;
  const originalPrice =
    displayVariant?.originalPrice && displayVariant.originalPrice > (displayPrice ?? 0)
      ? displayVariant.originalPrice
      : undefined;
  const productHref = buildPath(ROUTES.product(product.slug));
  const discountPercent = originalPrice && displayPrice
    ? Math.round((1 - displayPrice / originalPrice) * 100)
    : 0;
  const isOutOfStock = (product.variants || []).length > 0
    ? product.variants.every((variant) => Number(variant.stock || 0) <= 0)
    : true;
  const quickAddAllowed = Boolean(displayVariant && !isOutOfStock && (product.variants || []).length === 1);
  const wishlisted = isInWishlist(product.id);

  const toggleWishlist = () => {
    if (wishlisted) {
      removeFromWishlist(product.id);
      toast("Favorilerden cikarildi");
      return;
    }

    addToWishlist(product);
    toast.success("Favorilere eklendi");
  };

  const handleQuickAdd = () => {
    if (!displayVariant || isOutOfStock) return;
    addToCart(product, displayVariant, 1);
    toast.success("Sepete eklendi");
  };

  const imageBlock = (
    <Link href={productHref} className="group/image relative block aspect-[4/5] overflow-hidden rounded-[1.35rem] bg-[#EEF2F7]">
      {primaryImage ? (
        <>
          <Image
            src={primaryImage}
            alt={product.name}
            fill
            className="object-cover transition duration-500 group-hover/image:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            unoptimized={usesProxiedPrimaryImage}
          />
          {secondaryImage ? (
            <img
              src={secondaryImage}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover/image:opacity-100"
              loading="lazy"
            />
          ) : null}
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-[#9CA3AF]">
          Gorsel yok
        </div>
      )}

      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        {product.new ? (
          <span className="rounded-full bg-[#DBEAFE] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D4ED8]">
            Yeni
          </span>
        ) : null}
        {discountPercent > 0 ? (
          <span className="rounded-full bg-[#FEE2E2] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#DC2626]">
            %{discountPercent}
          </span>
        ) : null}
        {isOutOfStock ? (
          <span className="rounded-full bg-[#E5E7EB] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280]">
            Tukendi
          </span>
        ) : displayVariant && Number(displayVariant.stock || 0) <= 5 ? (
          <span className="rounded-full bg-[#FFF7ED] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#EA580C]">
            Sinirli Stok
          </span>
        ) : null}
      </div>
    </Link>
  );

  const favoriteButton = (
    <button
      type="button"
      onClick={toggleWishlist}
      className={`absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/90 shadow-sm backdrop-blur transition active:scale-95 ${
        wishlisted ? "text-[#EF4444]" : "text-[#111827] hover:text-[#EF4444]"
      }`}
      aria-label={wishlisted ? "Favorilerden cikar" : "Favorilere ekle"}
    >
      <Heart className={`h-5 w-5 ${wishlisted ? "fill-current" : ""}`} />
    </button>
  );

  if (viewMode === "list") {
    return (
      <article className="group rounded-[1.5rem] border border-[#E5E7EB] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-[#FF6A00]/35 hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <div className="flex gap-4 sm:gap-5">
          <div className="relative h-32 w-28 flex-shrink-0 sm:h-40 sm:w-32">
            {imageBlock}
            {favoriteButton}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
              {formatCategoryLabel(product.category)}
            </p>
            <Link href={productHref} className="store-product-title text-[#111827] transition-colors hover:text-[#FF6A00]">
              {product.name}
            </Link>
            <ProductCardRating product={product} />
            {typeof displayPrice === "number" ? (
              <div className="mt-2 flex items-baseline gap-2">
                {originalPrice ? (
                  <span className="text-xs text-[#9CA3AF] line-through">
                    {formatPrice(originalPrice)}
                  </span>
                ) : null}
                <p className={`text-base font-black ${originalPrice ? "text-[#DC2626]" : "text-[#111827]"}`}>
                  {formatPrice(displayPrice)}
                </p>
              </div>
            ) : null}
            <ProductCardSwatches product={product} />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative rounded-[1.5rem] border border-[#E5E7EB] bg-white p-2.5 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-[#FF6A00]/35 hover:shadow-[0_18px_45px_rgba(15,23,42,0.09)]">
      <div className="relative">
        {imageBlock}
        {favoriteButton}
      </div>

      <div className="px-1 pb-1 pt-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#6B7280]">
          {formatCategoryLabel(product.category)}
        </p>

        <Link href={productHref}>
          <h3 className="store-product-title line-clamp-2 min-h-[2.4em] text-[#111827] transition-colors group-hover:text-[#FF6A00]">
            {product.name}
          </h3>
        </Link>

        <ProductCardRating product={product} />

        {typeof displayPrice === "number" ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <p className={`text-[17px] font-black leading-none ${originalPrice ? "text-[#DC2626]" : "text-[#111827]"}`}>
              {formatPrice(displayPrice)}
            </p>
            {originalPrice ? (
              <span className="text-xs font-semibold text-[#9CA3AF] line-through">
                {formatPrice(originalPrice)}
              </span>
            ) : null}
          </div>
        ) : null}

        <ProductCardSwatches product={product} />

        <div className="mt-4">
          {quickAddAllowed ? (
            <button
              type="button"
              onClick={handleQuickAdd}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#FF6A00] px-3 text-xs font-black uppercase tracking-[0.08em] text-white transition hover:bg-[#E85F00] active:scale-[0.98]"
            >
              <ShoppingBag className="h-4 w-4" />
              Sepete Ekle
            </button>
          ) : (
            <Link
              href={productHref}
              className={`flex h-10 w-full items-center justify-center gap-2 rounded-full px-3 text-xs font-black uppercase tracking-[0.08em] transition ${
                isOutOfStock
                  ? "bg-[#E5E7EB] text-[#6B7280]"
                  : "bg-[#111827] text-white hover:bg-[#1F2937]"
              }`}
            >
              {isOutOfStock ? "Tukendi" : "Beden Sec"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
