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
      <div className="min-h-screen bg-[#F5F7FA]">
        <div className="container-premium py-16">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-7 h-44 max-w-md overflow-hidden rounded-lg">
              <DefaultDemoPlaceholder id="placeholder-12" label="Sepetiniz sizi bekliyor" compact />
            </div>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-lg bg-[#ECFDF5]">
              <ShoppingBag className="h-10 w-10 text-[#16A34A]" />
            </div>
            <h1 className="mb-4 text-3xl font-semibold text-[#0B1220]">Sepetiniz boş</h1>
            <p className="mb-8 leading-7 text-[#526176]">
              Aracınız için uygun akü ve oto elektrik ürünlerini inceleyerek alışverişe başlayabilirsiniz.
            </p>
            <Link
              href="/urunler"
              className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#0F172A] px-8 py-4 font-semibold text-white transition-all hover:bg-[#1E293B]"
            >
              Alışverişe Başla
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <div className="border-b border-[#D7DEE8] bg-white py-8">
        <div className="container-premium">
          <p className="text-xs font-semibold uppercase text-[#166534]">Sepet</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#0B1220] md:text-3xl">
            Sepetim ({getTotalItems()} ürün)
          </h1>
        </div>
      </div>

      <div className="container-premium py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-[#D7DEE8] bg-white p-4 shadow-sm md:p-6"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#EEF2F7] text-4xl">
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

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/urunler/${item.product.slug}`}
                      className="mb-2 block font-semibold text-[#0B1220] hover:text-[#166534]"
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

                  <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
                    <div className="flex items-center rounded-lg border border-[#D7DEE8]">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-[#EEF2F7]"
                        aria-label="Azalt"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-12 text-center font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-[#EEF2F7]"
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

                <div className="mt-4 flex justify-end border-t border-[#D7DEE8] pt-4">
                  <span className="font-semibold text-[#0B1220]">
                    Toplam: {formatPrice(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-lg border border-[#D7DEE8] bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-xl font-semibold text-[#0B1220]">Sipariş Özeti</h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between">
                  <span className="text-muted">Ara Toplam</span>
                  <span className="font-medium">{formatPrice(subtotal)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted">Kargo</span>
                  <span className="font-medium">
                    {shipping === 0 ? (
                    <span className="text-[#166534]">Ücretsiz</span>
                    ) : (
                      formatPrice(shipping)
                    )}
                  </span>
                </div>

                {shipping > 0 && shippingThreshold != null && (
                  <div className="rounded-lg bg-[#ECFDF5] p-3 text-xs text-[#526176]">
                    {formatPrice(SHIPPING_THRESHOLD - subtotal)} daha alırsanız
                    kargo ücretsiz!
                  </div>
                )}

                <div className="flex justify-between border-t border-[#D7DEE8] pt-4 text-lg font-bold">
                  <span>Toplam</span>
                  <span className="text-[#166534]">{formatPrice(total)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Link
                  href="/odeme"
                  className="block w-full rounded-lg bg-[#0F172A] px-6 py-4 text-center font-semibold text-white transition-all hover:bg-[#1E293B]"
                >
                  Siparişi Tamamla
                </Link>
                <Link
                  href="/urunler"
                  className="block w-full rounded-lg border border-[#D7DEE8] px-6 py-4 text-center font-semibold transition-all hover:border-[#22C55E] hover:text-[#166534]"
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
