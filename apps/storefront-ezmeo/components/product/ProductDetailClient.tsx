"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronRight, Heart, Minus, Package, Plus, Share2, ShieldCheck, ShoppingCart, Sparkles, Star } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { PersonalizationPreview } from "@/components/product/PersonalizationPreview";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import { DynamicCustomizationForm, type CustomizationSelectionState } from "@/components/product/dynamic-customization-form";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { Product } from "@/types/product";
import { CustomizationSchema, CustomizationStep } from "@/types/product-customization";
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

function createEmptyCustomizationState(basePrice: number): CustomizationSelectionState {
  return {
    payload: null,
    extraPrice: 0,
    finalPrice: basePrice,
    isValid: true,
    hasSelections: false,
  };
}

async function fetchAssignedSchema(productId: string) {
  const response = await fetch(`/api/customization/schema?productId=${encodeURIComponent(productId)}`, {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Ekstra semasi yuklenemedi");
  }

  return (payload.schema as ResolvedCustomizationSchema | null) || null;
}

function humanizeValue(value?: string | null) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatVariantWeight(value: unknown, unit?: string) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (/[a-zA-Z]/.test(raw)) {
    return raw;
  }

  return unit ? `${raw} ${unit}` : `${raw} g`;
}

function buildUsageNote(product: Product) {
  if (product.category === "findik-ezmesi") {
    return "Kahvalti ve tatli kullanimlari icin daha yumusak bir profil sunar.";
  }
  if (product.category === "fistik-ezmesi") {
    return "Kahvalti tabaklari, bowl karisimlari ve kasik anlari icin daha guclu bir secimdir.";
  }
  if (product.category === "kuruyemis") {
    return "Ara ogun ve tarif tamamlayici kullanimlarda dengeli bir pantry secimi sunar.";
  }

  return "Gunluk ritme kolayca giren, sade ve premium bir kullanim hissi hedefler.";
}

function buildStorageNote(product: Product) {
  return product.nutritionSettings?.storageConditions || "Serin ve kuru yerde muhafaza etmeniz, acildiktan sonra temiz ve kuru kasik kullanmaniz onerilir.";
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
  const [relatedProducts, setRelatedProducts] = useState<Product[]>(initialRelatedProducts);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(initialVariantIndex);
  const [quantity, setQuantity] = useState(1);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set(["story"]));
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [activeSchema, setActiveSchema] = useState<ResolvedCustomizationSchema | null>(null);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);
  const [customizationState, setCustomizationState] = useState<CustomizationSelectionState>(
    createEmptyCustomizationState(initialProduct?.variants?.[initialVariantIndex]?.price || initialProduct?.variants?.[0]?.price || 0),
  );
  const [customizationValidationNonce, setCustomizationValidationNonce] = useState(0);
  const extrasSectionRef = React.useRef<HTMLDivElement | null>(null);
  const { addToCart } = useCart();
  const { locale } = useStorefrontRoute();

  const toggleAccordion = (id: string) => {
    const next = new Set(openAccordions);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
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
    setOpenAccordions(new Set(["story"]));
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
      fetch(`/api/products?category=${product.category}&limit=8&locale=${locale}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.products) {
            const filtered = data.products.filter((p: Product) => p.slug !== slug);
            setRelatedProducts(filtered.slice(0, 4));
          }
        })
        .finally(() => setIsLoadingRelated(false));
    }
  }, [locale, product?.category, slug]);

  useEffect(() => {
    if (!product?.id) {
      return;
    }

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

    void loadActiveSchema();
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
    if (!product) {
      return [];
    }

    const baseImages = product.images || [];
    if (variant?.images && variant.images.length > 0) {
      const variantImages = variant.images.filter((img: string) => img && img.length > 0);
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
  }, [product, variant?.images]);

  if (loading || !product) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-48 animate-pulse rounded-3xl bg-[rgba(36,25,21,0.08)]" />
          <div className="mx-auto h-4 w-32 animate-pulse rounded-full bg-[rgba(36,25,21,0.08)]" />
        </div>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="surface-card p-10 text-center">
          <p className="text-[var(--muted-foreground)]">Urun bilgisi yuklenemedi.</p>
        </div>
      </div>
    );
  }

  const discountPercent = variant.originalPrice
    ? Math.round((1 - variant.price / variant.originalPrice) * 100)
    : 0;
  const isOutOfStock = variant.stock <= 0;
  const displayPrice = activeSchema ? customizationState.finalPrice : variant.price;
  const displayOriginalPrice =
    variant.originalPrice !== undefined
      ? variant.originalPrice + (activeSchema ? customizationState.extraPrice : 0)
      : undefined;
  const availableWeights = Array.from(
    new Set(
      variants
        .map((item) => formatVariantWeight(item.weight, item.unit))
        .filter((item): item is string => Boolean(item)),
    ),
  );
  const descriptor = product.shortDescription || humanizeValue(product.subcategory);
  const editorialTags = [
    product.sugarFree ? "Sekersiz" : null,
    product.vegan ? "Vegan" : null,
    product.glutenFree ? "Glutensiz" : null,
    product.highProtein ? "Yuksek protein" : null,
    variants.length > 1 ? `${variants.length} varyant` : null,
  ].filter(Boolean) as string[];
  const detailNotes = [
    { label: "Tat profili", value: buildUsageNote(product) },
    {
      label: "Gramaj",
      value: availableWeights.join(" / ") || formatVariantWeight(variant.weight, variant.unit) || "Secili kavanoz",
    },
    { label: "Saklama", value: buildStorageNote(product) },
  ];
  const stockTone = isOutOfStock
    ? "text-[var(--muted-foreground)]"
    : variant.stock <= 5
      ? "text-[var(--hazelnut)]"
      : "text-[var(--accent)]";
  const stockLabel = isOutOfStock ? "Tukendi" : variant.stock <= 5 ? `Son ${variant.stock} adet` : "Stokta var";
  const purchaseHighlights = [
    {
      label: "Secili varyant",
      value: formatVariantWeight(variant.weight, variant.unit) || humanizeValue(product.subcategory) || "Premium kavanoz",
    },
    { label: "Stok", value: stockLabel },
    { label: "Teslimat", value: "Kargo secenekleri odemede hesaplanir." },
  ];

  const handleAddToCart = () => {
    if (isOutOfStock || isSchemaLoading) {
      return;
    }

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
    setQuantity((prev) => Math.max(1, Math.min(variant.stock || 10, prev + delta)));
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
      void navigator.share({
        title: product.name,
        text: product.shortDescription,
        url: window.location.href,
      });
      return;
    }

    void navigator.clipboard.writeText(window.location.href);
  };

  return (
    <div className="pb-28 lg:pb-10">
      <div className="border-b border-[var(--border)] bg-[rgba(251,248,243,0.95)]">
        <div className="container-premium">
          <div className="flex flex-wrap items-center gap-3 py-4 text-sm text-[var(--muted-foreground)]">
            <Link
              href={buildLocalizedPath("/urunler", locale)}
              className="inline-flex items-center gap-2 transition-colors hover:text-[var(--foreground)]"
            >
              <ArrowLeft className="h-4 w-4" />
              Tum urunlere don
            </Link>
            <div className="ml-auto hidden items-center gap-2 md:flex">
              <Link href={buildLocalizedPath("/", locale)} className="hover:text-[var(--foreground)]">
                Ana sayfa
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link href={buildLocalizedPath("/urunler", locale)} className="hover:text-[var(--foreground)]">
                Urunler
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="max-w-[180px] truncate text-[var(--foreground)]">{product.name}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="pt-4 md:pt-6">
        <div className="container-premium">
          <div className="grid gap-6 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8">
            <div className="overflow-hidden rounded-[1.9rem] border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow-md)] lg:sticky lg:top-28 lg:self-start">
              <ImageGallery
                key={`${product.id}-${selectedVariant}`}
                images={displayImages}
                productName={product.name}
              />
            </div>

            <div className="surface-card overflow-hidden px-5 py-6 md:px-7 md:py-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip">{humanizeValue(product.category)}</span>
                {product.new ? <span className="chip">Yeni</span> : null}
                {discountPercent > 0 ? <span className="chip">%{discountPercent} indirim</span> : null}
              </div>

              <h1 className="mt-5 text-[var(--foreground)]">{product.name}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-8 text-[var(--muted-foreground)] md:text-base">
                {descriptor || "Ezmeo vitrininin sakin ama premium urun diliyle sunulan secili kavanozlarindan biri."}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.rating || 0)
                          ? "fill-[var(--hazelnut)] text-[var(--hazelnut)]"
                          : "fill-[rgba(36,25,21,0.1)] text-[rgba(36,25,21,0.1)]"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-[var(--muted-foreground)]">
                  {product.reviewCount || 0} degerlendirme
                </span>
                <span className={`text-sm font-medium ${stockTone}`}>{stockLabel}</span>
              </div>

              <div className="mt-6 flex flex-wrap items-end gap-3">
                {displayOriginalPrice !== undefined ? (
                  <span className="text-base text-[var(--muted-foreground)] line-through">
                    {formatPrice(displayOriginalPrice)}
                  </span>
                ) : null}
                <span className="text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] md:text-5xl">
                  {formatPrice(displayPrice)}
                </span>
                {activeSchema && customizationState.extraPrice > 0 ? (
                  <span className="chip">+{formatPrice(customizationState.extraPrice)} ekstra</span>
                ) : null}
              </div>

              {editorialTags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-2">
                  {editorialTags.map((tag) => (
                    <span key={tag} className="chip">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {purchaseHighlights.map((item) => (
                  <div key={item.label} className="rounded-[1.35rem] border border-[var(--border)] bg-[var(--muted)] px-4 py-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
                      {item.label}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 rounded-[1.6rem] border border-[var(--border)] bg-[var(--muted)] p-4">
                <VariantSelectorV2
                  variants={variants}
                  selectedIndex={selectedVariant}
                  onSelect={setSelectedVariant}
                />
              </div>

              {isSchemaLoading ? (
                <div className="mt-5 text-sm text-[var(--muted-foreground)]">
                  Ekstra secenekler yukleniyor...
                </div>
              ) : activeSchema ? (
                <div ref={extrasSectionRef} className="mt-6 rounded-[1.6rem] border border-[var(--border)] bg-[var(--muted)] p-5">
                  <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted-foreground)]">
                    <Sparkles className="h-4 w-4" />
                    Kisisellestirme
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

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {detailNotes.map((note) => (
                  <div key={note.label} className="rounded-[1.4rem] border border-[var(--border)] bg-[var(--card)] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                      {note.label}
                    </p>
                    <p className="mt-2 text-sm leading-7 text-[var(--foreground)]">{note.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-7 rounded-[1.7rem] border border-[var(--border)] bg-[var(--card)] p-4 md:p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]">
                      Adet
                    </span>
                    <div className="flex items-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--muted)]">
                      <button
                        onClick={() => handleQuantityChange(-1)}
                        disabled={quantity <= 1}
                        className="flex h-11 w-11 items-center justify-center text-[var(--foreground)] transition-colors hover:bg-[rgba(36,25,21,0.05)] disabled:cursor-not-allowed disabled:opacity-30"
                        type="button"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-12 text-center text-base font-semibold text-[var(--foreground)]">
                        {quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(1)}
                        disabled={quantity >= (variant.stock || 10)}
                        className="flex h-11 w-11 items-center justify-center text-[var(--foreground)] transition-colors hover:bg-[rgba(36,25,21,0.05)] disabled:cursor-not-allowed disabled:opacity-30"
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock || isSchemaLoading}
                    className={`flex min-w-[230px] flex-1 items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.16em] transition-all ${
                      isOutOfStock || isSchemaLoading
                        ? "cursor-not-allowed bg-[rgba(36,25,21,0.1)] text-[var(--muted-foreground)]"
                        : "bg-[var(--primary)] text-white hover:-translate-y-0.5 hover:bg-[#761015]"
                    }`}
                    type="button"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    {isSchemaLoading ? "Yukleniyor" : isOutOfStock ? "Tukendi" : "Sepete ekle"}
                  </button>

                  <button
                    onClick={toggleWishlist}
                    className={`flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] transition-all ${
                      isWishlisted
                        ? "bg-[rgba(143,17,22,0.08)] text-[var(--primary)]"
                        : "bg-[var(--muted)] text-[var(--foreground)] hover:bg-[rgba(36,25,21,0.05)]"
                    }`}
                    type="button"
                  >
                    <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] transition hover:bg-[rgba(36,25,21,0.05)]"
                    type="button"
                  >
                    <Share2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <PersonalizationPreview
                category={product.category}
                subcategory={product.subcategory}
                productName={product.name}
              />

              <div className="mt-6 border-t border-[var(--border)]">
                {[
                  {
                    id: "story",
                    label: "Urun hikayesi",
                    content: <ProductFeatures product={product} />,
                  },
                  {
                    id: "details",
                    label: "Urun notlari",
                    content: (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--muted)] p-4">
                          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            <Package className="h-4 w-4" />
                            Gramajlar
                          </p>
                          <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                            {availableWeights.join(" / ") || "Secili gramaj yakinda netlesir."}
                          </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--muted)] p-4">
                          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            <ShieldCheck className="h-4 w-4" />
                            Saklama
                          </p>
                          <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                            {buildStorageNote(product)}
                          </p>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "shipping",
                    label: "Teslimat ve destek",
                    content: (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--muted)] p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Teslimat
                          </p>
                          <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                            Kargo secenekleri ve ucretlendirme, sepet ve odeme adiminda secili varyanta gore hesaplanir.
                          </p>
                        </div>
                        <div className="rounded-[1.5rem] border border-[var(--border)] bg-[var(--muted)] p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                            Destek
                          </p>
                          <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                            Urun secimi, stok ve siparis sorularinda iletisim sayfasindan destek alinabilir.
                          </p>
                        </div>
                      </div>
                    ),
                  },
                ].map((item) => {
                  const isOpen = openAccordions.has(item.id);

                  return (
                    <div key={item.id} className="border-b border-[var(--border)]">
                      <button
                        onClick={() => toggleAccordion(item.id)}
                        className="flex w-full items-center justify-between py-5 text-left text-sm font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]"
                        type="button"
                      >
                        {item.label}
                        <ChevronDown
                          className={`h-4 w-4 text-[var(--muted-foreground)] transition-transform ${
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

              <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[var(--muted-foreground)]">
                Urun kodu: <span className="font-mono">{variant.sku || product.sku || "belirtilmedi"}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pt-10">
        <div className="container-premium">
          <div className="surface-card overflow-hidden px-5 py-6 md:px-7 md:py-8 lg:px-8">
            <ProductReviewsSection
              productId={product.id}
              productName={product.name}
              activeVariantId={variant?.id}
              initialRating={product.rating}
              initialReviewCount={product.reviewCount}
            />
          </div>
        </div>
      </section>

      <section className="pt-10">
        <div className="container-premium">
          <div className="surface-card overflow-hidden px-5 py-6 md:px-7 md:py-8 lg:px-8">
            <div className="mb-8 flex flex-col gap-4 border-b border-[var(--border)] pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="editorial-kicker">Benzer urunler</p>
                <h2 className="mt-4 text-[var(--foreground)]">
                  Ayni ritimde iyi duran diger kavanozlar
                </h2>
              </div>
              <Link
                href={buildLocalizedPath("/urunler", locale)}
                className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--foreground)]"
              >
                Tumunu gor
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {isLoadingRelated ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[1/1.08] animate-pulse rounded-[1.7rem] bg-[rgba(36,25,21,0.08)]"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Suspense fallback={null}>
                  {relatedProducts.map((p, index) => (
                    <ProductCard key={p.id} product={p} index={index} />
                  ))}
                </Suspense>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[rgba(255,253,249,0.98)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-18px_44px_-30px_rgba(36,25,21,0.28)] lg:hidden">
        <div className="mx-auto flex w-full max-w-[88rem] items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-foreground)]">
              {formatVariantWeight(variant.weight, variant.unit) || "Secili varyant"}
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="truncate text-lg font-semibold text-[var(--foreground)]">
                {formatPrice(displayPrice)}
              </span>
              {displayOriginalPrice !== undefined ? (
                <span className="text-sm text-[var(--muted-foreground)] line-through">
                  {formatPrice(displayOriginalPrice)}
                </span>
              ) : null}
            </div>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={isOutOfStock || isSchemaLoading}
            className={`inline-flex min-h-12 min-w-[11rem] items-center justify-center rounded-full px-5 text-sm font-semibold uppercase tracking-[0.16em] transition-all ${
              isOutOfStock || isSchemaLoading
                ? "cursor-not-allowed bg-[rgba(36,25,21,0.1)] text-[var(--muted-foreground)]"
                : "bg-[var(--primary)] text-white"
            }`}
            type="button"
          >
            {isSchemaLoading ? "Yukleniyor" : isOutOfStock ? "Tukendi" : "Sepete ekle"}
          </button>
        </div>
      </div>
    </div>
  );
}
