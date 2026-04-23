"use client";

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
  Package,
  Clock,
  BadgeCheck,
  Hammer,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { MobileStickyBar } from "@/components/product/MobileStickyBar";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import {
  DynamicCustomizationForm,
  type CustomizationSelectionState,
} from "@/components/product/dynamic-customization-form";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { getOrderedVariantAttributeGroups } from "@/lib/variant-selection";
import type { Product, ProductVariant } from "@/types/product";
import {
  CustomizationSchema,
  CustomizationStep,
} from "@/types/product-customization";
import { formatPrice } from "@/lib/utils";
import { useWishlist } from "@/lib/wishlist-context";

const ProductCard = React.lazy(() =>
  import("@/components/product/ProductCard").then((mod) => ({
    default: mod.ProductCard,
  })),
);

type ResolvedCustomizationSchema = CustomizationSchema & {
  steps: CustomizationStep[];
};

type DetailRow = {
  key: string;
  label: string;
  value: string;
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

function toDisplayText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "Var" : "Yok";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (!normalized || normalized.toLowerCase() === "default") return null;
  return normalized;
}

function getNestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getAttributeLabel(attribute: Record<string, unknown>, fallbackIndex: number) {
  const nestedAttribute = getNestedRecord(attribute.attribute);
  return (
    toDisplayText(attribute.attributeName) ||
    toDisplayText(attribute.name) ||
    toDisplayText(nestedAttribute?.name) ||
    `Nitelik ${fallbackIndex + 1}`
  );
}

function getVariantAttributeRows(variant?: ProductVariant | null): DetailRow[] {
  if (!variant) return [];

  const sourceAttributes = Array.isArray(variant.attributes)
    ? variant.attributes
    : Array.isArray(variant.raw_attributes)
      ? variant.raw_attributes
      : [];
  const seen = new Set<string>();

  return sourceAttributes
    .map((attribute, index) => {
      const record = getNestedRecord(attribute);
      if (!record) return null;

      const label = getAttributeLabel(record, index);
      const value = toDisplayText(record.value);
      if (!value) return null;

      const key = `${label}:${value}`.toLocaleLowerCase("tr-TR");
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        key,
        label,
        value,
      };
    })
    .filter((row): row is DetailRow => Boolean(row));
}

function getProductSpecificationRows(product: Product, variant?: ProductVariant | null): DetailRow[] {
  const variantRows = getVariantAttributeRows(variant);
  const dimensionParts = [
    product.dimensions?.width ? `${product.dimensions.width} cm genislik` : null,
    product.dimensions?.height ? `${product.dimensions.height} cm yukseklik` : null,
    product.dimensions?.depth ? `${product.dimensions.depth} cm derinlik` : null,
    product.dimensions?.weight ? `${product.dimensions.weight} g` : null,
  ].filter(Boolean);
  const variantName = toDisplayText(variant?.name);
  const baseRows = [
    product.brand ? { key: "brand", label: "Marka", value: product.brand } : null,
    { key: "category", label: "Kategori", value: product.category },
    { key: "subcategory", label: "Alt Kategori", value: product.subcategory },
    variantName ? { key: "variant", label: "Secili Varyant", value: variantName } : null,
    product.sku ? { key: "product-sku", label: "Urun Kodu", value: product.sku } : null,
    variant?.sku ? { key: "variant-sku", label: "Varyant Kodu", value: variant.sku } : null,
    product.gtin ? { key: "gtin", label: "Barkod", value: product.gtin } : null,
    product.countryOfOrigin
      ? { key: "origin", label: "Mensei", value: product.countryOfOrigin }
      : null,
    dimensionParts.length > 0
      ? { key: "dimensions", label: "Olculer", value: dimensionParts.join(" / ") }
      : null,
    typeof variant?.stock === "number"
      ? { key: "stock", label: "Stok", value: variant.stock > 0 ? `${variant.stock} adet` : "Tukendi" }
      : null,
  ].filter((row): row is DetailRow => Boolean(row && toDisplayText(row.value)));

  const seen = new Set<string>();
  return [...variantRows, ...baseRows].filter((row) => {
    const key = `${row.label}:${row.value}`.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getVariantGroupRows(variants: ProductVariant[]): DetailRow[] {
  return getOrderedVariantAttributeGroups(variants).map((group) => ({
    key: group.id,
    label: group.name,
    value: group.values.map((value) => value.value).join(" / "),
  }));
}

function ProductAttributeSummary({ rows }: { rows: DetailRow[] }) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-[1.4rem] border border-[#E5E7EB] bg-[#F8FAFC] p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#374151]">
          Secili Nitelikler
        </span>
        <span className="text-[11px] font-bold text-[#FF6A00]">Admin verisi</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.slice(0, 6).map((row) => (
          <div
            key={row.key}
            className="rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#9CA3AF]">
              {row.label}
            </p>
            <p className="mt-1 truncate text-sm font-black text-[#111827]">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProductSpecifications({ rows }: { rows: DetailRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-5 text-sm font-medium text-[#6B7280]">
        Bu urun icin teknik nitelik bilgisi henuz eklenmedi.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <div
          key={`${row.label}-${row.value}`}
          className="flex items-start gap-3 rounded-2xl border border-[#E5E7EB] bg-white p-4"
        >
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFF1E8] text-[#FF6A00]">
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#6B7280]">
              {row.label}
            </p>
            <p className="mt-1 text-sm font-bold leading-6 text-[#111827]">{row.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
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
  const [quantity, setQuantity] = useState(1);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(
    new Set(["specs"]),
  );
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
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const { locale, buildPath } = useStorefrontRoute();
  const isWishlisted = product ? isInWishlist(product.id) : false;

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
    setQuantity(1);
    setOpenAccordions(new Set(["specs"]));
  }, [initialVariantIndex, initialProduct?.id]);

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
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
        <div className="animate-pulse text-center">
          <div className="mb-4 h-8 w-48 rounded bg-neutral-200" />
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#F5F7FA]">
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
      toast.error("Lutfen gerekli secimleri tamamlayin");
      return;
    }

    addToCart(product, variant, quantity, customizationState.payload || undefined);
    toast.success("Sepete eklendi", {
      description: product.name,
    });
  };

  const handleQuantityChange = (delta: number) => {
    setQuantity((prev) =>
      Math.max(1, Math.min(variant.stock || 10, prev + delta)),
    );
  };

  const toggleWishlist = () => {
    if (isWishlisted) {
      removeFromWishlist(product.id);
      toast.success("Favorilerden cikarildi");
      return;
    }

    addToWishlist(product);
    toast.success("Favorilere eklendi", {
      description: product.name,
    });
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
      toast.success("Urun linki kopyalandi");
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
  const selectedAttributeRows = getVariantAttributeRows(variant);
  const specificationRows = getProductSpecificationRows(product, variant);
  const variantGroupRows = getVariantGroupRows(variants);
  const trustCards = [
    {
      title: "%100 Orijinal Urun",
      text: "Admin tarafindan yayinlanan urun ve varyant bilgileriyle listelenir.",
      icon: BadgeCheck,
    },
    {
      title: "Hizli Kargo",
      text: "Stokta olan secenekler siparis akisinda net gorunur.",
      icon: Clock,
    },
    {
      title: "Kolay Iade",
      text: "Teslimat ve iade sureci satin alma oncesinde acik sunulur.",
      icon: Package,
    },
    {
      title: "Guvenli Odeme",
      text: "Odeme adimi mevcut guvenli checkout akisi ile devam eder.",
      icon: Hammer,
    },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="border-b border-black/5 bg-white">
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

            <div className="space-y-5 rounded-[2rem] border border-[#E5E7EB] bg-white p-4 shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-6 lg:sticky lg:top-28">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#FF6A00]">
                  {product.brand || product.subcategory || product.category}
                </span>
                <span className="h-px w-8 bg-neutral-300" />
                {product.featured && (
                  <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] uppercase tracking-wider text-white">
                    Öne Çıkan
                  </span>
                )}
              </div>

              <h1 className="store-product-title-detail tracking-tight text-neutral-950">
                {product.name}
              </h1>

              {(product.rating || 0) > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.rating || 0)
                          ? "fill-[#F59E0B] text-[#F59E0B]"
                          : "fill-neutral-200 text-neutral-200"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-neutral-500">
                  ({product.reviewCount || 0} değerlendirme)
                </span>
              </div>
              ) : null}

              <div className="flex flex-wrap items-end gap-3 rounded-[1.5rem] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                {displayOriginalPrice !== undefined && (
                  <span className="text-sm text-neutral-400 line-through lg:text-base">
                    {formatPrice(displayOriginalPrice)}
                  </span>
                )}
                <span className={`text-3xl font-black tracking-tight lg:text-4xl ${displayOriginalPrice !== undefined ? "text-[#FF6A00]" : "text-[#111827]"}`}>
                  {formatPrice(displayPrice)}
                </span>
                {discountPercent > 0 ? (
                  <span className="rounded-full bg-[#FFF1E8] px-3 py-1 text-xs font-black text-[#EA580C]">
                    %{discountPercent} Indirim
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-3 gap-2 border-y border-[#E5E7EB] py-4 text-center">
                {[
                  { label: "Teslimat", value: "2-4 iş günü" },
                  { label: "İade", value: "14 gün" },
                  { label: "Ödeme", value: "SSL güvenli" },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-[#E5E7EB] bg-white px-2 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6B7280]">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs font-bold text-[#111827] sm:text-sm">
                      {item.value}
                    </p>
                  </div>
                ))}
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
                    Hafif
                  </span>
                )}
              </div>

              <VariantSelectorV2
                variants={variants}
                selectedIndex={selectedVariant}
                onSelect={setSelectedVariant}
              />

              <ProductAttributeSummary rows={selectedAttributeRows} />

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
                    <div className="flex items-center overflow-hidden rounded-full border border-neutral-200 bg-[#F8FAFC]">
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
                      min-w-[220px] flex-1 rounded-full py-3.5 text-sm font-semibold uppercase tracking-wide transition-all duration-300
                      flex items-center justify-center gap-2
                      ${
                        isOutOfStock || isSchemaLoading
                          ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                          : "bg-[#FF6A00] text-white hover:bg-[#E85F00]"
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
                          ? "text-[#FF6A00]"
                          : "hover:text-[#FF6A00]"
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
                    className="flex h-10 w-10 items-center justify-center text-neutral-900 transition-colors hover:text-[#FF6A00]"
                  >
                    <Share2 className="h-5 w-5 stroke-[1.5]" />
                  </button>
                </div>
              </div>

              <div className="border-t border-neutral-200 pt-1">
                {[
                  {
                    id: "features",
                    label: "Ürün Detayları",
                    content: <ProductFeatures product={product} />,
                  },
                  {
                    id: "specs",
                    label: "Ozellikler",
                    content: (
                      <div className="space-y-5">
                        <ProductSpecifications rows={specificationRows} />
                        {variantGroupRows.length > 0 ? (
                          <div className="rounded-[1.5rem] border border-[#E5E7EB] bg-[#F8FAFC] p-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#6B7280]">
                              Tum Varyant Nitelikleri
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {variantGroupRows.map((row) => (
                                <span
                                  key={row.key}
                                  className="rounded-full border border-[#E5E7EB] bg-white px-3 py-1.5 text-xs font-bold text-[#374151]"
                                >
                                  {row.label}: {row.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ),
                  },
                  {
                    id: "shipping",
                    label: "Kargo & İade",
                    content: (
                      <div className="space-y-4 text-sm text-neutral-600">
                        <div>
                          <h4 className="mb-1 font-medium text-neutral-900">
                            Kargo Bilgileri
                          </h4>
                          <p>
                            Siparişleriniz stok durumuna göre hazırlanır ve genellikle
                            2-4 iş günü içerisinde kargoya verilir.
                          </p>
                        </div>
                        <div>
                          <h4 className="mb-1 font-medium text-neutral-900">
                            İade Politikası
                          </h4>
                          <p>
                            Ürünü teslim aldıktan sonra 14 gün içinde iade veya değişim
                            talebi oluşturabilirsiniz. Ürünün kullanılmamış ve orijinal
                            ambalajında olması gerekir.
                          </p>
                        </div>
                        <div>
                          <h4 className="mb-1 font-medium text-neutral-900">
                            Numara ve Varyant Desteği
                          </h4>
                          <p>
                            Numara, renk veya varyant kararsızlığında destek hattından
                            ürün uygunluğu hakkında bilgi alabilirsiniz.
                          </p>
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
                  ÜRÜN KODU: <span className="font-mono">{product.sku}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="container-premium pb-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {trustCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className="rounded-[1.5rem] border border-[#E5E7EB] bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#FFF1E8] text-[#FF6A00]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-sm font-black text-[#111827]">{card.title}</h3>
                <p className="mt-2 text-xs font-medium leading-5 text-[#6B7280]">
                  {card.text}
                </p>
              </div>
            );
          })}
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

      <section
        className={`border-t border-black/5 bg-[#F5F7FA] py-16 lg:py-20 ${
          !isLoadingRelated && relatedProducts.length === 0 ? "hidden" : ""
        }`}
      >
        <div className="container-premium">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Tamamlayın
              </span>
              <h2 className="text-2xl tracking-tight text-neutral-900 lg:text-3xl">
                Benzer Spor Ürünleri
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

      <MobileStickyBar
        price={displayPrice}
        originalPrice={displayOriginalPrice}
        onAddToCart={handleAddToCart}
        isOutOfStock={isOutOfStock || isSchemaLoading}
      />
    </div>
  );
}
