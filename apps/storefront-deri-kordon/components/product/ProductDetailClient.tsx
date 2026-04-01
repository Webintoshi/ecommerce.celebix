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
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCart } from "@/lib/cart-context";
import { ImageGallery } from "@/components/product/ImageGallery";
import { VariantSelectorV2 } from "@/components/product/VariantSelectorV2";
import { ProductFeatures } from "@/components/product/ProductFeatures";
import { MobileStickyBar } from "@/components/product/MobileStickyBar";
import { DynamicCustomizationForm } from "@/components/product/dynamic-customization-form";
import { Product } from "@/types/product";
import { CartCustomizationPayload } from "@/types/product-customization";
import { supabase } from "@/lib/supabase";

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
    if (isOutOfStock) return { text: "Tükendi", color: "text-neutral-400" };
    if (variant.stock <= 5)
      return { text: `Son ${variant.stock} adet`, color: "text-amber-600" };
    return { text: "Stokta var", color: "text-neutral-500" };
  };

  const stockStatus = getStockStatus();

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
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
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
              <h1 className="text-3xl lg:text-4xl text-neutral-900 leading-tight tracking-tight">
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
                          ? "fill-amber-400 text-amber-400"
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

              {/* Price & Quantity Card */}
              <div className="bg-white rounded-2xl p-5 border border-neutral-200 space-y-4">
                {/* Price & Stock */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-3xl lg:text-4xl text-neutral-900 tracking-tight">
                    {variant.price} <span className="text-lg font-normal">₺</span>
                  </span>
                  {variant.originalPrice && (
                    <span className="text-lg text-neutral-400 line-through">
                      {variant.originalPrice} ₺
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
                
                {/* Quantity */}
                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium text-neutral-900 uppercase tracking-wide">Adet</span>
                  <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => handleQuantityChange(-1)}
                      disabled={quantity <= 1}
                      className="w-10 h-10 flex items-center justify-center hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Minus className="w-4 h-4 text-neutral-900 stroke-[1.5]" />
                    </button>
                    <span className="w-10 text-center font-medium text-neutral-900 text-base">
                      {quantity}
                    </span>
                    <button
                      onClick={() => handleQuantityChange(1)}
                      disabled={quantity >= (variant.stock || 10)}
                      className="w-10 h-10 flex items-center justify-center hover:bg-neutral-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus className="w-4 h-4 text-neutral-900 stroke-[1.5]" />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                {isSchemaLoading ? (
                  <div className="w-full py-3 text-sm text-neutral-500">
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
                          w-12 h-12 flex items-center justify-center rounded-xl border transition-all
                          ${isWishlisted
                            ? "bg-neutral-100 border-neutral-900 text-neutral-900"
                            : "border-neutral-200 text-neutral-900 hover:border-neutral-900 bg-white"
                          }
                        `}
                      >
                        <Heart className={`h-5 w-5 stroke-[1.5] ${isWishlisted ? "fill-current" : ""}`} />
                      </button>
                      <button
                        onClick={handleShare}
                        className="w-12 h-12 flex items-center justify-center rounded-xl border border-neutral-200 text-neutral-900 hover:border-neutral-900 bg-white transition-colors"
                      >
                        <Share2 className="h-5 w-5 stroke-[1.5]" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button
                      onClick={handleAddToCart}
                      disabled={isOutOfStock}
                      className={`
                        flex-1 flex items-center justify-center gap-2 py-3.5 font-medium uppercase tracking-wide text-sm
                        transition-all duration-300 rounded-xl
                        ${isOutOfStock
                          ? "bg-neutral-200 text-neutral-400 cursor-not-allowed"
                          : "bg-neutral-900 text-white hover:bg-neutral-800"
                        }
                      `}
                    >
                      <ShoppingCart className="h-5 w-5 stroke-[1.5]" />
                      {isOutOfStock ? "Tükendi" : "Sepete Ekle"}
                    </button>
                    <button
                      onClick={toggleWishlist}
                      className={`
                        w-12 h-12 flex items-center justify-center rounded-xl border transition-all
                        ${isWishlisted
                          ? "bg-neutral-100 border-neutral-900 text-neutral-900"
                          : "border-neutral-200 text-neutral-900 hover:border-neutral-900 bg-white"
                        }
                      `}
                    >
                      <Heart className={`h-5 w-5 stroke-[1.5] ${isWishlisted ? "fill-current" : ""}`} />
                    </button>
                    <button
                      onClick={handleShare}
                      className="w-12 h-12 flex items-center justify-center rounded-xl border border-neutral-200 text-neutral-900 hover:border-neutral-900 bg-white transition-colors"
                    >
                      <Share2 className="h-5 w-5 stroke-[1.5]" />
                    </button>
                  </div>
                )}
              </div>

              {/* Tabs — Inline in right column */}
              <div className="pt-1">
                <div className="flex gap-5 border-b border-neutral-200">
                  {[
                    { id: "features", label: "Ürün Detayları" },
                    { id: "specs", label: "Özellikler" },
                    { id: "shipping", label: "Kargo & İade" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabType)}
                      className={`
                        pb-2 text-xs font-medium tracking-wide uppercase transition-all relative
                        ${activeTab === tab.id
                          ? "text-neutral-900"
                          : "text-neutral-400 hover:text-neutral-600"
                        }
                      `}
                    >
                      {tab.label}
                      {activeTab === tab.id && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-neutral-900" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="py-4">
                  <AnimatePresence mode="wait">
                    {activeTab === "features" && (
                      <motion.div
                        key="features"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <ProductFeatures product={product} />
                      </motion.div>
                    )}
                    {activeTab === "specs" && (
                      <motion.div
                        key="specs"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                      >
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-200">
                            <Package className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                            <div>
                              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Malzeme</p>
                              <p className="text-sm font-medium text-neutral-900">Premium Full-Grain Deri</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-200">
                            <Hammer className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                            <div>
                              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">İşçilik</p>
                              <p className="text-sm font-medium text-neutral-900">El Dikişi (Saddle Stitch)</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-200">
                            <Clock className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                            <div>
                              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Üretim Süresi</p>
                              <p className="text-sm font-medium text-neutral-900">3-5 İş Günü</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-neutral-200">
                            <BadgeCheck className="w-5 h-5 text-neutral-500 stroke-[1.5]" />
                            <div>
                              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Garanti</p>
                              <p className="text-sm font-medium text-neutral-900">2 Yıl</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                    {activeTab === "shipping" && (
                      <motion.div
                        key="shipping"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="space-y-4 text-sm text-neutral-600"
                      >
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
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
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
      <section className="py-16 lg:py-20 bg-white border-t border-neutral-200">
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
