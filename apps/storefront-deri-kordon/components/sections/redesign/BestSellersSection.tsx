"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Heart, ShoppingBag, Star, Watch } from "lucide-react";
import { motion } from "framer-motion";
import { Product } from "@/types/product";
import { getLimitedProducts } from "@/lib/products";
import { ROUTES } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { useWishlist } from "@/lib/wishlist-context";
import { toast } from "sonner";

interface BestSellersSectionProps {
  initialProducts?: Product[];
}

// Default placeholder products
const defaultProducts: Product[] = [
  {
    id: "1",
    name: "Heritage Apple Watch Kayışı",
    slug: "heritage-apple-watch-kayisi",
    images: [],
    variants: [{ id: "v1", price: 899, compareAtPrice: 1099, sku: "HW-001" }],
    rating: 4.9,
    reviewCount: 128,
    badge: "Çok Satan",
  },
  {
    id: "2",
    name: "Classic Deri Bileklik",
    slug: "classic-deri-bileklik",
    images: [],
    variants: [{ id: "v2", price: 549, compareAtPrice: null, sku: "CB-001" }],
    rating: 4.8,
    reviewCount: 96,
    badge: "Yeni",
  },
  {
    id: "3",
    name: "Vintage Kahverengi Kayış",
    slug: "vintage-kahverengi-kayis",
    images: [],
    variants: [{ id: "v3", price: 749, compareAtPrice: 899, sku: "VK-001" }],
    rating: 4.9,
    reviewCount: 215,
    badge: null,
  },
  {
    id: "4",
    name: "Siyah Kroko Desenli",
    slug: "siyah-kroko-desenli",
    images: [],
    variants: [{ id: "v4", price: 999, compareAtPrice: null, sku: "SK-001" }],
    rating: 5.0,
    reviewCount: 67,
    badge: "Premium",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
  },
};

function ProductCard({ product, index }: { product: Product; index: number }) {
  const { addToCart } = useCart();
  const { addToWishlist, removeFromWishlist, isInWishlist } = useWishlist();
  const [isHovered, setIsHovered] = useState(false);
  
  const mainVariant = product.variants[0];
  const hasDiscount = mainVariant?.compareAtPrice && mainVariant.compareAtPrice > mainVariant.price;
  const inWishlist = isInWishlist(product.id);

  const handleAddToCart = () => {
    addToCart(product, mainVariant);
    toast.success("Sepete eklendi", {
      description: `${product.name} sepetinize eklendi`,
    });
  };

  const handleWishlistToggle = () => {
    if (inWishlist) {
      removeFromWishlist(product.id);
      toast.info("Favorilerden çıkarıldı");
    } else {
      addToWishlist(product);
      toast.success("Favorilere eklendi");
    }
  };

  return (
    <motion.div
      variants={itemVariants}
      className="group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Image Container - Placeholder */}
      <div className="relative aspect-square rounded-2xl overflow-hidden bg-[#F5F3F0] mb-4">
        {/* Icon Placeholder */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-24 h-24 rounded-full bg-[#0F1626]/5 flex items-center justify-center">
            <Watch className="w-12 h-12 text-[#0F1626]/20" />
          </div>
        </div>
        
        {/* Badge */}
        {product.badge && (
          <div className="absolute top-3 left-3 bg-[#8A6B37] text-white text-xs font-medium px-3 py-1 rounded-full">
            {product.badge}
          </div>
        )}

        {/* Discount Badge */}
        {hasDiscount && (
          <div className="absolute top-3 right-3 bg-[#0F1626] text-white text-xs font-medium px-3 py-1 rounded-full">
            {Math.round((1 - mainVariant.price / mainVariant.compareAtPrice!) * 100)}% İndirim
          </div>
        )}

        {/* Quick Actions */}
        <div className={`absolute bottom-3 left-3 right-3 flex gap-2 transition-all duration-300 ${
          isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}>
          <button
            onClick={(e) => {
              e.preventDefault();
              handleAddToCart();
            }}
            className="flex-1 bg-white text-[#0F1626] py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 hover:bg-[#8A6B37] hover:text-white transition-colors"
          >
            <ShoppingBag className="w-4 h-4" />
            Sepete Ekle
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              handleWishlistToggle();
            }}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
              inWishlist 
                ? "bg-[#8A6B37] text-white" 
                : "bg-white text-[#0F1626] hover:bg-[#8A6B37] hover:text-white"
            }`}
          >
            <Heart className={`w-5 h-5 ${inWishlist ? "fill-current" : ""}`} />
          </button>
        </div>
      </div>

      {/* Product Info */}
      <div className="space-y-2">
        {/* Rating */}
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-[#8A6B37] fill-[#8A6B37]" />
          <span className="text-sm font-medium text-[#0F1626]">{product.rating || 4.8}</span>
          <span className="text-sm text-[#0F1626]/40">({product.reviewCount || 0})</span>
        </div>

        {/* Name */}
        <Link href={ROUTES.product(product.slug)}>
          <h3 className="font-medium text-[#0F1626] group-hover:text-[#8A6B37] transition-colors line-clamp-1">
            {product.name}
          </h3>
        </Link>

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[#0F1626]">{mainVariant?.price || 0} TL</span>
          {hasDiscount && (
            <span className="text-sm text-[#0F1626]/40 line-through">
              {mainVariant?.compareAtPrice} TL
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function BestSellersSection({ initialProducts }: BestSellersSectionProps) {
  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [loading, setLoading] = useState(!initialProducts);

  useEffect(() => {
    if (initialProducts) {
      setProducts(initialProducts);
      setLoading(false);
      return;
    }

    async function loadProducts() {
      try {
        const data = await getLimitedProducts(8);
        setProducts(data);
      } catch (err) {
        console.error("Failed to load products:", err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, [initialProducts]);

  const displayProducts = products.length > 0 ? products : defaultProducts;

  if (loading) {
    return (
      <section className="py-16 lg:py-24 bg-[#F8F8F8]">
        <div className="container-premium">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-square bg-[#E5E2DE] rounded-2xl animate-pulse" />
                <div className="h-4 bg-[#E5E2DE] rounded w-1/3 animate-pulse" />
                <div className="h-5 bg-[#E5E2DE] rounded w-3/4 animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 lg:py-24 bg-[#F8F8F8]">
      <div className="container-premium">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10 lg:mb-12"
        >
          <div>
            <span className="inline-block text-[#8A6B37] text-xs font-medium tracking-widest uppercase mb-3">
              Öne Çıkanlar
            </span>
            <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-[#0F1626]">
              Çok Satanlar
            </h2>
          </div>
          <Link
            href={ROUTES.products}
            className="inline-flex items-center gap-2 text-[#0F1626] font-medium hover:text-[#8A6B37] transition-colors group"
          >
            Tüm Ürünleri Gör
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

        {/* Products Grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 lg:gap-6"
        >
          {displayProducts.map((product, index) => (
            <ProductCard key={product.id} product={product} index={index} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
