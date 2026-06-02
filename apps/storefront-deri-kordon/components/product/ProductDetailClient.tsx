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
  ShieldCheck,
  Hammer,
  ChevronRight,
  ChevronDown,
  Truck,
  Gift,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { PersonalizationPreview } from "@/components/product/PersonalizationPreview";
import { ProductReviewsSection } from "@/components/product/ProductReviewsSection";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import { MobileStickyBar } from "@/components/product/MobileStickyBar";
import {
  DynamicCustomizationForm,
  type CustomizationSelectionState,
} from "@/components/product/dynamic-customization-form";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { Product } from "@/types/product";
import { CustomizationSchema, CustomizationStep } from "@/types/product-customization";
import { buildLocalizedPath, getLocalizedCopy } from "@/lib/i18n";
import { formatPrice } from "@/lib/utils";

const ProductCard = React.lazy(() =>
  import("@/components/product/ProductCard").then((mod) => ({
    default: mod.ProductCard,
  })),
);

type TabType = "features" | "specs" | "shipping";
type ResolvedCustomizationSchema = CustomizationSchema & { steps: CustomizationStep[] };

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
  const response = await fetch("/api/customization/schema?productId=" + encodeURIComponent(productId), {
    cache: "no-store",
  });
  const payload = await response.json();

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "Customization schema could not be loaded");
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
  const [relatedProducts, setRelatedProducts] = useState<Product[]>(initialRelatedProducts);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState(initialVariantIndex);
  const [quantity, setQuantity] = useState(1);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set(["features"]));
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [activeSchema, setActiveSchema] = useState<ResolvedCustomizationSchema | null>(null);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);
  const [customizationState, setCustomizationState] = useState<CustomizationSelectionState>(
    createEmptyCustomizationState(
      initialProduct?.variants?.[initialVariantIndex]?.price || initialProduct?.variants?.[0]?.price || 0,
    ),
  );
  const [customizationValidationNonce, setCustomizationValidationNonce] = useState(0);
  const extrasSectionRef = React.useRef<HTMLDivElement | null>(null);

  const { addToCart } = useCart();
  const { locale } = useStorefrontRoute();
  const copy = getLocalizedCopy(locale);

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
      const variantImages = variant.images.filter((img: string) => img && img.length > 0);
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
      <div className="flex min-h-screen items-center justify-center bg-[#F8F8F8]">
        <div className="animate-pulse text-center">
          <div className="mb-4 h-8 w-48 rounded bg-neutral-200" />
          <div className="h-4 w-32 rounded bg-neutral-200" />
        </div>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8F8F8] px-4">
        <div className="text-center">
          <p className="text-neutral-500">Product information could not be loaded.</p>
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
    setQuantity((prev) => Math.max(1, Math.min(variant.stock || 10, prev + delta)));
  };

  const toggleAccordion = (id: string) => {
    const next = new Set(openAccordions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenAccordions(next);
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
    if (isOutOfStock) return { text: "Sold out", color: "text-neutral-400" };
    if (variant.stock <= 5) {
      return { text: `Only ${variant.stock} left`, color: "text-amber-600" };
    }
    return { text: "In stock", color: "text-emerald-600" };
  };

  const stockStatus = getStockStatus();
  const displayPrice = activeSchema ? customizationState.finalPrice : variant.price;
  const displayOriginalPrice =
    variant.originalPrice !== undefined
      ? variant.originalPrice + (activeSchema ? customizationState.extraPrice : 0)
      : undefined;

  const purchaseHighlights = [
    {
      icon: ShieldCheck,
      title: "Workshop made",
      text: "Hand craftsmanship and premium leather selection",
    },
    {
      icon: Truck,
      title: "Fast shipping",
      text: "Prepared within 1-3 business days",
    },
    {
      icon: Gift,
      title: "Gift ready",
      text: "Premium feel from the moment it is unboxed",
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8F8F8] pb-24 lg:pb-0">
      <div className="border-b border-neutral-200 bg-[#F8F8F8]">
        <div className="container-premium">
          <div className="flex items-center gap-3 py-4 text-sm">
            <Link
              href={buildLocalizedPath("/urunler", locale)}
              className="flex items-center gap-2 text-neutral-500 transition-colors hover:text-neutral-900"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{copy.breadcrumbProducts}</span>
            </Link>
            <div className="ml-auto flex items-center gap-2 text-neutral-400">
              <Link
                href={buildLocalizedPath("/", locale)}
                className="transition-colors hover:text-neutral-600"
              >
                {copy.breadcrumbHome}
              </Link>
              <ChevronRight className="h-4 w-4" />
              <Link
                href={buildLocalizedPath("/urunler", locale)}
                className="transition-colors hover:text-neutral-600"
              >
                {copy.breadcrumbProducts}
              </Link>
              <ChevronRight className="h-4 w-4" />
              <span className="max-w-[150px] truncate font-medium text-neutral-900">{product.name}</span>
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

            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                  {product.category}
                </span>
                <span className="h-px w-8 bg-neutral-300" />
                {product.featured ? (
                  <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] tracking-wider text-white">
                    Featured
                  </span>
                ) : null}
              </div>

              <h1 className="store-product-title-detail text-neutral-900 tracking-tight">{product.name}</h1>

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
                  ({product.reviewCount || 0} reviews)
                </span>
              </div>

              <div className="flex items-center gap-3">
                {displayOriginalPrice !== undefined ? (
                  <span className="text-sm text-neutral-400 line-through lg:text-base">
                    {formatPrice(displayOriginalPrice)}
                  </span>
                ) : null}
                <span className="text-3xl tracking-tight text-neutral-900 lg:text-4xl">
                  {formatPrice(displayPrice)}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {purchaseHighlights.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="rounded-[24px] border border-[#E6D9CA] bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] p-4 shadow-[0_18px_44px_-38px_rgba(42,28,15,0.35)]"
                    >
                      <Icon className="h-5 w-5 text-[#8A6847]" />
                      <p className="mt-3 text-sm font-medium text-neutral-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-neutral-600">{item.text}</p>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                {discountPercent > 0 ? (
                  <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white">
                    {discountPercent}% Off
                  </span>
                ) : null}
                {product.new ? (
                  <span className="rounded-full bg-neutral-900 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-white">
                    New
                  </span>
                ) : null}
                {product.vegan ? (
                  <span className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-medium text-neutral-900">
                    Vegan
                  </span>
                ) : null}
              </div>

              <VariantSelectorV2
                variants={variants}
                selectedIndex={selectedVariant}
                onSelect={setSelectedVariant}
              />

              {isSchemaLoading ? (
                <div className="py-3 text-sm text-neutral-500">Loading extra options...</div>
              ) : activeSchema ? (
                <div
                  ref={extrasSectionRef}
                  className="space-y-3 rounded-[28px] border border-[#E6D9CA] bg-white/70 p-5"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                      Personalization
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

              <div className="space-y-5 rounded-[32px] border border-[#E6D9CA] bg-[linear-gradient(180deg,#fffdfa_0%,#ffffff_100%)] p-5 shadow-[0_26px_70px_-52px_rgba(42,28,15,0.48)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-2 w-2 rounded-full ${
                        isOutOfStock ? "bg-neutral-300" : variant.stock <= 5 ? "bg-amber-500" : "bg-emerald-500"
                      }`}
                    />
                    <span className={`text-sm ${stockStatus.color}`}>{stockStatus.text}</span>
                  </div>
                  {activeSchema && customizationState.extraPrice > 0 ? (
                    <p className="text-sm text-neutral-500">
                      +{formatPrice(customizationState.extraPrice)} personalization
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-neutral-900">Qty</span>
                    <div className="flex items-center overflow-hidden rounded-full border border-neutral-200 bg-[#F8F8F8]">
                      <button
                        onClick={() => handleQuantityChange(-1)}
                        disabled={quantity <= 1}
                        className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
                        type="button"
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
                        type="button"
                      >
                        <Plus className="h-4 w-4 stroke-[1.5] text-neutral-900" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock || isSchemaLoading}
                    className={`min-w-[220px] flex-1 rounded-full py-3.5 text-sm font-medium uppercase tracking-wide transition-all duration-300 ${
                      isOutOfStock || isSchemaLoading
                        ? "cursor-not-allowed bg-neutral-200 text-neutral-400"
                        : "bg-[#17110B] text-white shadow-[0_20px_36px_-20px_rgba(23,17,11,0.8)] hover:-translate-y-0.5"
                    }`}
                    type="button"
                  >
                    <span className="inline-flex items-center gap-2">
                      <ShoppingCart className="h-5 w-5 stroke-[1.5]" />
                      {isSchemaLoading ? "Loading" : isOutOfStock ? "Sold out" : "Add to Cart"}
                    </span>
                  </button>
                  <button
                    onClick={toggleWishlist}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                      isWishlisted
                        ? "border-[#8A6847] bg-[#8A6847] text-white"
                        : "border-[#E2D5C6] bg-white text-neutral-900 hover:text-[#8A6847]"
                    }`}
                    type="button"
                  >
                    <Heart className={`h-5 w-5 stroke-[1.5] ${isWishlisted ? "fill-current" : ""}`} />
                  </button>
                  <button
                    onClick={handleShare}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2D5C6] bg-white text-neutral-900 transition-colors hover:text-[#8A6847]"
                    type="button"
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

              <div className="rounded-[28px] border border-[#E6D9CA] bg-white/72 px-5">
                {[
                  {
                    id: "features",
                    label: "Product Details",
                    content: <ProductFeatures product={product} />,
                  },
                  {
                    id: "specs",
                    label: "Specifications",
                    content: (
                      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Package className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Material</p>
                            <p className="text-sm font-medium text-neutral-900">Premium Full-Grain Deri</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Hammer className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Craft</p>
                            <p className="text-sm font-medium text-neutral-900">Hand Stitching (Saddle Stitch)</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Clock className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Production Time</p>
                            <p className="text-sm font-medium text-neutral-900">1-3 Business Days</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <ShieldCheck className="h-5 w-5 stroke-[1.5] text-neutral-500" />
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-neutral-500">Quality</p>
                            <p className="text-sm font-medium text-neutral-900">Handmade Artisan Finish</p>
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "shipping",
                    label: "Shipping and Returns",
                    content: (
                      <div className="space-y-5 text-sm text-neutral-600">
                        <div>
                          <h4 className="mb-2 font-semibold text-neutral-900">Shipping and Returns</h4>
                          <ul className="space-y-1.5">
                            <li>
                              <strong className="text-neutral-800">Free Shipping:</strong> on orders of 1500 TL and above
                            </li>
                            <li>
                              <strong className="text-neutral-800">Delivery:</strong> 1-3 business days preparation + 2-4 business days shipping
                            </li>
                            <li>
                              <strong className="text-neutral-800">Shipping Partner:</strong> may vary by delivery address
                            </li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 font-semibold text-neutral-900">Payment Options</h4>
                          <ul className="space-y-1.5">
                            <li>Credit/Debit Card (3D Secure)</li>
                            <li>Bank Transfer</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="mb-2 font-semibold text-neutral-900">Return Policy</h4>
                          <ul className="space-y-1.5">
                            <li>
                              <strong className="text-neutral-800">14 Gun Icinde Iade Hakkı</strong>
                            </li>
                            <li>
                              <strong className="text-neutral-800">Exceptions:</strong> custom-made items are not eligible for return
                            </li>
                            <li>
                              <strong className="text-neutral-800">Return Shipping Cost:</strong> paid by the buyer
                            </li>
                          </ul>
                        </div>
                      </div>
                    ),
                  },
                ].map((item) => {
                  const isOpen = openAccordions.has(item.id);
                  return (
                    <div key={item.id} className="border-b border-neutral-200 last:border-b-0">
                      <button
                        onClick={() => toggleAccordion(item.id)}
                        className="flex w-full items-center justify-between py-4 text-sm font-medium uppercase tracking-wide text-neutral-900"
                        type="button"
                      >
                        {item.label}
                        <ChevronDown
                          className={`h-4 w-4 text-neutral-500 transition-transform ${
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

              {product.sku ? (
                <p className="text-xs text-neutral-400">
                  SKU: <span className="font-mono">{product.sku}</span>
                </p>
              ) : null}
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
        className="border-t border-neutral-200 py-16 lg:py-20"
        style={{ backgroundColor: "#f8f8f8f8" }}
      >
        <div className="container-premium">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-neutral-500">
                Explore
              </span>
              <h2 className="text-2xl tracking-tight text-neutral-900 lg:text-3xl">Similar Products</h2>
            </div>
            <Link
              href={buildLocalizedPath("/urunler", locale)}
              className="hidden items-center gap-1 font-medium text-neutral-900 transition-colors hover:text-neutral-600 sm:flex"
            >
              View All
              <ChevronRight className="h-5 w-5" />
            </Link>
          </div>

          {isLoadingRelated ? (
            <div className="grid grid-cols-2 gap-6 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-2xl bg-neutral-100" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-6">
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
        stockLabel={stockStatus.text}
        onAddToCart={handleAddToCart}
        onToggleWishlist={toggleWishlist}
        isWishlisted={isWishlisted}
        isOutOfStock={isOutOfStock || isSchemaLoading}
      />
    </div>
  );
}
