"use client";

import { useWishlist } from "@/lib/wishlist-context";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/lib/cart-context";

export default function WishlistPage() {
  const { items, removeFromWishlist, clearWishlist, getTotalItems } = useWishlist();
  const { addToCart } = useCart();

  const handleAddToCart = (product: any) => {
    addToCart(product, product.variants[0], 1);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <Heart className="w-12 h-12 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-primary mb-4">
              Favori Listeniz Boş
            </h1>
            <p className="text-muted mb-8">
              Beğendiğiniz ürünleri favorilere ekleyerek daha sonra kolayca ulaşabilirsiniz.
            </p>
            <Link
              href="/urunler"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-medium hover:bg-primary/90 transition-all"
            >
              Ürünleri Keşfet
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Page Header */}
      <div className="bg-primary text-primary-foreground py-8">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">
                Favorilerim ({getTotalItems()} ürün)
              </h1>
              <p className="text-primary-foreground/80 mt-2">
                Beğendiğiniz ürünler
              </p>
            </div>
            {items.length > 0 && (
              <button
                onClick={clearWishlist}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-medium transition-colors"
              >
                Tümünü Temizle
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden group"
            >
              {/* Product Image */}
              <Link href={`/urunler/${product.slug}`} className="block">
                <div className="aspect-square bg-gradient-to-br from-primary/5 to-secondary/5 flex items-center justify-center text-6xl relative overflow-hidden">
                  {product.category === "fistik-ezmesi" && "🥜"}
                  {product.category === "findik-ezmesi" && "🌰"}
                  {product.category === "kuruyemis" && "🥔"}
                  
                  {/* Remove Button */}
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      removeFromWishlist(product.id);
                    }}
                    className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
                    aria-label="Favorilerden çıkar"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </Link>

              {/* Product Info */}
              <div className="p-4">
                <Link href={`/urunler/${product.slug}`}>
                  <p className="text-xs text-muted mb-1 capitalize">
                    {product.category.replace("-", " ")}
                  </p>
                  <h3 className="font-semibold text-primary mb-2 line-clamp-2 hover:underline">
                    {product.name}
                  </h3>
                </Link>

                {/* Price */}
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-lg font-bold text-primary">
                    {formatPrice(product.variants[0].price)}
                  </span>
                  {product.variants[0].originalPrice && (
                    <span className="text-sm text-muted line-through">
                      {formatPrice(product.variants[0].originalPrice)}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAddToCart(product)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Sepete Ekle
                  </button>
                  <Link
                    href={`/urunler/${product.slug}`}
                    className="px-4 py-2 border border-primary/20 rounded-lg hover:bg-primary/5 transition-colors"
                  >
                    Detay
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
