"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Star,
  Heart,
  Share2,
  ArrowLeft,
  Package,
  Clock,
  BadgeCheck,
  Hammer,
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
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import type { ProductGroupDisplayGroup } from "@/lib/products";
import { Product } from "@/types/product";
import {
  CustomizationSchema,
  CustomizationStep,
} from "@/types/product-customization";
import { PDP_BADGE, PDP_PRIMARY_BUTTON } from "@/lib/pdp-ui";
import { cn, formatPrice } from "@/lib/utils";

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
    throw new Error(payload?.error || "Kişiselleştirme seçenekleri yüklenemedi");
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
  initialVariantIndex = 0,
}: ProductDetailClientProps) {
  const [product, setProduct] = useState<Product | null>(initialProduct);
  const [loading, setLoading] = useState(!initialProduct);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>(
    initialRelatedProducts,
  );
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const [selectedVariant, setSelectedVariant] = useState(initialVariantIndex);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());
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

  const toggleAccordion = (id: string) => {
    const next = new Set(openAccordions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenAccordions(next);
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
    setOpenAccordions(new Set());
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
          <p className="text-neutral-500">Ürün bilgileri yüklenemedi.</p>
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

    addToCart(product, variant, 1, customizationState.payload || undefined);
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

  const displayPrice = activeSchema
    ? customizationState.finalPrice
    : variant.price;
  const displayOriginalPrice =
    variant.originalPrice !== undefined
      ? variant.originalPrice +
        (activeSchema ? customizationState.extraPrice : 0)
      : undefined;
  const showFilledReviewStars =
    (product.reviewCount || 0) === 0 && Math.floor(product.rating || 0) === 0;

  const addToCartLabel = isSchemaLoading
    ? "Yükleniyor"
    : isOutOfStock
      ? "Tükendi"
      : "Sepete Ekle";

  return (
    <div className="min-h-screen bg-[#F8F8F8] pb-28 lg:pb-0">
      <div className="border-b border-neutral-200 bg-[#F8F8F8]">
        <div className="container-premium">
          <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3 sm:py-4">
            <Link
              href={buildPath("/urunler")}
              className="inline-flex min-h-11 items-center gap-2 self-start text-sm text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Tüm Ürünlere Dön</span>
              <span className="sm:hidden">Geri</span>
            </Link>
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 items-center gap-1.5 overflow-x-auto text-xs text-neutral-400 [scrollbar-width:none] sm:ml-auto sm:gap-2 sm:text-sm [&::-webkit-scrollbar]:hidden"
            >
              <Link
                href={buildPath("/")}
                className="shrink-0 transition-colors hover:text-neutral-600"
              >
                Ana Sayfa
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <Link
                href={buildPath("/urunler")}
                className="shrink-0 transition-colors hover:text-neutral-600"
              >
                Ürünler
              </Link>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
              <span className="min-w-0 truncate font-medium text-neutral-900">
                {product.name}
              </span>
            </nav>
          </div>
        </div>
      </div>

      <section className="py-5 sm:py-8 lg:py-12">
        <div className="container-premium">
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ImageGallery
                key={`${product.id}-${selectedVariant}`}
                images={displayImages}
                productName={product.name}
              />
            </div>

            <div className="space-y-4">
              <h1 className="store-product-title-pdp font-semibold tracking-tight text-neutral-900">
                {product.name}
              </h1>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.rating || 0) || showFilledReviewStars
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

              <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap sm:gap-3">
                {displayOriginalPrice !== undefined && (
                  <span className="shrink-0 text-sm text-neutral-400 line-through lg:text-base">
                    {formatPrice(displayOriginalPrice)}
                  </span>
                )}
                <span className="shrink-0 text-2xl tracking-tight text-neutral-900 sm:text-[30px] lg:text-[34px]">
                  {formatPrice(displayPrice)}
                </span>
                {discountPercent > 0 && (
                  <span className={`shrink-0 bg-[#12100D] text-white ${PDP_BADGE}`}>
                    %{discountPercent} İndirim
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {product.featured && (
                  <span className={`bg-[#12100D] text-white ${PDP_BADGE}`}>Öne Çıkan</span>
                )}
                {product.new && (
                  <span className={`bg-[#12100D] text-white ${PDP_BADGE}`}>Yeni</span>
                )}
                {product.vegan && (
                  <span className={`border border-[#E8DFD3] bg-white text-[#12100D] ${PDP_BADGE}`}>
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
                  Kişiselleştirme seçenekleri yükleniyor...
                </div>
              ) : activeSchema ? (
                <div
                  ref={extrasSectionRef}
                  className="rounded-2xl border border-[#E8DFD3] bg-white p-4 shadow-[0_12px_40px_-32px_rgba(18,16,13,0.18)] sm:p-5"
                >
                  <div className="mb-4 flex items-center gap-3 sm:mb-5">
                    <span className="font-serif text-[11px] font-medium uppercase tracking-[0.22em] text-[#9A7234]">
                      Kişiselleştirme
                    </span>
                    <span className="h-px flex-1 bg-[#E8DFD3]" />
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

              <div className="space-y-4 border-y border-neutral-200 py-4 sm:space-y-5 sm:py-5">
                {activeSchema && customizationState.extraPrice > 0 && (
                  <p className="text-sm text-neutral-500">
                    +{formatPrice(customizationState.extraPrice)} kişiselleştirme eklendi
                  </p>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock || isSchemaLoading}
                    className={`hidden min-w-[220px] flex-1 lg:inline-flex ${PDP_PRIMARY_BUTTON}`}
                  >
                    <ShoppingCart className="h-5 w-5 stroke-[1.5]" />
                    {addToCartLabel}
                  </button>
                  <button
                    onClick={toggleWishlist}
                    aria-label={isWishlisted ? "Favorilerden çıkar" : "Favorilere ekle"}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-full border border-[#E8DFD3] bg-white text-neutral-900 transition-all",
                      isWishlisted ? "text-[#8A6B37]" : "hover:border-[#C4A062] hover:text-[#8A6B37]",
                    )}
                  >
                    <Heart
                      className={`h-5 w-5 stroke-[1.5] ${
                        isWishlisted ? "fill-current" : ""
                      }`}
                    />
                  </button>
                  <button
                    onClick={handleShare}
                    aria-label="Paylaş"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E8DFD3] bg-white text-neutral-900 transition-colors hover:border-[#C4A062] hover:text-[#8A6B37]"
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

              <div className="border-t border-neutral-200 pt-1">
                {[
                  {
                    id: "features",
                    label: "Ürün Detayları",
                    content: <ProductFeatures product={product} />,
                  },
                  {
                    id: "specs",
                    label: "Özellikler",
                    content: (
                      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Package className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                              Malzeme
                            </p>
                            <p className="text-sm font-medium text-neutral-900">
                              Birinci sınıf hakiki deri
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Hammer className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                              İşçilik
                            </p>
                            <p className="text-sm font-medium text-neutral-900">
                              El dikişi
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Clock className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                              Üretim Süresi
                            </p>
                            <p className="text-sm font-medium text-neutral-900">
                              1-3 İş Günü
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <BadgeCheck className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">
                              Garanti
                            </p>
                            <p className="text-sm font-medium text-neutral-900">
                              El İşçiliği Kalitesi
                            </p>
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "shipping",
                    label: "Kargo ve İade",
                    content: (
                      <div className="space-y-5 text-sm text-neutral-600">
                        <div>
                          <h4 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
                            <span>🚛</span> KARGO VE İADE
                          </h4>
                          <ul className="list-none space-y-1.5">
                            <li>
                              <strong className="text-neutral-800">Ücretsiz Kargo:</strong> 1500 TL üzeri siparişlerde
                            </li>
                            <li>
                              <strong className="text-neutral-800">Teslimat Süresi:</strong> 1-3 iş günü hazırlık + 2-4 iş günü kargo
                            </li>
                            <li>
                              <strong className="text-neutral-800">Kargo Partneri:</strong> teslimat adresine göre değişebilir.
                            </li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
                            <span>💳</span> ÖDEME SEÇENEKLERİ
                          </h4>
                          <ul className="list-none space-y-1.5">
                            <li>3D Secure ile kredi / banka kartı</li>
                            <li>Havale / EFT</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
                            <span>🔄</span> İADE KOŞULLARI
                          </h4>
                          <ul className="list-none space-y-1.5">
                            <li>
                              <strong className="text-neutral-800">14 gün içinde iade hakkı</strong>
                            </li>
                            <li>
                              <strong className="text-neutral-800">İstisnalar:</strong> kişiselleştirilmiş ürünlerde iade yapılamaz
                            </li>
                            <li>
                              <strong className="text-neutral-800">İade Kargosu:</strong> alıcı tarafından karşılanır
                            </li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 flex items-center gap-2 font-semibold text-neutral-900">
                            <span>✨</span> NEDEN DERYCRAFT?
                          </h4>
                          <ul className="list-none space-y-1.5">
                            <li>%100 el yapımı hakiki deri ürünler</li>
                            <li>SSL ile korunan güvenli alışveriş</li>
                          </ul>
                        </div>
                      </div>
                    ),
                  },
                ].map((item) => {
                  const isOpen = openAccordions.has(item.id);
                  return (
                    <div key={item.id} className="border-b border-neutral-200">
                      <button
                        onClick={() => toggleAccordion(item.id)}
                        className="flex w-full items-center justify-between py-4 text-sm font-medium uppercase tracking-wide text-neutral-900"
                      >
                        {item.label}
                        <ChevronDown
                          className={`h-4 w-4 text-neutral-500 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pb-5">{item.content}</div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {product.sku && (
                <p className="text-xs text-neutral-400">
                  SKU: <span className="font-mono">{product.sku}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E8DFD3] bg-white/95 px-4 py-3 shadow-[0_-12px_40px_rgba(18,16,13,0.08)] backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 shrink-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-neutral-500">
              Toplam
            </p>
            <p className="font-serif text-xl font-semibold tracking-tight text-neutral-900">
              {formatPrice(displayPrice)}
            </p>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock || isSchemaLoading}
            className={`min-h-12 flex-1 px-4 ${PDP_PRIMARY_BUTTON}`}
          >
            <ShoppingCart className="h-5 w-5 stroke-[1.5]" />
            {addToCartLabel}
          </button>
        </div>
      </div>

      <div className="container-premium py-4 lg:py-6">
        <ProductReviewsSection
          productId={product.id}
          productName={product.name}
          activeVariantId={variant?.id}
          initialRating={product.rating}
          initialReviewCount={product.reviewCount}
        />
      </div>

      <section
        className="border-t border-neutral-200 py-16 lg:py-20"
        style={{ backgroundColor: "#f8f8f8f8" }}
      >
        <div className="container-premium">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Keşfet
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
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12">
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
