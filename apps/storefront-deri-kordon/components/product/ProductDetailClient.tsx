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
  Truck,
  Shield,
  ArrowLeft,
  Package,
  ChevronRight,
  BadgeCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { NutritionLabel } from "@/components/product/NutritionLabel";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import { ComplementaryProducts } from "@/components/product/ComplementaryProducts";
import { MobileStickyBar } from "@/components/product/MobileStickyBar";
import { DynamicCustomizationForm } from "@/components/product/dynamic-customization-form";
import { Product } from "@/types/product";
import { CartCustomizationPayload } from "@/types/product-customization";
import { supabase } from "@/lib/supabase";

// Lazy load ProductCard
const ProductCard = React.lazy(() =>
  import("@/components/product/ProductCard").then((mod) => ({
    default: mod.ProductCard,
  }))
);
import React from "react";

type TabType = "features" | "nutrition" | "reviews";
type SchemaAssignmentRow = {
  schema_id: string;
  is_default: boolean;
  sort_order: number;
};
type SchemaRow = {
  id: string;
  is_active: boolean;
};
type VariantAttribute = {
  image_url?: string | null;
};

interface ProductDetailClientProps {
  slug: string;
  initialProduct: Product | null;
  initialRelatedProducts?: Product[];
  initialVariantIndex?: number;
}

// Trust Badge Component
function TrustBadge({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/50 border border-[#7B1113]/10">
      <div className="w-10 h-10 rounded-lg bg-[#7B1113]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5 text-[#7B1113]" />
      </div>
      <div>
        <p className="font-medium text-[#7B1113] text-sm">{title}</p>
        <p className="text-xs text-[#6b4b4c] mt-0.5">{description}</p>
      </div>
    </div>
  );
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
  const [complementaryProducts, setComplementaryProducts] = useState<Product[]>(
    []
  );
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);

  const [selectedVariant, setSelectedVariant] = useState(initialVariantIndex);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>("features");
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [activeSchemaId, setActiveSchemaId] = useState<string | null>(null);
  const [isSchemaLoading, setIsSchemaLoading] = useState(false);

  const { addToCart } = useCart();

  // Load wishlist state
  useEffect(() => {
    if (typeof window !== "undefined" && product) {
      const wishlist = JSON.parse(localStorage.getItem("wishlist") || "[]");
      setIsWishlisted(wishlist.includes(product.id));
    }
  }, [product]);

  // Load related & complementary products
  useEffect(() => {
    if (product?.category) {
      setIsLoadingRelated(true);
      fetch(`/api/products?category=${product.category}&limit=8`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.products) {
            const filtered = data.products.filter((p: Product) => p.slug !== slug);
            setRelatedProducts(filtered.slice(0, 4));
            setComplementaryProducts(filtered.slice(4, 8));
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
        const { data: assignments, error: assignmentError } = await supabase
          .from("product_schema_assignments")
          .select("schema_id,is_default,sort_order")
          .eq("product_id", product.id)
          .order("is_default", { ascending: false })
          .order("sort_order", { ascending: true });

        if (assignmentError) throw assignmentError;
        if (!assignments || assignments.length === 0) {
          if (mounted) setActiveSchemaId(null);
          return;
        }

        const schemaIds = (assignments as SchemaAssignmentRow[]).map((row) => row.schema_id);
        const { data: schemas, error: schemaError } = await supabase
          .from("product_customization_schemas")
          .select("id,is_active")
          .in("id", schemaIds);

        if (schemaError) throw schemaError;
        const activeSchemaId = (assignments as SchemaAssignmentRow[]).find((row) =>
          (schemas as SchemaRow[] | null)?.some(
            (schema) => schema.id === row.schema_id && schema.is_active
          )
        )?.schema_id;

        if (mounted) {
          setActiveSchemaId(activeSchemaId || null);
        }
      } catch (error) {
        console.error("Schema assignment load error:", error);
        if (mounted) setActiveSchemaId(null);
      } finally {
        if (mounted) setIsSchemaLoading(false);
      }
    };

    loadActiveSchema();
    return () => {
      mounted = false;
    };
  }, [product?.id]);

  const variants = product?.variants || [];
  const variant = variants[selectedVariant] || variants[0];

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
      <div className="min-h-screen flex items-center justify-center bg-[#FFF5F5]">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-[#F3E0E1] rounded mb-4" />
          <div className="h-4 w-32 bg-[#F3E0E1] rounded" />
        </div>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FFF5F5]">
        <div className="text-center">
          <p className="text-[#6b4b4c]">Ürün bilgisi yüklenemedi.</p>
        </div>
      </div>
    );
  }

  const discountPercent = variant.originalPrice
    ? Math.round((1 - variant.price / variant.originalPrice) * 100)
    : 0;

  const isOutOfStock = variant.stock <= 0;

  const handleAddToCart = () => {
    if (!isOutOfStock) {
      addToCart(product, variant, quantity);
    }
  };

  const handleAddToCartWithCustomization = (
    customization: CartCustomizationPayload
  ) => {
    if (!isOutOfStock) {
      addToCart(product, variant, quantity, customization);
    }
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
    if (isOutOfStock) return { text: "Tükendi", color: "text-gray-400" };
    if (variant.stock <= 5)
      return { text: `Son ${variant.stock} adet`, color: "text-amber-600" };
    return { text: "Stokta var", color: "text-green-600" };
  };

  const stockStatus = getStockStatus();

  return (
    <div className="min-h-screen bg-[#FFF5F5]">
      {/* Back Navigation - Modern */}
      <div className="border-b border-[#7B1113]/10 bg-white/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-4 py-4">
            <Link
              href="/urunler"
              className="flex items-center gap-2 text-sm text-[#6b4b4c] hover:text-[#7B1113] transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-[#F3E0E1] flex items-center justify-center">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="hidden sm:inline">Tüm Ürünlere Dön</span>
            </Link>
            <div className="flex items-center gap-2 text-sm text-[#6b4b4c] ml-auto">
              <Link href="/" className="hover:text-[#7B1113]">Ana Sayfa</Link>
              <ChevronRight className="w-4 h-4" />
              <Link href="/urunler" className="hover:text-[#7B1113]">Ürünler</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-[#7B1113] font-medium truncate max-w-[150px]">
                {product.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Product Section */}
      <section className="py-8 lg:py-16">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
            {/* Left: Image Gallery - UNCHANGED */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ImageGallery 
                key={`${product.id}-${selectedVariant}`} 
                images={displayImages} 
                productName={product.name} 
              />
            </div>

            {/* Right: Product Info - Clean Modern Design */}
            <div className="space-y-5">
              {/* Title - Responsive & Clean */}
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#7B1113] leading-snug">
                {product.name}
              </h1>

              {/* Rating - Compact */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.floor(product.rating || 0)
                          ? "fill-amber-400 text-amber-400"
                          : "fill-gray-200 text-gray-200"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-[#6b4b4c]">
                  ({product.reviewCount || 0} değerlendirme)
                </span>
              </div>

              {/* Short Description */}
              <p className="text-[#6b4b4c] leading-relaxed">
                {product.shortDescription}
              </p>

              {/* Badges - Compact */}
              <div className="flex flex-wrap gap-2">
                {discountPercent > 0 && (
                  <span className="px-3 py-1 bg-red-500 text-white text-xs font-semibold rounded-full">
                    %{discountPercent} İNDİRİM
                  </span>
                )}
                {product.sugarFree && (
                  <span className="px-3 py-1 bg-[#F3E0E1] text-[#7B1113] text-xs font-medium rounded-full">
                    Şekersiz
                  </span>
                )}
                {product.vegan && (
                  <span className="px-3 py-1 bg-[#F3E0E1] text-[#7B1113] text-xs font-medium rounded-full">
                    Vegan
                  </span>
                )}
                {product.glutenFree && (
                  <span className="px-3 py-1 bg-[#F3E0E1] text-[#7B1113] text-xs font-medium rounded-full">
                    Glutensiz
                  </span>
                )}
              </div>

              {/* Variant Selector V2 */}
              <VariantSelectorV2
                variants={variants}
                selectedIndex={selectedVariant}
                onSelect={setSelectedVariant}
              />

              {/* Divider */}
              <div className="h-px bg-[#7B1113]/10" />

              {/* Price & Quantity Section */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 border border-[#7B1113]/10">
                {/* Price & Stock */}
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="text-3xl sm:text-4xl font-bold text-[#7B1113]">
                    {variant.price} ₺
                  </span>
                  {variant.originalPrice && (
                    <span className="text-lg sm:text-xl text-[#6b4b4c] line-through">
                      {variant.originalPrice} ₺
                    </span>
                  )}
                  {/* Stock Status - Next to Price */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <div className={`w-2 h-2 rounded-full ${isOutOfStock ? 'bg-gray-400' : variant.stock <= 5 ? 'bg-amber-500' : 'bg-green-500'}`} />
                    <span className={`text-xs sm:text-sm font-medium ${stockStatus.color}`}>
                      {stockStatus.text}
                    </span>
                  </div>
                </div>
                
                {/* Unit Price */}
                <p className="text-sm text-[#6b4b4c] mb-5">
                  {(variant.price / (variant.weight / 100)).toFixed(2)} ₺ / 100g
                </p>

                {/* Quantity */}
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-sm font-medium text-[#7B1113]">Adet</span>
                  <div className="flex items-center bg-[#F3E0E1] rounded-full">
                    <button
                      onClick={() => handleQuantityChange(-1)}
                      disabled={quantity <= 1}
                      className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-[#7B1113]/10 disabled:opacity-50 transition-colors"
                    >
                      <Minus className="w-5 h-5 text-[#7B1113]" />
                    </button>
                    <span className="w-12 text-center font-semibold text-[#7B1113] text-lg">
                      {quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(1)}
                      disabled={quantity >= (variant.stock || 10)}
                      className="w-12 h-12 flex items-center justify-center rounded-full hover:bg-[#7B1113]/10 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="w-5 h-5 text-[#7B1113]" />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                {isSchemaLoading ? (
                  <div className="w-full py-4 text-sm text-[#6b4b4c]">
                    Ekstra seçenekler yükleniyor...
                  </div>
                ) : activeSchemaId ? (
                  <div className="space-y-3">
                    <DynamicCustomizationForm
                      schemaId={activeSchemaId}
                      productId={product.id}
                      variantId={variant.id}
                      basePrice={variant.price}
                      onAddToCart={handleAddToCartWithCustomization}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={toggleWishlist}
                        className={`
                          w-16 h-16 flex items-center justify-center rounded-xl border-2 transition-all
                          ${isWishlisted
                            ? "bg-red-50 border-red-300 text-red-500"
                            : "border-[#7B1113]/20 text-[#7B1113] hover:border-[#7B1113]/40 bg-white"
                          }
                        `}
                      >
                        <Heart className={`h-6 w-6 ${isWishlisted ? "fill-current" : ""}`} />
                      </button>
                      <button
                        onClick={handleShare}
                        className="w-16 h-16 flex items-center justify-center rounded-xl border-2 border-[#7B1113]/20 text-[#7B1113] hover:border-[#7B1113]/40 bg-white transition-all"
                      >
                        <Share2 className="h-6 w-6" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={handleAddToCart}
                      disabled={isOutOfStock}
                      className={`
                        flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-lg
                        transition-all duration-300
                        ${isOutOfStock
                          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                          : "bg-[#7B1113] text-white hover:bg-[#5d0e0f] active:scale-[0.98] shadow-lg shadow-[#7B1113]/25"
                        }
                      `}
                    >
                      <ShoppingCart className="h-6 w-6" />
                      {isOutOfStock ? "Tükendi" : "Sepete Ekle"}
                    </button>
                    <button
                      onClick={toggleWishlist}
                      className={`
                        w-16 h-16 flex items-center justify-center rounded-xl border-2 transition-all
                        ${isWishlisted
                          ? "bg-red-50 border-red-300 text-red-500"
                          : "border-[#7B1113]/20 text-[#7B1113] hover:border-[#7B1113]/40 bg-white"
                        }
                      `}
                    >
                      <Heart className={`h-6 w-6 ${isWishlisted ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={handleShare}
                      className="w-16 h-16 flex items-center justify-center rounded-xl border-2 border-[#7B1113]/20 text-[#7B1113] hover:border-[#7B1113]/40 bg-white transition-all"
                    >
                      <Share2 className="h-6 w-6" />
                    </button>
                  </div>
                )}
              </div>

              {/* Trust Badges - Modern Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TrustBadge
                  icon={Truck}
                  title="Ücretsiz Kargo"
                  description="500₺ ve üzeri siparişlerde"
                />
                <TrustBadge
                  icon={Shield}
                  title="Güvenli Alışveriş"
                  description="14 gün koşulsuz iade"
                />
                <TrustBadge
                  icon={Package}
                  title="Özenli Paketleme"
                  description="Kırılmaya karşı koruma"
                />
                <TrustBadge
                  icon={BadgeCheck}
                  title="Kalite Garantisi"
                  description="%100 doğal içerik"
                />
              </div>

              {/* SKU */}
              {product.sku && (
                <p className="text-xs text-[#6b4b4c]">
                  Ürün Kodu: <span className="font-mono">{product.sku}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs Section - Modern */}
      <section className="py-16 bg-white border-y border-[#7B1113]/10">
        <div className="container mx-auto px-4">
          {/* Tab Navigation - Pills */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex bg-[#FFF5F5] rounded-full p-1.5 border border-[#7B1113]/10 shadow-sm">
              {[
                { id: "features", label: "Ürün Detayları" },
                { id: "nutrition", label: "Besin Değerleri" },
                { id: "reviews", label: "Yorumlar" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`
                    px-6 py-3 rounded-full text-sm font-medium whitespace-nowrap transition-all
                    ${activeTab === tab.id
                      ? "bg-[#7B1113] text-white shadow-md"
                      : "text-[#6b4b4c] hover:text-[#7B1113]"
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              {activeTab === "features" && (
                <motion.div
                  key="features"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <ProductFeatures product={product} />
                </motion.div>
              )}
              {activeTab === "nutrition" && (
                <motion.div
                  key="nutrition"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                >
                  <NutritionLabel product={product} />
                </motion.div>
              )}
              {activeTab === "reviews" && (
                <motion.div
                  key="reviews"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="text-center py-16 bg-[#FFF5F5] rounded-3xl border border-[#7B1113]/10"
                >
                  <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[#F3E0E1] flex items-center justify-center">
                    <Star className="w-10 h-10 text-[#7B1113]" />
                  </div>
                  <p className="text-xl font-medium text-[#7B1113] mb-2">
                    Henüz Değerlendirme Yok
                  </p>
                  <p className="text-[#6b4b4c] max-w-md mx-auto">
                    Bu ürünü denediniz mi? İlk değerlendiren siz olun ve deneyiminizi paylaşın.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Complementary Products */}
      <ComplementaryProducts
        title="Bu Ürünle Birlikte Alınanlar"
        products={complementaryProducts}
        loading={isLoadingRelated}
      />

      {/* Related Products */}
      <section className="py-16 bg-white border-t border-[#7B1113]/10">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-semibold text-[#7B1113]">
              Benzer Ürünler
            </h2>
            <Link
              href="/urunler"
              className="flex items-center gap-2 text-[#7B1113] font-medium hover:gap-3 transition-all"
            >
              Tümünü Gör
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
          
          {isLoadingRelated ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] bg-[#F3E0E1] rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
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
      {!activeSchemaId && !isSchemaLoading && (
        <MobileStickyBar
          price={variant.price}
          originalPrice={variant.originalPrice}
          onAddToCart={handleAddToCart}
          isOutOfStock={isOutOfStock}
        />
      )}
    </div>
  );
}
