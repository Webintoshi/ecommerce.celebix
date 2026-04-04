"use client";

import { useState, useEffect, Suspense } from "react";
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
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { PersonalizationPreview } from "@/components/product/PersonalizationPreview";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import { MobileStickyBar } from "@/components/product/MobileStickyBar";
import {
  DynamicCustomizationForm,
  type CustomizationSelectionState,
} from "@/components/product/dynamic-customization-form";
import { Product } from "@/types/product";
import {
  CustomizationSchema,
  CustomizationStep,
} from "@/types/product-customization";

const ProductCard = React.lazy(() =>
  import("@/components/product/ProductCard").then((mod) => ({
    default: mod.ProductCard,
  }))
);
import React from "react";

type TabType = "features" | "specs" | "shipping";
type VariantAttribute = {
  image_url?: string | null;
};
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
    initialRelatedProducts
  );
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const [selectedVariant, setSelectedVariant] = useState(initialVariantIndex);
  const [quantity, setQuantity] = useState(1);
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set());
  const toggleAccordion = (id: string) => {
    const next = new Set(openAccordions);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpenAccordions(next);
  };
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [activeSchema, setActiveSchema] = useState<ResolvedCustomizationSchema | null>(null);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);
  const [customizationState, setCustomizationState] = useState<CustomizationSelectionState>(
    createEmptyCustomizationState(initialProduct?.variants?.[initialVariantIndex]?.price || initialProduct?.variants?.[0]?.price || 0)
  );
  const [customizationValidationNonce, setCustomizationValidationNonce] = useState(0);
  const extrasSectionRef = React.useRef<HTMLDivElement | null>(null);

  const { addToCart } = useCart();

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
    setOpenAccordions(new Set());
  }, [initialVariantIndex, initialProduct?.id]);

  // Load wishlist state
  useEffect(() => {
    if (typeof window !== "undefined" && product) {
      const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
      setIsWishlisted(wishlist.includes(product.id));
    }
  }, [product]);

  // Load related products
  useEffect(() => {
    if (product?.category) {
      setIsLoadingRelated(true);
      fetch(`/api/products?category=${product.category}&limit=8`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.products) {
            const filtered = data.products.filter((p: Product) => p.slug !== slug);
            setRelatedProducts(filtered.slice(0, 4));
          }
        })
      .finally(() => setIsLoadingRelated(false));
    }
  }, [product?.category, slug]);

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

  // Get variant display images
  const displayImages = React.useMemo(() => {
    const baseImages = product.images || [];
    
    // Priority 1: Variant's own images (from variant.images)
    if (variant?.images && variant.images.length > 0) {
      const variantImages = variant.images.filter((img: string) => img && img.length > 0);
      if (variantImages.length > 0) {
        // Combine variant image first, then product images
        const combined = [...variantImages];
        baseImages.forEach((img: string) => {
          if (!combined.includes(img)) combined.push(img);
        });
        return combined;
      }
    }
    
    // Priority 2: Attribute value images (from variant.attributes)
    const attrImages =
      (variant?.attributes as VariantAttribute[] | undefined)
        ?.map((attr) => attr.image_url)
        .filter((value): value is string => Boolean(value)) || [];
    if (attrImages.length > 0) {
      const combined = [...attrImages];
      baseImages.forEach((img: string) => {
        if (!combined.includes(img)) combined.push(img);
      });
      return combined;
    }
    
    return baseImages;
  }, [product?.images, variant?.images, variant?.attributes]);

  if (loading || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F8F8]">
        <div className="animate-pulse text-center">
          <div className="h-8 w-48 bg-neutral-200 rounded mb-4" />
          <div className="h-4 w-32 bg-neutral-200 rounded" />
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
      Math.max(1, Math.min(variant.stock || 10, prev + delta))
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

  // Stock status text
  const getStockStatus = () => {
    if (isOutOfStock) return { text: "Tükendi", color: "text-neutral-400" };
    if (variant.stock <= 5)
      return { text: `Son ${variant.stock} adet`, color: "text-amber-600" };
    return { text: "Stokta var", color: "text-neutral-500" };
  };

  const stockStatus = getStockStatus();
  const displayPrice = activeSchema ? customizationState.finalPrice : variant.price;
  const displayOriginalPrice =
    variant.originalPrice !== undefined
      ? variant.originalPrice + (activeSchema ? customizationState.extraPrice : 0)
      : undefined;

  return (
    <div className="min-h-screen bg-[#F8F8F8]">
      {/* Minimal Breadcrumb */}
      <div className="border-b border-neutral-200 bg-[#F8F8F8]">
        <div className="container-premium">
          <div className="flex items-center gap-3 py-4 text-sm">
            <Link
              href="/urunler"
              className="flex items-center gap-2 text-neutral-500 hover:text-neutral-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Tüm Ürünlere Dön</span>
            </Link>
            <div className="flex items-center gap-2 text-neutral-400 ml-auto">
              <Link href="/" className="hover:text-neutral-600 transition-colors">Ana Sayfa</Link>
              <ChevronRight className="w-4 h-4" />
              <Link href="/urunler" className="hover:text-neutral-600 transition-colors">Ürünler</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-neutral-900 font-medium truncate max-w-[150px]">
                {product.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Product Section */}
      <section className="py-8 lg:py-12">
        <div className="container-premium">
          <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-8 lg:gap-12 items-start">
            {/* Left: Image Gallery (sticky) */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ImageGallery 
                key={`${product.id}-${selectedVariant}`} 
                images={displayImages} 
                productName={product.name} 
              />
            </div>

            {/* Right: Product Info */}
            <div className="space-y-5">
              {/* Category Badge */}
              <div className="flex items-center gap-3">
                <span className="text-neutral-500 text-xs font-medium tracking-[0.2em] uppercase">
                  {product.category}
                </span>
                <span className="w-8 h-px bg-neutral-300" />
                {product.featured && (
                  <span className="px-2.5 py-1 bg-neutral-900 text-white text-[10px] tracking-wider uppercase rounded-full">
                    Öne Çıkan
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="store-product-title-detail text-neutral-900 tracking-tight">
                {product.name}
              </h1>

              {/* Rating */}
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

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {discountPercent > 0 && (
                  <span className="px-2.5 py-1 bg-neutral-900 text-white text-[10px] font-medium tracking-wider uppercase rounded-full">
                    %{discountPercent} İndirim
                  </span>
                )}
                {product.new && (
                  <span className="px-2.5 py-1 bg-neutral-900 text-white text-[10px] font-medium tracking-wider uppercase rounded-full">
                    Yeni
                  </span>
                )}
                {product.vegan && (
                  <span className="px-2.5 py-1 bg-white text-neutral-900 text-[10px] font-medium border border-neutral-200 rounded-full">
                    Vegan
                  </span>
                )}
              </div>

              {/* Variant Selector V2 */}
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
                <div ref={extrasSectionRef} className="space-y-3 border-b border-neutral-200 pb-5">
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-500 text-xs font-medium tracking-[0.2em] uppercase">
                      Kişiselleştirme
                    </span>
                    <span className="w-8 h-px bg-neutral-300" />
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

              {/* Price & Quantity */}
              <div className="space-y-5 border-y border-neutral-200 py-5">
                {/* Price & Stock */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-3xl lg:text-4xl text-neutral-900 tracking-tight">
                    {displayPrice} <span className="text-lg font-normal">₺</span>
                  </span>
                  {displayOriginalPrice !== undefined && (
                    <span className="text-lg text-neutral-400 line-through">
                      {displayOriginalPrice} ₺
                    </span>
                  )}
                  {/* Stock Status */}
                  <div className="flex items-center gap-2 ml-auto">
                    <div className={`w-2 h-2 rounded-full ${isOutOfStock ? 'bg-neutral-300' : variant.stock <= 5 ? 'bg-amber-500' : 'bg-green-500'}`} />
                    <span className={`text-sm ${stockStatus.color}`}>
                      {stockStatus.text}
                    </span>
                  </div>
                </div>
                {activeSchema && customizationState.extraPrice > 0 && (
                  <p className="text-sm text-neutral-500">
                    Kişiselleştirme farkı: +{customizationState.extraPrice} ₺
                  </p>
                )}
                
                {/* Actions */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-neutral-900 uppercase tracking-wide">Adet</span>
                    <div className="flex items-center rounded-full border border-neutral-200 overflow-hidden bg-[#F8F8F8]">
                      <button
                        onClick={() => handleQuantityChange(-1)}
                        disabled={quantity <= 1}
                        className="w-10 h-10 flex items-center justify-center hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Minus className="w-4 h-4 text-neutral-900 stroke-[1.5]" />
                      </button>
                      <span className="w-10 text-center font-medium text-neutral-900 text-base">
                        {quantity}
                      </span>
                      <button
                        onClick={() => handleQuantityChange(1)}
                        disabled={quantity >= (variant.stock || 10)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-neutral-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Plus className="w-4 h-4 text-neutral-900 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock || isSchemaLoading}
                    className={`
                      min-w-[220px] flex-1 flex items-center justify-center gap-2 py-3.5 font-medium uppercase tracking-wide text-sm
                      transition-all duration-300 rounded-full
                      ${isOutOfStock || isSchemaLoading
                        ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                        : "bg-[#8A6B37] text-white hover:bg-[#755a2d]"
                      }
                    `}
                  >
                    <ShoppingCart className="h-5 w-5 stroke-[1.5]" />
                    {isSchemaLoading ? "Yükleniyor" : isOutOfStock ? "Tükendi" : "Sepete Ekle"}
                  </button>
                  <button
                    onClick={toggleWishlist}
                    className={`
                      w-10 h-10 flex items-center justify-center text-neutral-900 transition-all
                      ${isWishlisted
                        ? "text-[#8A6B37]"
                        : "hover:text-[#8A6B37]"
                      }
                    `}
                  >
                    <Heart className={`h-5 w-5 stroke-[1.5] ${isWishlisted ? "fill-current" : ""}`} />
                  </button>
                  <button
                    onClick={handleShare}
                    className="w-10 h-10 flex items-center justify-center text-neutral-900 hover:text-[#8A6B37] transition-colors"
                  >
                    <Share2 className="h-5 w-5 stroke-[1.5]" />
                  </button>
                </div>
              </div>

              <PersonalizationPreview
                category={product.category}
                subcategory={product.subcategory}
              />

              {/* Accordions — Inline in right column */}
              <div className="pt-1 border-t border-neutral-200">
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
                      <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5">
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Package className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                          <div>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Malzeme</p>
                            <p className="text-sm font-medium text-neutral-900">Premium Full-Grain Deri</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Hammer className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                          <div>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">İşçilik</p>
                            <p className="text-sm font-medium text-neutral-900">El Dikişi (Saddle Stitch)</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <Clock className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                          <div>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Üretim Süresi</p>
                            <p className="text-sm font-medium text-neutral-900">3-5 İş Günü</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
                          <BadgeCheck className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                          <div>
                            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Garanti</p>
                            <p className="text-sm font-medium text-neutral-900">2 Yıl</p>
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: "shipping",
                    label: "Kargo & İade",
                    content: (
                      <div className="space-y-4 text-sm text-neutral-600">
                        <div>
                          <h4 className="font-medium text-neutral-900 mb-1">Kargo Bilgileri</h4>
                          <p>Siparişleriniz 3-5 iş günü içerisinde kargoya verilir. 500₺ ve üzeri siparişlerde kargo ücretsizdir.</p>
                        </div>
                        <div>
                          <h4 className="font-medium text-neutral-900 mb-1">İade Politikası</h4>
                          <p>Ürünleri teslim aldıktan sonra 14 gün içinde koşulsuz iade edebilirsiniz. Ürünün kullanılmamış ve orijinal ambalajında olması gerekmektedir.</p>
                        </div>
                        <div>
                          <h4 className="font-medium text-neutral-900 mb-1">Özel Siparişler</h4>
                          <p>Özel ölçü ve kişiselleştirme taleplerinde üretim süresi 7-10 iş gününe uzayabilir.</p>
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
                        className="w-full flex items-center justify-between py-4 text-sm font-medium text-neutral-900 uppercase tracking-wide"
                      >
                        {item.label}
                        <ChevronDown className={`w-4 h-4 text-neutral-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pb-5">
                              {item.content}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>

              {/* SKU */}
              {product.sku && (
                <p className="text-xs text-neutral-400">
                  ÜRÜN KODU: <span className="font-mono">{product.sku}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Related Products */}
      <section
        className="border-t border-neutral-200 py-16 lg:py-20"
        style={{ backgroundColor: "#f8f8f8f8" }}
      >
        <div className="container-premium">
          <div className="flex items-center justify-between mb-10">
            <div>
              <span className="text-neutral-500 text-xs font-medium tracking-[0.2em] uppercase block mb-2">Keşfedin</span>
              <h2 className="text-2xl lg:text-3xl text-neutral-900 tracking-tight">
                Benzer Ürünler
              </h2>
            </div>
            <Link
              href="/urunler"
              className="hidden sm:flex items-center gap-1 text-neutral-900 font-medium hover:text-neutral-600 transition-colors"
            >
              Tümünü Gör
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
          
          {isLoadingRelated ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-neutral-100 rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
              <Suspense fallback={null}>
                {relatedProducts.map((p, index) => (
                  <ProductCard key={p.id} product={p} index={index} />
                ))}
              </Suspense>
            </div>
          )}
        </div>
      </section>

      {/* Mobile Sticky Bar */}
      {!isSchemaLoading && (
        <MobileStickyBar
          price={displayPrice}
          originalPrice={displayOriginalPrice}
          onAddToCart={handleAddToCart}
          isOutOfStock={isOutOfStock}
        />
      )}
    </div>
  );
}
