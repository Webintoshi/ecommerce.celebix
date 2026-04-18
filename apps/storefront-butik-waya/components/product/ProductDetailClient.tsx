"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Star,
  Heart,
  Share2,
  ArrowLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { PersonalizationPreview } from "@/components/product/PersonalizationPreview";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import {
  DynamicCustomizationForm,
  type CustomizationSelectionState,
} from "@/components/product/dynamic-customization-form";
import { SectionHeading } from "@/components/sections/redesign/SectionHeading";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { Product } from "@/types/product";
import type {
  CustomizationSchema,
  CustomizationStep,
} from "@/types/product-customization";
import { buildLocalizedPath } from "@/lib/i18n";
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
  initialVariantIndex?: number;
}

export function ProductDetailClient({
  slug,
  initialProduct,
  initialRelatedProducts = [],
  initialVariantIndex = 0,
}: ProductDetailClientProps) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>(
    initialRelatedProducts,
  );
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const [selectedVariant, setSelectedVariant] = useState(initialVariantIndex);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(
    new Set(["details"]),
  );
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

  const extrasSectionRef = useRef<HTMLDivElement | null>(null);

  const { addToCart } = useCart();
  const { locale } = useStorefrontRoute();

  const toggleAccordion = (id: string) => {
    setOpenAccordions((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    setProduct(initialProduct);
    setLoading(!initialProduct);
  }, [initialProduct]);

  useEffect(() => {
    setRelatedProducts(initialRelatedProducts);
  }, [initialRelatedProducts]);

  useEffect(() => {
    setSelectedVariant(initialVariantIndex);
    setOpenAccordions(new Set(["details"]));
  }, [initialVariantIndex, initialProduct?.id]);

  useEffect(() => {
    if (typeof window !== "undefined" && product) {
      const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
      setIsWishlisted(wishlist.includes(product.id));
    }
  }, [product]);

  useEffect(() => {
    if (!product?.category) return;

    setIsLoadingRelated(true);
    fetch(`/api/products?category=${product.category}&limit=8&locale=${locale}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.products) {
          const filtered = data.products.filter((p: Product) => p.slug !== slug);
          setRelatedProducts(filtered.slice(0, 4));
        }
      })
      .finally(() => setIsLoadingRelated(false));
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
        if (mounted) {
          setActiveSchema(null);
        }
      } finally {
        if (mounted) {
          setIsSchemaLoading(false);
        }
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

  const displayImages = useMemo(() => {
    const baseImages = product?.images || [];

    if (variant?.images && variant.images.length > 0) {
      const variantImages = variant.images.filter(
        (img: string) => img && img.length > 0,
      );
      if (variantImages.length > 0) {
        const combined = [...variantImages];
        baseImages.forEach((img: string) => {
          if (!combined.includes(img)) {
            combined.push(img);
          }
        });
        return combined;
      }
    }

    return baseImages;
  }, [product?.images, variant?.images]);

  if (loading || !product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="animate-pulse text-center">
          <div className="mb-4 h-8 w-48 rounded bg-neutral-200" />
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center text-[#7A736D]">Ürün bilgisi yüklenemedi.</div>
      </div>
    );
  }

  const discountPercent = variant.originalPrice
    ? Math.round((1 - variant.price / variant.originalPrice) * 100)
    : 0;
  const isOutOfStock = Number(variant.stock || 0) <= 0;

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

    addToCart(product, variant, 1, customizationState.payload || undefined);
  };

  const toggleWishlist = () => {
    const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
    const nextWishlist = isWishlisted
      ? wishlist.filter((id: string) => id !== product.id)
      : [...wishlist, product.id];
    localStorage.setItem("wishlist", JSON.stringify(nextWishlist));
    setIsWishlisted(!isWishlisted);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: product.shortDescription,
        url: window.location.href,
      });
      return;
    }

    navigator.clipboard.writeText(window.location.href);
  };

  const getStockStatus = () => {
    if (isOutOfStock) {
      return { text: "Tükendi", color: "text-[#9A928A]" };
    }
    if (Number(variant.stock) <= 5) {
      return { text: `Son ${variant.stock} adet`, color: "text-amber-700" };
    }
    return { text: "Stokta", color: "text-[#222222]" };
  };

  const stockStatus = getStockStatus();
  const displayPrice = activeSchema
    ? customizationState.finalPrice
    : variant.price;
  const displayOriginalPrice =
    variant.originalPrice !== undefined
      ? variant.originalPrice + (activeSchema ? customizationState.extraPrice : 0)
      : undefined;
  const productCode = variant.sku || product.sku || "";
  const hasReviews = Number(product.reviewCount || 0) > 0;

  const detailItems = [
    {
      id: "details",
      label: "Ürün Detayları",
      content: <ProductFeatures product={product} />,
    },
    {
      id: "delivery",
      label: "Teslimat ve İade",
      content: (
        <div className="space-y-4 text-sm leading-7 text-[#5E5751]">
          <p>
            Siparişler ödeme onayından sonra hazırlanır. Yoğunluk dönemlerinde hazırlık süresi
            standart akıştan farklılaşabilir.
          </p>
          <p>
            Teslim alınan ürünler kullanılmamış durumda ve orijinal formu korunarak iade sürecine
            yönlendirilebilir.
          </p>
          <p>
            Kişiselleştirme uygulanan siparişlerde üretim ve kontrol süresi standart gönderim
            akışından daha uzun olabilir.
          </p>
        </div>
      ),
    },
    {
      id: "care",
      label: "Bakım Notları",
      content: (
        <div className="space-y-4 text-sm leading-7 text-[#5E5751]">
          <p>
            Ürünün formunu ve dokusunu korumak için ürün üzerindeki bakım etiketinde yer alan
            talimatları izleyin.
          </p>
          <p>
            Saklama ve kullanım tercihini kumaş yapısına göre belirlemek, siluetin daha uzun süre
            korunmasına yardımcı olur.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="border-b border-[rgba(26,26,26,0.08)] bg-white">
        <div className="container-premium">
          <div className="flex flex-wrap items-center gap-3 py-4 text-[11px] uppercase tracking-[0.18em] text-[#7A736D]">
            <Link
              href={buildLocalizedPath("/urunler", locale)}
              className="flex items-center gap-2 transition-colors hover:text-[#222222]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Ürünlere dön</span>
            </Link>

            <div className="ml-auto hidden items-center gap-2 text-[#9A928A] md:flex">
              <Link
                href={buildLocalizedPath("/", locale)}
                className="transition-colors hover:text-[#222222]"
              >
                Ana Sayfa
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link
                href={buildLocalizedPath("/urunler", locale)}
                className="transition-colors hover:text-[#222222]"
              >
                Ürünler
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="max-w-[180px] truncate text-[#222222]">{product.name}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="py-8 lg:py-12">
        <div className="container-premium">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:gap-10 xl:gap-14">
            <div className="min-w-0">
              <ImageGallery
                key={`${product.id}-${selectedVariant}`}
                images={displayImages}
                productName={product.name}
              />
            </div>

            <div className="space-y-8 lg:sticky lg:top-24 lg:self-start">
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  {product.category ? (
                    <span className="text-[10px] uppercase tracking-[0.26em] text-[#7A736D]">
                      {product.category}
                    </span>
                  ) : null}
                  {product.featured ? (
                    <span className="rounded-full border border-[rgba(26,26,26,0.08)] bg-white px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#222222]">
                      Öne çıkan
                    </span>
                  ) : null}
                  {product.new ? (
                    <span className="rounded-full border border-[rgba(26,26,26,0.08)] bg-[#F1ECE7] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#222222]">
                      Yeni sezon
                    </span>
                  ) : null}
                  {discountPercent > 0 ? (
                    <span className="rounded-full border border-[rgba(26,26,26,0.08)] bg-[#171311] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white">
                      %{discountPercent} indirim
                    </span>
                  ) : null}
                </div>

                <div className="space-y-4">
                  <h1 className="font-serif text-[2.7rem] leading-[0.94] tracking-[-0.055em] text-[#222222] sm:text-[3.05rem] lg:text-[4.35rem]">
                    {product.name}
                  </h1>

                  {hasReviews ? (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-[#7A736D]">
                      <div className="flex items-center gap-0.5">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < Math.floor(product.rating || 0)
                                ? "fill-[#222222] text-[#222222]"
                                : "fill-[#DED7D1] text-[#DED7D1]"
                            }`}
                          />
                        ))}
                      </div>
                      <span>{product.reviewCount || 0} değerlendirme</span>
                    </div>
                  ) : (
                    <p className="text-sm leading-7 text-[#7A736D]">
                      Editoryal seçki içinde sakin bir ürün sunumu.
                    </p>
                  )}

                  <div className="flex items-end gap-3">
                    {displayOriginalPrice !== undefined ? (
                      <span className="text-base text-[#9A928A] line-through lg:text-lg">
                        {formatPrice(displayOriginalPrice)}
                      </span>
                    ) : null}
                    <span className="text-[2rem] leading-none tracking-[-0.04em] text-[#222222] lg:text-[2.45rem]">
                      {formatPrice(displayPrice)}
                    </span>
                  </div>

                  {product.shortDescription ? (
                    <p className="max-w-[48ch] text-[15px] leading-7 text-[#5E5751] sm:text-base">
                      {product.shortDescription}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="rounded-[2rem] border border-[rgba(26,26,26,0.08)] bg-white/72 p-5 shadow-[0_28px_80px_-64px_rgba(0,0,0,0.28)] backdrop-blur sm:p-6">
                <div className="space-y-6">
                  <VariantSelectorV2
                    variants={variants}
                    selectedIndex={selectedVariant}
                    onSelect={setSelectedVariant}
                  />

                  {isSchemaLoading ? (
                    <div className="py-1 text-sm text-[#7A736D]">
                      Ekstra seçenekler yükleniyor...
                    </div>
                  ) : activeSchema ? (
                    <div
                      ref={extrasSectionRef}
                      className="space-y-3 border-t border-[rgba(26,26,26,0.08)] pt-5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] uppercase tracking-[0.24em] text-[#7A736D]">
                          Kişiselleştirme
                        </span>
                        <span className="h-px w-8 bg-[rgba(26,26,26,0.12)]" />
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

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[rgba(26,26,26,0.08)] pt-5">
                    <div className="flex items-center gap-2 text-sm">
                      <div
                        className={`h-2 w-2 rounded-full ${
                          isOutOfStock
                            ? "bg-neutral-300"
                            : Number(variant.stock) <= 5
                              ? "bg-amber-500"
                              : "bg-[#171311]"
                        }`}
                      />
                      <span className={stockStatus.color}>{stockStatus.text}</span>
                    </div>
                    {activeSchema && customizationState.extraPrice > 0 ? (
                      <p className="text-sm text-[#7A736D]">
                        +{formatPrice(customizationState.extraPrice)} kişiselleştirme
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <button
                      onClick={handleAddToCart}
                      disabled={isOutOfStock || isSchemaLoading}
                      className={`flex min-h-[52px] min-w-[220px] flex-1 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium uppercase tracking-[0.18em] transition-all duration-300 ${
                        isOutOfStock || isSchemaLoading
                          ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                          : "bg-[#171311] text-white hover:bg-[#2A2420]"
                      }`}
                    >
                      <ShoppingCart className="h-4.5 w-4.5 stroke-[1.5]" />
                      {isSchemaLoading
                        ? "Yükleniyor"
                        : isOutOfStock
                          ? "Tükendi"
                          : "Sepete ekle"}
                    </button>

                    <div className="flex items-center gap-2 sm:shrink-0">
                      <button
                        onClick={toggleWishlist}
                        className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/72 text-[#222222] transition-all hover:bg-white"
                      >
                        <Heart
                          className={`h-4.5 w-4.5 stroke-[1.5] ${
                            isWishlisted ? "fill-current" : ""
                          }`}
                        />
                      </button>
                      <button
                        onClick={handleShare}
                        className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[rgba(26,26,26,0.08)] bg-white/72 text-[#222222] transition-colors hover:bg-white"
                      >
                        <Share2 className="h-4.5 w-4.5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[1.35rem] bg-[#ffffff] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-[#7A736D]">
                        Stok
                      </p>
                      <p className="mt-2 text-sm text-[#222222]">{stockStatus.text}</p>
                    </div>
                <div className="rounded-[1.35rem] bg-[#ffffff] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-[#7A736D]">
                        Ürün kodu
                      </p>
                      <p className="mt-2 text-sm text-[#222222]">
                        {productCode || "Butik Waya seçkisi"}
                      </p>
                    </div>
                <div className="rounded-[1.35rem] bg-[#ffffff] px-4 py-3">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-[#7A736D]">
                        Yorumlar
                      </p>
                      <p className="mt-2 text-sm text-[#222222]">
                        {hasReviews
                          ? `${product.reviewCount || 0} değerlendirme`
                          : "İlk yorumu siz bırakın"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <PersonalizationPreview
                category={product.category}
                subcategory={product.subcategory}
                productName={product.name}
              />

              <div className="divide-y divide-[rgba(26,26,26,0.08)] border-y border-[rgba(26,26,26,0.08)]">
                {detailItems.map((item) => {
                  const isOpen = openAccordions.has(item.id);

                  return (
                    <div key={item.id}>
                      <button
                        onClick={() => toggleAccordion(item.id)}
                        className="flex w-full items-center justify-between py-4 text-[11px] font-medium uppercase tracking-[0.2em] text-[#222222]"
                      >
                        {item.label}
                        <ChevronDown
                          className={`h-4 w-4 text-[#7A736D] transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen ? (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pb-5">{item.content}</div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {productCode ? (
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#9A928A]">
                  Ürün kodu: <span className="font-mono text-[#222222]">{productCode}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <div className="container-premium py-4 lg:py-8">
        <ProductReviewsSection
          productId={product.id}
          productName={product.name}
          activeVariantId={variant?.id}
          initialRating={product.rating}
          initialReviewCount={product.reviewCount}
        />
      </div>

      <section
        className="border-t border-[rgba(26,26,26,0.08)] py-16 lg:py-20"
        style={{ backgroundColor: "#ffffff" }}
      >
        <div className="container-premium">
          <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <SectionHeading label="Benzer Ürünler" />
            <Link
              href={buildLocalizedPath("/urunler", locale)}
              className="hidden items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-[#222222] transition-colors hover:text-[#222222] sm:flex"
            >
              Tümünü gör
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>

          {isLoadingRelated ? (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4 lg:gap-8">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-[4/5] rounded-[1.85rem] bg-neutral-100 animate-pulse"
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
