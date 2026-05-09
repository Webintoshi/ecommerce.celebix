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
import {
  getOrderedVariantAttributeGroups,
  getResolvedVariantAttributes,
} from "@/lib/variant-selection";
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

type DetailSection = {
  id: string;
  label: string;
  content: React.ReactNode;
};

const PRODUCT_ATTRIBUTE_FIELDS = [
  "attributes",
  "raw_attributes",
  "specifications",
  "technical_specifications",
  "technicalSpecifications",
  "details",
  "properties",
  "features",
] as const;

const SKIPPED_ATTRIBUTE_KEYS = new Set([
  "id",
  "uuid",
  "slug",
  "product_id",
  "variant_id",
  "created_at",
  "updated_at",
  "deleted_at",
]);

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
    toDisplayText(attribute.attribute_name) ||
    toDisplayText(attribute.label) ||
    toDisplayText(attribute.title) ||
    toDisplayText(attribute.key) ||
    toDisplayText(attribute.name) ||
    toDisplayText(nestedAttribute?.name) ||
    `Nitelik ${fallbackIndex + 1}`
  );
}

function humanizeAttributeKey(key: string) {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toLocaleUpperCase("tr-TR"));
}

function getAttributeValue(attribute: Record<string, unknown>): string | null {
  const nestedValue = getNestedRecord(attribute.value);
  const values = Array.isArray(attribute.values) ? attribute.values : null;

  if (nestedValue) {
    return (
      toDisplayText(nestedValue.value) ||
      toDisplayText(nestedValue.displayValue) ||
      toDisplayText(nestedValue.display_value) ||
      toDisplayText(nestedValue.label) ||
      toDisplayText(nestedValue.name)
    );
  }

  if (values && values.length > 0) {
    const joinedValues = values
      .map((value) => {
        const valueRecord = getNestedRecord(value);
        return valueRecord
          ? getAttributeValue(valueRecord)
          : toDisplayText(value);
      })
      .filter((value): value is string => Boolean(value))
      .join(", ");

    return joinedValues || null;
  }

  return (
    toDisplayText(attribute.value) ||
    toDisplayText(attribute.displayValue) ||
    toDisplayText(attribute.display_value) ||
    toDisplayText(attribute.text) ||
    toDisplayText(attribute.description)
  );
}

function createDetailRowsFromAttributeSource(
  source: unknown,
  sourceKey: string,
): DetailRow[] {
  if (!source) return [];

  if (Array.isArray(source)) {
    return source
      .map((attribute, index) => {
        const record = getNestedRecord(attribute);
        if (!record) {
          const value = toDisplayText(attribute);
          return value
            ? { key: `${sourceKey}-${index}`, label: `Nitelik ${index + 1}`, value }
            : null;
        }

        const label = getAttributeLabel(record, index);
        const value = getAttributeValue(record);
        return value ? { key: `${sourceKey}-${label}-${value}`, label, value } : null;
      })
      .filter((row): row is DetailRow => Boolean(row));
  }

  const sourceRecord = getNestedRecord(source);
  if (!sourceRecord) return [];

  return Object.entries(sourceRecord)
    .map(([key, value]) => {
      if (SKIPPED_ATTRIBUTE_KEYS.has(key)) return null;

      const nestedRecord = getNestedRecord(value);
      if (nestedRecord) {
        const label = getAttributeLabel({ key: humanizeAttributeKey(key), ...nestedRecord }, 0);
        const attributeValue = getAttributeValue(nestedRecord);
        return attributeValue
          ? { key: `${sourceKey}-${key}`, label, value: attributeValue }
          : null;
      }

      const displayValue = Array.isArray(value)
        ? value
            .map((item) => {
              const itemRecord = getNestedRecord(item);
              return itemRecord ? getAttributeValue(itemRecord) : toDisplayText(item);
            })
            .filter((item): item is string => Boolean(item))
            .join(", ")
        : toDisplayText(value);

      return displayValue
        ? { key: `${sourceKey}-${key}`, label: humanizeAttributeKey(key), value: displayValue }
        : null;
    })
    .filter((row): row is DetailRow => Boolean(row));
}

function dedupeDetailRows(rows: DetailRow[]) {
  const seen = new Set<string>();

  return rows.filter((row) => {
    const key = `${row.label}:${row.value}`.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getVariantAttributeRows(
  variant?: ProductVariant | null,
  allVariants: ProductVariant[] = [],
): DetailRow[] {
  if (!variant) return [];

  const sourceAttributes = getResolvedVariantAttributes(variant, allVariants);
  const seen = new Set<string>();

  return sourceAttributes
    .map((attribute, index) => {
      const record = getNestedRecord(attribute);
      if (!record) return null;

      const label = getAttributeLabel(record, index);
      const value = getAttributeValue(record);
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

function getProductAttributeRows(product: Product): DetailRow[] {
  const productRecord = product as Product & Record<string, unknown>;

  return dedupeDetailRows(
    PRODUCT_ATTRIBUTE_FIELDS.flatMap((field) =>
      createDetailRowsFromAttributeSource(productRecord[field], field),
    ),
  );
}

function getProductSpecificationRows(
  product: Product,
  variant?: ProductVariant | null,
  allVariants: ProductVariant[] = [],
): DetailRow[] {
  const variantRows = getVariantAttributeRows(variant, allVariants);
  const productAttributeRows = getProductAttributeRows(product);
  const dimensionParts = [
    product.dimensions?.width ? `${product.dimensions.width} cm genişlik` : null,
    product.dimensions?.height ? `${product.dimensions.height} cm yükseklik` : null,
    product.dimensions?.depth ? `${product.dimensions.depth} cm derinlik` : null,
    product.dimensions?.weight ? `${product.dimensions.weight} g` : null,
  ].filter(Boolean);
  const variantName = toDisplayText(variant?.name);
  const baseRows = [
    product.brand ? { key: "brand", label: "Marka", value: product.brand } : null,
    { key: "category", label: "Kategori", value: product.category },
    { key: "subcategory", label: "Alt Kategori", value: product.subcategory },
    variantName ? { key: "variant", label: "Seçili Varyant", value: variantName } : null,
    product.sku ? { key: "product-sku", label: "Ürün Kodu", value: product.sku } : null,
    variant?.sku ? { key: "variant-sku", label: "Varyant Kodu", value: variant.sku } : null,
    product.gtin ? { key: "gtin", label: "Barkod", value: product.gtin } : null,
    product.countryOfOrigin
      ? { key: "origin", label: "Menşei", value: product.countryOfOrigin }
      : null,
    dimensionParts.length > 0
      ? { key: "dimensions", label: "Ölçüler", value: dimensionParts.join(" / ") }
      : null,
    typeof variant?.stock === "number"
      ? { key: "stock", label: "Stok", value: variant.stock > 0 ? `${variant.stock} adet` : "Tükendi" }
      : null,
  ].filter((row): row is DetailRow => Boolean(row && toDisplayText(row.value)));

  return dedupeDetailRows([...variantRows, ...productAttributeRows, ...baseRows]);
}

function getVariantGroupRows(variants: ProductVariant[]): DetailRow[] {
  return getOrderedVariantAttributeGroups(variants).map((group) => ({
    key: group.id,
    label: group.name,
    value: group.values.map((value) => value.value).join(" / "),
  }));
}

function ProductSpecifications({ rows }: { rows: DetailRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="border-t border-[#E5E7EB] py-5 text-sm font-medium text-[#6B7280]">
        Bu ürün için teknik nitelik bilgisi henüz eklenmedi.
      </div>
    );
  }

  return (
    <div className="grid border-t border-[#E5E7EB] sm:grid-cols-2 sm:gap-x-8">
      {rows.map((row) => (
        <div
          key={`${row.label}-${row.value}`}
          className="grid grid-cols-[minmax(92px,0.42fr)_1fr] gap-4 border-b border-[#E5E7EB] py-4"
        >
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6B7280]">
            {row.label}
          </p>
          <p className="min-w-0 text-sm font-black leading-6 text-[#111827]">{row.value}</p>
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
    new Set(["features"]),
  );
  const [activeDetailTab, setActiveDetailTab] = useState("features");
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
    setOpenAccordions(new Set(["features"]));
    setActiveDetailTab("features");
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
      toast.error("Lütfen gerekli seçimleri tamamlayın");
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
      toast.success("Favorilerden çıkarıldı");
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
      toast.success("Ürün linki kopyalandı");
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
  const specificationRows = getProductSpecificationRows(product, variant, variants);
  const variantGroupRows = getVariantGroupRows(variants);
  const detailSections: DetailSection[] = [
    {
      id: "features",
      label: "Ürün Açıklaması",
      content: <ProductFeatures product={product} />,
    },
    {
      id: "specs",
      label: "Teknik Özellikler",
      content: (
        <div className="space-y-5">
          <ProductSpecifications rows={specificationRows} />
          {variantGroupRows.length > 0 ? (
            <div className="border-t border-[#E5E7EB] pt-5">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#111827]">
                Tüm Varyant Nitelikleri
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {variantGroupRows.map((row) => (
                  <span
                    key={row.key}
                    className="rounded-full bg-[#F8FAFC] px-3 py-1.5 text-xs font-bold text-[#374151]"
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
      label: "Teslimat & İade",
      content: (
        <div className="grid gap-4 border-t border-[#E5E7EB] pt-5 text-sm leading-6 text-[#6B7280] sm:grid-cols-3">
          <p><strong className="text-[#111827]">Kargo:</strong> Stoktaki ürünler 2-4 iş günü içinde hazırlanır.</p>
          <p><strong className="text-[#111827]">İade:</strong> 14 gün içinde kolay iade/değişim talebi oluşturulabilir.</p>
          <p><strong className="text-[#111827]">Destek:</strong> Numara ve varyant uygunluğu için destek alabilirsiniz.</p>
        </div>
      ),
    },
    ...(product.reviewCount
      ? [
          {
            id: "reviews",
            label: `Yorumlar (${product.reviewCount})`,
            content: null,
          },
        ]
      : []),
  ];
  const activeDetailSection =
    detailSections.find((section) => section.id === activeDetailTab) ||
    detailSections[0];

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

      <section className="py-5 lg:py-8">
        <div className="container-premium">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.58fr)_minmax(360px,0.92fr)] lg:gap-5">
            <div className="space-y-4 lg:self-start">
              <div className="rounded-[1.8rem] bg-white p-2 sm:p-3">
                <ImageGallery
                  key={`${product.id}-${selectedVariant}`}
                  images={displayImages}
                  productName={product.name}
                  isWishlisted={isWishlisted}
                  onToggleWishlist={toggleWishlist}
                />
              </div>

              <div className="rounded-[1.8rem] bg-white px-4 py-5 sm:px-6">
                <div className="hidden border-b border-[#E5E7EB] md:flex">
                  {detailSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveDetailTab(section.id)}
                      className={`relative px-5 py-3 text-sm font-black transition ${
                        activeDetailTab === section.id
                          ? "text-[#FF6A00]"
                          : "text-[#6B7280] hover:text-[#111827]"
                      }`}
                    >
                      {section.label}
                      {activeDetailTab === section.id ? (
                        <span className="absolute inset-x-4 -bottom-px h-0.5 rounded-full bg-[#FF6A00]" />
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="hidden pt-5 md:block">
                  {activeDetailSection.content}
                </div>

                <div className="md:hidden">
                  {detailSections.map((item) => {
                    const isOpen = openAccordions.has(item.id);
                    return (
                      <div key={item.id} className="border-b border-[#E5E7EB] last:border-b-0">
                        <button
                          type="button"
                          onClick={() => toggleAccordion(item.id)}
                          className="flex w-full items-center justify-between py-4 text-sm font-black text-[#111827]"
                        >
                          {item.label}
                          <ChevronDown
                            className={`h-4 w-4 text-[#6B7280] transition-transform ${
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
              </div>
            </div>

            <div className="space-y-5 rounded-[1.8rem] bg-white p-5 sm:p-6 lg:sticky lg:top-24">
              <div className="flex items-center gap-3">
                {product.brand ? (
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-[#111827]">
                    {product.brand}
                  </span>
                ) : null}
                {product.brand && product.featured ? (
                  <span className="h-px w-8 bg-neutral-300" />
                ) : null}
                {product.featured && (
                  <span className="rounded-full bg-[#FFF1E8] px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#EA580C]">
                    Öne Çıkan
                  </span>
                )}
              </div>

              <h1 className="text-[36px] font-black leading-[1.02] tracking-[-0.03em] text-[#111827]">
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

              <div className="flex flex-wrap items-center gap-3">
                {displayOriginalPrice !== undefined && (
                  <span className="order-2 text-sm font-bold text-[#9CA3AF] line-through lg:text-base">
                    {formatPrice(displayOriginalPrice)}
                  </span>
                )}
                <span className={`order-1 text-3xl font-black tracking-tight lg:text-4xl ${displayOriginalPrice !== undefined ? "text-[#FF6A00]" : "text-[#111827]"}`}>
                  {formatPrice(displayPrice)}
                </span>
                {discountPercent > 0 ? (
                  <span className="order-3 rounded-full bg-[#FFF1E8] px-3 py-1 text-xs font-black text-[#EA580C]">
                    %{discountPercent} İndirim
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      isOutOfStock
                        ? "bg-[#EF4444]"
                        : variant.stock <= 5
                          ? "bg-[#F59E0B]"
                          : "bg-[#16A34A]"
                    }`}
                  />
                  <span className={`text-sm font-black ${stockStatus.color}`}>
                    {stockStatus.text}
                  </span>
                </div>
                {activeSchema && customizationState.extraPrice > 0 ? (
                  <p className="text-sm font-bold text-[#6B7280]">
                    +{formatPrice(customizationState.extraPrice)} kişiselleştirme
                  </p>
                ) : null}
              </div>

              <div className="hidden flex-wrap gap-2">
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

              <div className="space-y-3 border-t border-[#E5E7EB] pt-4">
                <div className="hidden flex-wrap items-center justify-between gap-3">
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

                <div className="grid gap-3 sm:grid-cols-[154px_1fr_auto]">
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
                      flex h-14 rounded-xl text-sm font-black transition-all duration-300
                      flex items-center justify-center gap-2
                      ${
                        isOutOfStock || isSchemaLoading
                          ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                          : "bg-[#FF6A00] text-white shadow-[0_14px_28px_rgba(255,106,0,0.22)] hover:bg-[#E85F00]"
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
                      hidden h-10 w-10 items-center justify-center text-neutral-900 transition-all
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
                    className="flex h-14 w-14 items-center justify-center rounded-xl border border-[#E5E7EB] text-neutral-900 transition-colors hover:border-[#FF6A00] hover:text-[#FF6A00]"
                  >
                    <Share2 className="h-5 w-5 stroke-[1.5]" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={toggleWishlist}
                  className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white text-sm font-black transition hover:border-[#FF6A00] hover:text-[#FF6A00] ${
                    isWishlisted ? "text-[#FF6A00]" : "text-[#374151]"
                  }`}
                >
                  <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
                  {isWishlisted ? "Favorilerden Çıkar" : "Favorilere Ekle"}
                </button>
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
