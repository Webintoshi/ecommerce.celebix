"use client";

import Link from "next/link";
import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import { useCart } from "@/lib/cart-context";
import { getPrimaryResolvedProductImage } from "@/lib/product-images";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { useWishlist } from "@/lib/wishlist-context";
import { formatPrice } from "@/lib/utils";

export default function WishlistPage() {
  const { items, removeFromWishlist, clearWishlist, getTotalItems } = useWishlist();
  const { addToCart } = useCart();
  const { buildPath } = useStorefrontRoute();

  const handleAddToCart = (product: any) => {
    addToCart(product, product.variants[0], 1);
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <div className="container-premium py-16">
          <div className="mx-auto max-w-2xl rounded-[2rem] bg-white px-6 py-14 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#FFF1E8]">
              <Heart className="h-10 w-10 text-[#FF6A00]" />
            </div>
            <h1 className="text-3xl font-bold text-[#121713]">Favori listeniz bos</h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-[#66746B]">
              Begendiginiz Alpler Spor urunlerini favorilere ekleyerek daha sonra
              hizli sekilde sepetinize tasiyabilirsiniz.
            </p>
            <Link
              href={buildPath("/urunler")}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#FF6A00] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00]"
            >
              Ürünleri Keşfet
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <section className="border-b border-black/5 bg-white">
        <div className="container-premium py-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-[#F26A21]">
                Kaydedilenler
              </p>
              <h1 className="text-3xl font-bold text-[#121713]">
                Favorilerim ({getTotalItems()} urun)
              </h1>
            </div>
            <button
              onClick={clearWishlist}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-[#121713] transition-colors hover:bg-[#F8FAFC]"
            >
              Tümünü Temizle
            </button>
          </div>
        </div>
      </section>

      <div className="container-premium py-8">
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-7 lg:gap-y-10">
          {items.map((product) => {
            const itemImage = getPrimaryResolvedProductImage(product, product.variants?.[0]);

            return (
              <article key={product.id} className="group rounded-3xl border border-[#E5E7EB] bg-white p-2 shadow-sm">
                <Link href={buildPath(`/urunler/${product.slug}`)} className="block">
                  <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#EEF2F7]">
                    {itemImage ? (
                      <img
                        src={itemImage}
                        alt={product.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ShoppingBag className="h-12 w-12 text-[#9AA69E]" />
                      </div>
                    )}
                    <button
                      onClick={(event) => {
                        event.preventDefault();
                        removeFromWishlist(product.id);
                      }}
                      className="absolute right-3 top-3 bg-white p-2 text-red-600 shadow-sm transition-colors hover:bg-red-50"
                      aria-label="Favorilerden cikar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </Link>

                <div className="pt-3">
                  <Link href={buildPath(`/urunler/${product.slug}`)}>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#66746B]">
                      {String(product.category || "Alpler Spor").replace(/-/g, " ")}
                    </p>
                    <h3 className="line-clamp-2 text-sm font-semibold text-[#121713] transition-colors group-hover:text-[#FF6A00] sm:text-base">
                      {product.name}
                    </h3>
                  </Link>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-base font-bold text-[#121713]">
                      {formatPrice(product.variants[0].price)}
                    </span>
                    {product.variants[0].originalPrice ? (
                      <span className="text-xs text-[#9AA69E] line-through">
                        {formatPrice(product.variants[0].originalPrice)}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => handleAddToCart(product)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#FF6A00] px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#E85F00]"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Sepete Ekle
                    </button>
                    <Link
                      href={buildPath(`/urunler/${product.slug}`)}
                      className="rounded-full border border-black/10 px-3 py-2.5 text-xs font-semibold text-[#121713] transition-colors hover:bg-[#F8FAFC]"
                    >
                      Detay
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
