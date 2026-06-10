"use client";

import Image from "next/image";
import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Star,
  Heart,
  Share2,
  Minus,
  Plus,
  ArrowLeft,
  ChevronRight,
} from "lucide-react";
import {
  isProxiedStorefrontAssetUrl,
  resolveStorefrontAssetUrl,
} from "@/lib/asset-url";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { PersonalizationPreview } from "@/components/product/PersonalizationPreview";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { ProductTrustStrip } from "@/components/product/ProductTrustStrip";
import { ProductPdpTrustAccordions } from "@/components/product/ProductPdpTrustAccordions";
import {
  DynamicCustomizationForm,
  type CustomizationSelectionState,
} from "@/components/product/dynamic-customization-form";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { ProductGroupDisplayGroup } from "@/lib/products";
import { Product } from "@/types/product";
import {
  CustomizationSchema,
  CustomizationStep,
} from "@/types/product-customization";
import { formatPrice } from "@/lib/utils";

const ProductCard = React.lazy(() =>
  import("@/components/product/ProductCard").then((mod) => ({
    default: mod.ProductCard,
  })),
);

type ResolvedCustomizationSchema = CustomizationSchema & {
  steps: CustomizationStep[];
};

function createEmptyCustomizationState(
  basePrice: number,
): CustomizationSelectionState {
  return {
    payload: null,
    extraPrice: 0,
    finalPrice: basePrice,
    isValid: true,
    hasSelections: false,
  };
}

async function fetchAssignedSchema(productId: string) {
  const response = await fetch(
    "/api/customization/schema?productId=" + encodeURIComponent(productId),
    {
      cache: "no-store",
    },
  );
  const payload = await response.json();

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Ekstra şeması yüklenemedi");
  }

  return (payload.schema as ResolvedCustomizationSchema | null) || null;
}

interface ProductDetailClientProps {
  slug: string;
  initialProduct: Product | null;
  initialRelatedProducts?: Product[];
  groupedProducts?: ProductGroupDisplayGroup[];
  initialVariantIndex?: number;
}

export function ProductDetailClient({
  slug,
  initialProduct,
  initialRelatedProducts = [],
  groupedProducts = [],
  initialVariantIndex = 0,
}: ProductDetailClientProps) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>(
    initialRelatedProducts,
  );
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const [selectedVariant, setSelectedVariant] = useState(initialVariantIndex);
  const [quantity, setQuantity] = useState(1);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [activeSchema, setActiveSchema] =
    useState<ResolvedCustomizationSchema | null>(null);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);
  const [customizationState, setCustomizationState] =
    useState<CustomizationSelectionState>(
      createEmptyCustomizationState(
        initialProduct?.variants?.[initialVariantIndex]?.price ||
          initialProduct?.variants?.[0]?.price ||
          0,
      ),
    );
  const [customizationValidationNonce, setCustomizationValidationNonce] =
    useState(0);

  const extrasSectionRef = React.useRef<HTMLDivElement | null>(null);

  const { addToCart } = useCart();
  const { locale, buildPath } = useStorefrontRoute();

  useEffect(() => {
    setProduct(initialProduct);
    setLoading(!initialProduct);
  }, [initialProduct]);

  useEffect(() => {
    setRelatedProducts(initialRelatedProducts);
  }, [initialRelatedProducts]);

  const visibleGroupedProducts = React.useMemo(
    () =>
      groupedProducts
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item, index, items) =>
              item.productId !== product?.id &&
              items.findIndex((entry) => entry.productId === item.productId) === index,
          ),
        }))
        .filter((group) => group.items.length > 0),
    [groupedProducts, product?.id],
  );

  useEffect(() => {
    setSelectedVariant(initialVariantIndex);
    setQuantity(1);
  }, [initialVariantIndex, initialProduct?.id]);

  useEffect(() => {
    if (typeof window !== "undefined" && product) {
      const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
      setIsWishlisted(wishlist.includes(product.id));
    }
  }, [product]);

  useEffect(() => {
    if (product?.category) {
      setIsLoadingRelated(true);
      fetch(
        `/api/products?category=${product.category}&limit=8&locale=${locale}`,
      )
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.products) {
            const filtered = data.products.filter(
              (p: Product) => p.slug !== slug,
            );
            setRelatedProducts(filtered.slice(0, 4));
          }
        })
        .finally(() => setIsLoadingRelated(false));
    }
  }, [locale, product?.category, slug]);

  useEffect(() => {
    if (!product?.id) return;

    let mounted = true;
    const loadActiveSchema = async () => {
      setIsSchemaLoading(true);
      try {
        const resolvedSchema = await fetchAssignedSchema(product.id);
        if (mounted) {
          setActiveSchema(resolvedSchema || null);
        }
      } catch (error) {
        console.error("Schema assignment load error:", error);
        if (mounted) setActiveSchema(null);
      } finally {
        if (mounted) setIsSchemaLoading(false);
      }
    };

    loadActiveSchema();
    return () => {
      mounted = false;
    };
  }, [product?.id, product?.category, product?.subcategory]);

  const variants = product?.variants || [];
  const variant = variants[selectedVariant] || variants[0];

  useEffect(() => {
    setCustomizationState(createEmptyCustomizationState(variant?.price || 0));
    setCustomizationValidationNonce(0);
  }, [activeSchema?.id, variant?.id, variant?.price]);

  const displayImages = React.useMemo(() => {
    const baseImages = product?.images || [];

    if (variant?.images && variant.images.length > 0) {
      const variantImages = variant.images.filter(
        (img: string) => img && img.length > 0,
      );
      if (variantImages.length > 0) {
        const combined = [...variantImages];
        baseImages.forEach((img: string) => {
          if (!combined.includes(img)) combined.push(img);
        });
        return combined;
      }
    }

    return baseImages;
  }, [product?.images, variant?.images]);

  if (loading || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
        <div className="animate-pulse text-center">
          <div className="mb-4 h-8 w-48 rounded bg-neutral-200" />
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#F8F8F8]">
        <div className="text-center">
          <p className="text-neutral-500">Ürün bilgisi yüklenemedi.</p>
        </div>
      </div>
    );
  }

  const discountPercent = variant.originalPrice
    ? Math.round((1 - variant.price / variant.originalPrice) * 100)
    : 0;

  const isOutOfStock = variant.stock <= 0;

  const handleAddToCart = () => {
    if (isOutOfStock || isSchemaLoading) return;

    if (activeSchema && !customizationState.isValid) {
      setCustomizationValidationNonce((prev) => prev + 1);
      extrasSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }

    addToCart(product, variant, quantity, customizationState.payload || undefined);
  };

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) =>
      Math.max(1, Math.min(variant.stock || 10, prev + delta)),
    );
  };

  const toggleWishlist = () => {
    const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    const newWishlist = isWishlisted
      ? wishlist.filter((id: string) => id !== product.id)
      : [...wishlist, product.id];
    localStorage.setItem("wishlist", JSON.stringify(newWishlist));
    setIsWishlisted(!isWishlisted);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: product.shortDescription,
        url: window.location.href,
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  const getStockStatus = () => {
    if (isOutOfStock) return { text: "Tükendi", color: "text-neutral-400" };
    if (variant.stock <= 5) {
      return { text: `Son ${variant.stock} adet`, color: "text-amber-600" };
    }
    return { text: "Stokta var", color: "text-neutral-500" };
  };

  const stockStatus = getStockStatus();
  const displayPrice = activeSchema
    ? customizationState.finalPrice
    : variant.price;
  const displayOriginalPrice =
    variant.originalPrice !== undefined
      ? variant.originalPrice +
        (activeSchema ? customizationState.extraPrice : 0)
      : undefined;

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      <div className="border-b border-neutral-200 bg-[#F8F8F8]">
        <div className="container-premium">
          <div className="flex items-center gap-3 py-4 text-sm">
            <Link
                  href={buildPath("/urunler")}
              className="flex items-center gap-2 text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Tüm Ürünlere Dön</span>
            </Link>
            <div className="ml-auto flex items-center gap-2 text-neutral-400">
              <Link
                  href={buildPath("/")}
                className="transition-colors hover:text-neutral-600"
              >
                Ana Sayfa
              </Link>
              <ChevronRight className="w-4 h-4" />
              <Link
                  href={buildPath("/urunler")}
                className="transition-colors hover:text-neutral-600"
              >
                Ürünler
              </Link>
              <ChevronRight className="w-4 h-4" />
              <span className="max-w-[150px] truncate font-medium text-neutral-900">
                {product.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      <section className="py-8 lg:py-12">
        <div className="container-premium">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ImageGallery
                key={`${product.id}-${selectedVariant}`}
                images={displayImages}
                productName={product.name}
              />
            </div>

            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                  {product.category}
                </span>
                <span className="h-px w-8 bg-neutral-300" />
                {product.featured && (
                  <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white">
                    Öne Çıkan
                  </span>
                )}
              </div>

              <h1 className="store-product-title-detail tracking-tight text-neutral-900">
                {product.name}
              </h1>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.rating || 0)
                          ? "fill-[#8A6B37] text-[#8A6B37]"
                          : "fill-neutral-200 text-neutral-200"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-neutral-500">
                  ({product.reviewCount || 0} değerlendirme)
                </span>
              </div>

              <div className="flex items-center gap-3">
                {displayOriginalPrice !== undefined && (
                  <span className="text-sm text-neutral-400 line-through lg:text-base">
                    {formatPrice(displayOriginalPrice)}
                  </span>
                )}
                <span className="text-3xl tracking-tight text-neutral-900 lg:text-4xl">
                  {formatPrice(displayPrice)}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                {discountPercent > 0 && (
                  <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white">
                    %{discountPercent} İndirim
                  </span>
                )}
                {product.new && (
                  <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white">
                    Yeni
                  </span>
                )}
                {product.vegan && (
                  <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-medium text-neutral-900">
                    Vegan
                  </span>
                )}
              </div>

              <VariantSelectorV2
                variants={variants}
                selectedIndex={selectedVariant}
                onSelect={setSelectedVariant}
              />

              {isSchemaLoading ? (
                <div className="py-3 text-sm text-neutral-500">
                  Ekstra seçenekler yükleniyor...
                </div>
              ) : activeSchema ? (
                <div
                  ref={extrasSectionRef}
                  className="space-y-3 border-b border-neutral-200 pb-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Kişiselleştirme
                    </span>
                    <span className="h-px w-8 bg-neutral-300" />
                  </div>
                  <DynamicCustomizationForm
                    schemaId={activeSchema.id}
                    productId={product.id}
                    variantId={variant.id}
                    basePrice={variant.price}
                    initialSchema={activeSchema}
                    onCustomizationChange={setCustomizationState}
                    validationNonce={customizationValidationNonce}
                  />
                </div>
              ) : null}

              <div className="space-y-5 border-y border-neutral-200 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        isOutOfStock
                          ? "bg-neutral-300"
                          : variant.stock <= 5
                            ? "bg-amber-500"
                            : "bg-green-500"
                      }`}
                    />
                    <span className={`text-sm ${stockStatus.color}`}>
                      {stockStatus.text}
                    </span>
                  </div>
                  {activeSchema && customizationState.extraPrice > 0 && (
                    <p className="text-sm text-neutral-500">
                      +{formatPrice(customizationState.extraPrice)} kişiselleştirme
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-neutral-900">
                      Adet
                    </span>
                    <div className="flex items-center overflow-hidden rounded-full border border-neutral-200 bg-[#F8F8F8]">
                      <button
                        onClick={() => handleQuantityChange(-1)}
                        disabled={quantity <= 1}
                        className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Minus className="h-4 w-4 stroke-[1.5] text-neutral-900" />
                      </button>
                      <span className="w-10 text-center text-base font-medium text-neutral-900">
                        {quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(1)}
                        disabled={quantity >= (variant.stock || 10)}
                        className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        <Plus className="h-4 w-4 stroke-[1.5] text-neutral-900" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock || isSchemaLoading}
                    className={`
                      min-w-[220px] flex-1 rounded-full py-3.5 text-sm font-medium uppercase tracking-wide transition-all duration-300
                      flex items-center justify-center gap-2
                      ${
                        isOutOfStock || isSchemaLoading
                          ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                          : "bg-[#8A6B37] text-white hover:bg-[#755a2d]"
                      }
                    `}
                  >
                    <ShoppingCart className="h-5 w-5 stroke-[1.5]" />
                    {isSchemaLoading
                      ? "Yükleniyor"
                      : isOutOfStock
                        ? "Tükendi"
                        : "Sepete Ekle"}
                  </button>
                  <button
                    onClick={toggleWishlist}
                    className={`
                      flex h-10 w-10 items-center justify-center text-neutral-900 transition-all
                      ${
                        isWishlisted
                          ? "text-[#8A6B37]"
                          : "hover:text-[#8A6B37]"
                      }
                    `}
                  >
                    <Heart
                      className={`h-5 w-5 stroke-[1.5] ${
                        isWishlisted ? "fill-current" : ""
                      }`}
                    />
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex h-10 w-10 items-center justify-center text-neutral-900 transition-colors hover:text-[#8A6B37]"
                  >
                    <Share2 className="h-5 w-5 stroke-[1.5]" />
                  </button>
                </div>
              </div>

              <PersonalizationPreview
                category={product.category}
                subcategory={product.subcategory}
                productName={product.name}
              />

              <ProductTrustStrip />

              <ProductPdpTrustAccordions product={product} />

              {product.sku && (
                <p className="text-xs text-neutral-400">
                  ÜRÜN KODU: <span className="font-mono">{product.sku}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="container-premium py-4 lg:py-6">
        <ProductReviewsSection
          productId={product.id}
          productName={product.name}
          activeVariantId={variant?.id}
          initialRating={product.rating}
          initialReviewCount={product.reviewCount}
        />
      </div>

      {visibleGroupedProducts.length > 0 ? (
        <section className="border-t border-neutral-200 py-12 lg:py-16">
          <div className="container-premium">
            <div className="mb-8 space-y-2">
              <span className="block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Keşfedin
              </span>
              <h2 className="text-2xl tracking-tight text-neutral-900 lg:text-3xl">
                Bu Gruptaki Diğer Ürünler
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-neutral-500">
                Bu ürünle birlikte gruplandırılan diğer ürünleri inceleyin.
              </p>
            </div>

            <div className="space-y-10">
              {visibleGroupedProducts.map((group) => (
                <div key={group.id} className="space-y-5">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium text-neutral-900">
                      {group.name}
                    </h3>
                    <span className="h-px flex-1 bg-neutral-200" />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {group.items.map((item) => {
                      const productHref = buildPath(`/urunler/${item.slug}`);
                      const imageUrl = item.image ? resolveStorefrontAssetUrl(item.image) : "";
                      const usesProxiedImage = isProxiedStorefrontAssetUrl(imageUrl);
                      const stockText =
                        typeof item.stock === "number"
                          ? item.stock > 0
                            ? "Stokta var"
                            : "Stokta yok"
                          : null;

                      return (
                        <Link
                          key={`${group.id}-${item.productId}`}
                          href={productHref}
                          className="group rounded-[28px] border border-neutral-200 bg-white p-4 transition-all hover:border-neutral-300 hover:shadow-[0_18px_40px_rgba(15,23,42,0.06)]"
                        >
                          <div className="flex gap-4">
                            <div className="relative h-28 w-24 overflow-hidden rounded-[20px] bg-neutral-100 sm:h-32 sm:w-28">
                              {imageUrl ? (
                                <Image
                                  src={imageUrl}
                                  alt={item.name}
                                  fill
                                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                                  sizes="(max-width: 640px) 96px, 112px"
                                  unoptimized={usesProxiedImage}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
                                  Görsel yok
                                </div>
                              )}
                            </div>

                            <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                              <div className="space-y-2">
                                <h4 className="line-clamp-2 text-base font-medium text-neutral-900 transition-colors group-hover:text-neutral-600">
                                  {item.name}
                                </h4>
                                {typeof item.price === "number" ? (
                                  <div className="text-sm font-semibold text-neutral-900">
                                    {formatPrice(item.price)}
                                  </div>
                                ) : null}
                                {stockText ? (
                                  <div
                                    className={`text-sm ${
                                      item.stock && item.stock > 0
                                        ? "text-neutral-500"
                                        : "text-neutral-400"
                                    }`}
                                  >
                                    {stockText}
                                  </div>
                                ) : null}
                              </div>

                              <div className="inline-flex items-center gap-2 text-sm font-medium text-neutral-900 transition-colors group-hover:text-neutral-600">
                                İncele
                                <ChevronRight className="h-4 w-4" />
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section
        className="border-t border-neutral-200 py-16 lg:py-20"
        style={{ backgroundColor: "#f8f8f8f8" }}
      >
        <div className="container-premium">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Keşfedin
              </span>
              <h2 className="text-2xl tracking-tight text-neutral-900 lg:text-3xl">
                Benzer Ürünler
              </h2>
            </div>
            <Link
                  href={buildPath("/urunler")}
              className="hidden items-center gap-1 font-medium text-neutral-900 transition-colors hover:text-neutral-600 sm:flex"
            >
              Tümünü Gör
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>

          {isLoadingRelated ? (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-2xl bg-neutral-100 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-8">
              <Suspense fallback={null}>
                {relatedProducts.map((p, index) => (
                  <ProductCard key={p.id} product={p} index={index} />
                ))}
              </Suspense>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
