"use client";

import { useCart } from "@/lib/cart-context";
import { Trash2, ShoppingBag, Plus, Minus } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { SHIPPING_THRESHOLD as SHIPPING_THRESHOLD_FALLBACK } from "@/lib/constants";
import { CartItemCustomizationDisplay } from "@/components/cart/cart-item-customization";
import { DefaultDemoPlaceholder } from "@/components/placeholders/DefaultDemoPlaceholder";

export default function CartPage() {
  const {
    items,
    removeFromCart,
    updateQuantity,
    subtotal,
    shipping,
    shippingThreshold,
    freeShippingRemaining,
    total,
    getTotalItems,
  } = useCart();
  const SHIPPING_THRESHOLD = shippingThreshold ?? SHIPPING_THRESHOLD_FALLBACK;

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#F7FAF9]">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto text-center">
            <div className="mx-auto mb-7 h-44 max-w-md overflow-hidden rounded-lg">
              <DefaultDemoPlaceholder id="placeholder-12" label="Sepetiniz sizi bekliyor" compact />
            </div>
            <div className="w-20 h-20 bg-[#F0FDFA] rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag className="w-10 h-10 text-[#0F766E]" />
            </div>
            <h1 className="text-3xl font-semibold text-[#111827] mb-4">Sepetiniz Bos</h1>
            <p className="text-[#526B66] mb-8 leading-7">
              Sepetinizde henüz ürün bulunmamaktadır. Alışverişe devam etmek
              için ürünlerimize göz atın.
            </p>
            <Link
              href="/urunler"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#0F766E] text-white rounded-full font-semibold hover:bg-[#115E59] transition-all"
            >
              Alışverişe Başla
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7FAF9]">
      <div className="border-b border-[#DDE7E4] bg-white py-8">
        <div className="container mx-auto px-4">
          <p className="text-xs font-semibold uppercase text-[#0F766E]">Sepet</p>
          <h1 className="mt-2 text-2xl md:text-3xl font-semibold text-[#111827]">
            Sepetim ({getTotalItems()} ürün)
          </h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg p-4 md:p-6 shadow-sm border border-[#DDE7E4]"
              >
                <div className="flex gap-4">
                  <div className="w-20 h-20 md:w-24 md:h-24 bg-[#F0FDFA] rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center text-4xl">
                    {item.product.images && item.product.images.length > 0 ? (
                      <img
                        src={item.product.images[0]}
                        alt={item.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <DefaultDemoPlaceholder
                        id="placeholder-07"
                        label={item.product.name}
                        compact
                      />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/urunler/${item.product.slug}`}
                      className="font-semibold text-[#111827] hover:text-[#0F766E] block mb-2"
                    >
                      {item.product.name}
                    </Link>
                    <p className="text-sm text-muted mb-2">{item.variant.name}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-[#111827]">
                        {formatPrice(item.unitPrice)}
                      </span>
                    </div>
                    {item.customization && (
                      <CartItemCustomizationDisplay customization={item.customization} />
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center border border-[#DDE7E4] rounded-lg">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-[#F0FDFA] transition-colors"
                        aria-label="Azalt"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-12 text-center font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="w-10 h-10 flex items-center justify-center hover:bg-[#F0FDFA] transition-colors"
                        aria-label="Arttır"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors"
                      aria-label="Sepetten kaldır"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-[#DDE7E4] flex justify-end">
                  <span className="font-semibold text-[#111827]">
                    Toplam: {formatPrice(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg p-6 shadow-sm border border-[#DDE7E4] sticky top-24">
              <h2 className="text-xl font-semibold text-[#111827] mb-6">Sipariş Özeti</h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <span className="text-muted">Ara Toplam</span>
                  <span className="font-medium">{formatPrice(subtotal)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted">Kargo</span>
                  <span className="font-medium">
                    {shipping === 0 ? (
                    <span className="text-[#0F766E]">Ücretsiz</span>
                    ) : (
                      formatPrice(shipping)
                    )}
                  </span>
                </div>

                {shipping > 0 && shippingThreshold != null && (
                  <div className="text-xs text-[#526B66] bg-[#F0FDFA] p-3 rounded-lg">
                    {formatPrice(SHIPPING_THRESHOLD - subtotal)} daha alırsanız
                    kargo ücretsiz!
                  </div>
                )}

                <div className="flex justify-between text-lg font-bold pt-4 border-t border-[#DDE7E4]">
                  <span>Toplam</span>
                  <span className="text-[#0F766E]">{formatPrice(total)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Link
                  href="/odeme"
                  className="block w-full text-center px-6 py-4 bg-[#0F766E] text-white rounded-lg font-semibold hover:bg-[#115E59] transition-all"
                >
                  Siparişi Tamamla
                </Link>
                <Link
                  href="/urunler"
                  className="block w-full text-center px-6 py-4 border border-[#DDE7E4] rounded-lg font-semibold hover:border-[#0F766E] hover:text-[#0F766E] transition-all"
                >
                  Alışverişe Devam Et
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
