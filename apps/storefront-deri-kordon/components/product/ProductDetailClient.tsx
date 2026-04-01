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
  Clock,
  Award,
  Hammer,
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

type TabType = "features" | "specs" | "shipping";
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

// Trust Badge Component - Premium
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
    <div className="flex items-start gap-4 p-4 bg-[#FAFAFA] border border-[#E5E2DE]">
      <div className="w-12 h-12 bg-[#8A6B37]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-6 h-6 text-[#8A6B37]" />
      </div>
      <div>
        <p className="font-medium text-[#0F1626] text-sm tracking-wide">{title}</p>
        <p className="text-xs text-[#0F1626]/60 mt-1">{description}</p>
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
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="animate-pulse text-center">
          <div className="h-8 w-48 bg-[#E5E2DE] mb-4" />
          <div className="h-4 w-32 bg-[#E5E2DE]" />
        </div>
      </div>
    );
  }

  if (!variant) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAFA]">
        <div className="text-center">
          <p className="text-[#0F1626]/60">Ürün bilgisi yüklenemedi.</p>
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
    if (isOutOfStock) return { text: "Tükendi", color: "text-[#0F1626]/40" };
    if (variant.stock <= 5)
      return { text: `Son ${variant.stock} adet`, color: "text-[#8A6B37]" };
    return { text: "Stokta var", color: "text-[#0F1626]/60" };
  };

  const stockStatus = getStockStatus();

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Premium Breadcrumb Navigation */}
      <div className="bg-[#0F1626] border-b border-[#8A6B37]/20">
        <div className="container-premium">
          <div className="flex items-center gap-4 py-4">
            <Link
              href="/urunler"
              className="flex items-center gap-2 text-sm text-white/60 hover:text-[#8A6B37] transition-colors"
            >
              <div className="w-8 h-8 border border-white/20 flex items-center justify-center hover:border-[#8A6B37] transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="hidden sm:inline">Tüm Ürünlere Dön</span>
            </Link>
            <div className="flex items-center gap-2 text-sm text-white/40 ml-auto">
              <Link href="/" className="hover:text-white transition-colors">Ana Sayfa</Link>
              <ChevronRight className="w-4 h-4" />
              <Link href="/urunler" className="hover:text-white transition-colors">Ürünler</Link>
              <ChevronRight className="w-4 h-4" />
              <span className="text-[#8A6B37] font-medium truncate max-w-[150px]">
                {product.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Product Section */}
      <section className="py-8 lg:py-16">
        <div className="container-premium">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-16">
            {/* Left: Image Gallery */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              <ImageGallery 
                key={`${product.id}-${selectedVariant}`} 
                images={displayImages} 
                productName={product.name} 
              />
            </div>

            {/* Right: Product Info - Premium Design */}
            <div className="space-y-6">
              {/* Category Badge */}
              <div className="flex items-center gap-3">
                <span className="text-[#8A6B37] text-xs font-medium tracking-[0.2em] uppercase">
                  {product.category}
                </span>
                <span className="w-8 h-px bg-[#8A6B37]/30" />
                {product.featured && (
                  <span className="px-3 py-1 bg-[#8A6B37]/10 text-[#8A6B37] text-xs tracking-wider uppercase border border-[#8A6B37]/20">
                    Öne Çıkan
                  </span>
                )}
              </div>

              {/* Title */}
              <h1 className="font-serif text-3xl lg:text-4xl text-[#0F1626] leading-tight">
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
                          : "fill-[#E5E2DE] text-[#E5E2DE]"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-sm text-[#0F1626]/60">
                  ({product.reviewCount || 0} değerlendirme)
                </span>
              </div>

              {/* Short Description */}
              <p className="text-[#0F1626]/70 leading-relaxed">
                {product.shortDescription}
              </p>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {discountPercent > 0 && (
                  <span className="px-3 py-1.5 bg-[#0F1626] text-white text-xs font-medium tracking-wider uppercase">
                    %{discountPercent} İndirim
                  </span>
                )}
                {product.new && (
                  <span className="px-3 py-1.5 bg-[#8A6B37] text-white text-xs font-medium tracking-wider uppercase">
                    Yeni
                  </span>
                )}
                {product.vegan && (
                  <span className="px-3 py-1.5 bg-[#8A6B37]/10 text-[#8A6B37] text-xs font-medium border border-[#8A6B37]/20">
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

              {/* Divider */}
              <div className="h-px bg-[#E5E2DE]" />

              {/* Price & Quantity Section */}
              <div className="bg-white p-6 border border-[#E5E2DE]">
                {/* Price & Stock */}
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <span className="font-serif text-3xl lg:text-4xl text-[#0F1626]">
                    {variant.price} <span className="text-lg">₺</span>
                  </span>
                  {variant.originalPrice && (
                    <span className="text-lg text-[#0F1626]/40 line-through">
                      {variant.originalPrice} ₺
                    </span>
                  )}
                  {/* Stock Status */}
                  <div className="flex items-center gap-2 ml-auto">
                    <div className={`w-2 h-2 ${isOutOfStock ? 'bg-[#0F1626]/20' : variant.stock <= 5 ? 'bg-[#8A6B37]' : 'bg-green-500'}`} />
                    <span className={`text-sm ${stockStatus.color}`}>
                      {stockStatus.text}
                    </span>
                  </div>
                </div>
                
                {/* Quantity */}
                <div className="flex items-center gap-4 mb-6">
                  <span className="text-sm font-medium text-[#0F1626] uppercase tracking-wider">Adet</span>
                  <div className="flex items-center border border-[#E5E2DE]">
                    <button
                      onClick={() => handleQuantityChange(-1)}
                      disabled={quantity <= 1}
                      className="w-12 h-12 flex items-center justify-center hover:bg-[#FAFAFA] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="w-4 h-4 text-[#0F1626]" />
                    </button>
                    <span className="w-12 text-center font-medium text-[#0F1626] text-lg">
                      {quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(1)}
                      disabled={quantity >= (variant.stock || 10)}
                      className="w-12 h-12 flex items-center justify-center hover:bg-[#FAFAFA] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-4 h-4 text-[#0F1626]" />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                {isSchemaLoading ? (
                  <div className="w-full py-4 text-sm text-[#0F1626]/60">
                    Ekstra seçenekler yükleniyor...
                  </div>
                ) : activeSchemaId ? (
                  <div className="space-y-4">
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
                          w-14 h-14 flex items-center justify-center border transition-all
                          ${isWishlisted
                            ? "bg-[#8A6B37]/10 border-[#8A6B37] text-[#8A6B37]"
                            : "border-[#E5E2DE] text-[#0F1626] hover:border-[#8A6B37] bg-white"
                          }
                        `}
                      >
                        <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
                      </button>
                      <button
                        onClick={handleShare}
                        className="w-14 h-14 flex items-center justify-center border border-[#E5E2DE] text-[#0F1626] hover:border-[#8A6B37] bg-white transition-colors"
                      >
                        <Share2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={handleAddToCart}
                      disabled={isOutOfStock}
                      className={`
                        flex-1 flex items-center justify-center gap-3 py-4 font-medium uppercase tracking-wider
                        transition-all duration-300
                        ${isOutOfStock
                          ? "bg-[#E5E2DE] text-[#0F1626]/30 cursor-not-allowed"
                          : "bg-[#8A6B37] text-white hover:bg-[#0F1626]"
                        }
                      `}
                    >
                      <ShoppingCart className="h-5 w-5" />
                      {isOutOfStock ? "Tükendi" : "Sepete Ekle"}
                    </button>
                    <button
                      onClick={toggleWishlist}
                      className={`
                        w-14 h-14 flex items-center justify-center border transition-all
                        ${isWishlisted
                          ? "bg-[#8A6B37]/10 border-[#8A6B37] text-[#8A6B37]"
                          : "border-[#E5E2DE] text-[#0F1626] hover:border-[#8A6B37] bg-white"
                        }
                      `}
                    >
                      <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={handleShare}
                      className="w-14 h-14 flex items-center justify-center border border-[#E5E2DE] text-[#0F1626] hover:border-[#8A6B37] bg-white transition-colors"
                    >
                      <Share2 className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Trust Badges - Premium Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  icon={Award}
                  title="Kalite Garantisi"
                  description="Premium deri malzemeler"
                />
                <TrustBadge
                  icon={Hammer}
                  title="El Yapımı"
                  description="Usta işçiliği"
                />
              </div>

              {/* SKU */}
              {product.sku && (
                <p className="text-xs text-[#0F1626]/40">
                  ÜRÜN KODU: <span className="font-mono">{product.sku}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Tabs Section - Premium */}
      <section className="py-16 lg:py-24 bg-white border-y border-[#E5E2DE]">
        <div className="container-premium">
          {/* Tab Navigation */}
          <div className="flex justify-center mb-12">
            <div className="inline-flex border border-[#E5E2DE] p-1">
              {[
                { id: "features", label: "Ürün Detayları" },
                { id: "specs", label: "Özellikler" },
                { id: "shipping", label: "Kargo & İade" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`
                    px-8 py-3 text-sm font-medium tracking-wider uppercase transition-all
                    ${activeTab === tab.id
                      ? "bg-[#0F1626] text-white"
                      : "text-[#0F1626]/60 hover:text-[#0F1626]"
                    }
                  `}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab Content */}
          <div className="max-w-5xl mx-auto">
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
              {activeTab === "specs" && (
                <motion.div
                  key="specs"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="prose prose-lg max-w-none"
                >
                  <div className="bg-[#FAFAFA] p-8 border border-[#E5E2DE]">
                    <h3 className="font-serif text-2xl text-[#0F1626] mb-6">Ürün Özellikleri</h3>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="flex items-center gap-4 p-4 bg-white border border-[#E5E2DE]">
                        <Package className="w-6 h-6 text-[#8A6B37]" />
                        <div>
                          <p className="text-xs text-[#0F1626]/60 uppercase tracking-wider">Malzeme</p>
                          <p className="font-medium text-[#0F1626]">Premium Full-Grain Deri</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 p-4 bg-white border border-[#E5E2DE]">
                        <Hammer className="w-6 h-6 text-[#8A6B37]" />
                        <div>
                          <p className="text-xs text-[#0F1626]/60 uppercase tracking-wider">İşçilik</p>
                          <p className="font-medium text-[#0F1626]">El Dikişi (Saddle Stitch)</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 p-4 bg-white border border-[#E5E2DE]">
                        <Clock className="w-6 h-6 text-[#8A6B37]" />
                        <div>
                          <p className="text-xs text-[#0F1626]/60 uppercase tracking-wider">Üretim Süresi</p>
                          <p className="font-medium text-[#0F1626]">3-5 İş Günü</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 p-4 bg-white border border-[#E5E2DE]">
                        <Award className="w-6 h-6 text-[#8A6B37]" />
                        <div>
                          <p className="text-xs text-[#0F1626]/60 uppercase tracking-wider">Garanti</p>
                          <p className="font-medium text-[#0F1626]">2 Yıl</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              {activeTab === "shipping" && (
                <motion.div
                  key="shipping"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-[#FAFAFA] p-8 border border-[#E5E2DE]"
                >
                  <h3 className="font-serif text-2xl text-[#0F1626] mb-6">Kargo & İade</h3>
                  <div className="space-y-6 text-[#0F1626]/70">
                    <div>
                      <h4 className="font-medium text-[#0F1626] mb-2">Kargo Bilgileri</h4>
                      <p>Siparişleriniz 3-5 iş günü içerisinde kargoya verilir. 500₺ ve üzeri siparişlerde kargo ücretsizdir.</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-[#0F1626] mb-2">İade Politikası</h4>
                      <p>Ürünleri teslim aldıktan sonra 14 gün içinde koşulsuz iade edebilirsiniz. Ürünün kullanılmamış ve orijinal ambalajında olması gerekmektedir.</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-[#0F1626] mb-2">Özel Siparişler</h4>
                      <p>Özel ölçü ve kişiselleştirme taleplerinde üretim süresi 7-10 iş gününe uzayabilir.</p>
                    </div>
                  </div>
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
      <section className="py-16 lg:py-24 bg-[#FAFAFA]">
        <div className="container-premium">
          <div className="flex items-center justify-between mb-12">
            <div>
              <span className="text-[#8A6B37] text-xs font-medium tracking-[0.2em] uppercase block mb-2">Keşfedin</span>
              <h2 className="font-serif text-3xl text-[#0F1626]">
                Benzer Ürünler
              </h2>
            </div>
            <Link
              href="/urunler"
              className="hidden sm:flex items-center gap-2 text-[#0F1626] font-medium hover:text-[#8A6B37] transition-colors"
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
                  className="aspect-[3/4] bg-[#E5E2DE] animate-pulse"
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
