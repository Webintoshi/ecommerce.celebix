"use client";

import Link from "next/link";
import { ArrowRight, Minus, Plus, ShieldCheck, ShoppingBag, Trash2, Truck } from "lucide-react";
import { CartItemCustomizationDisplay } from "@/components/cart/cart-item-customization";
import { SHIPPING_THRESHOLD as SHIPPING_THRESHOLD_FALLBACK } from "@/lib/constants";
import { useCart } from "@/lib/cart-context";
import { getPrimaryResolvedProductImage } from "@/lib/product-images";
import { useStorefrontRoute } from "@/lib/storefront-route-context";
import { formatPrice } from "@/lib/utils";

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
  const { buildPath } = useStorefrontRoute();
  const effectiveShippingThreshold = shippingThreshold ?? SHIPPING_THRESHOLD_FALLBACK;
  const remainingForFreeShipping = Math.max(
    0,
    freeShippingRemaining ?? effectiveShippingThreshold - subtotal,
  );

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-[#F5F7FA]">
        <div className="container-premium py-16 sm:py-24">
          <div className="mx-auto max-w-2xl rounded-[2rem] bg-white px-6 py-14 text-center shadow-sm sm:px-10">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-[#FFF1E8]">
              <ShoppingBag className="h-10 w-10 text-[#FF6A00]" />
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#F26A21]">
              Sepet bo?
            </p>
            <h1 className="text-3xl font-bold text-[#121713] sm:text-4xl">
              Alpler Spor sepetiniz haz?r
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-7 text-[#66746B]">
              Antrenman, outdoor veya g?nl?k spor ihtiya?lar?n?z i?in ?r?nleri
              ke?fedin; karar verdi?inizde g?venli ?deme ak???na ge?in.
            </p>
            <Link
              href={buildPath("/urunler")}
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#FF6A00] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#E85F00]"
            >
              ?r?nleri Ke?fet
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA]">
      <section className="border-b border-black/5 bg-white">
        <div className="container-premium py-8 sm:py-10">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#F26A21]">
            Sat?n alma ad?m?
          </p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-[#121713] sm:text-4xl">
                Sepetim
              </h1>
              <p className="mt-2 text-sm text-[#66746B]">
                {getTotalItems()} ?r?n se?ildi. ?deme ?ncesi adet, varyant ve teslimat bilgisini kontrol edin.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em]">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#DBEAFE] px-3 py-2 text-[#1D4ED8]">
                <ShieldCheck className="h-3.5 w-3.5" />
                SSL g?venli ?deme
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#FFF1E8] px-3 py-2 text-[#C2410C]">
                <Truck className="h-3.5 w-3.5" />
                H?zl? kargo
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="container-premium py-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            {items.map((item) => {
              const itemImage = getPrimaryResolvedProductImage(item.product, item.variant);

              return (
                <div key={item.id} className="rounded-3xl border border-[#E5E7EB] bg-white p-4 shadow-sm md:p-5">
                  <div className="flex gap-4">
                    <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#EEF2F7] md:h-28 md:w-24">
                      {itemImage ? (
                        <img
                          src={itemImage}
                          alt={item.product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ShoppingBag className="h-8 w-8 text-[#9AA69E]" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <Link
                        href={buildPath(`/urunler/${item.product.slug}`)}
                        className="block text-base font-semibold leading-snug text-[#121713] transition-colors hover:text-[#FF6A00]"
                      >
                        {item.product.name}
                      </Link>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#66746B]">
                        {item.variant.name}
                      </p>
                      <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-lg font-bold text-[#121713]">
                          {formatPrice(item.unitPrice)}
                        </span>
                        <span className="text-xs text-[#66746B]">/ adet</span>
                      </div>
                      {item.customization ? (
                        <CartItemCustomizationDisplay customization={item.customization} />
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end justify-between gap-3">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-2 text-[#9AA69E] transition-colors hover:bg-red-50 hover:text-red-600"
                        aria-label="Sepetten kald?r"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                      <div className="flex items-center rounded-full border border-black/10 bg-[#F8FAFC]">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-white"
                          aria-label="Azalt"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-10 text-center text-sm font-bold">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-white"
                          aria-label="Artt?r"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end border-t border-black/5 pt-4">
                    <span className="text-sm font-bold text-[#111827]">
                      Satir toplamÄ±: {formatPrice(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-[#121713]">SipariÅŸ Ã¶zeti</h2>

              {shipping > 0 && shippingThreshold != null ? (
                <div className="mt-5 rounded-2xl bg-[#FFF7ED] p-4">
                  <p className="text-sm leading-6 text-[#C2410C]">
                    {formatPrice(remainingForFreeShipping)} daha ekleyerek Ã¼cretsiz kargoya yaklaÅŸÄ±n.
                  </p>
                </div>
              ) : null}

              <div className="mt-6 space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-[#66746B]">Ara toplam</span>
                  <span className="font-semibold text-[#121713]">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#66746B]">Kargo</span>
                  <span className="font-semibold text-[#121713]">
                    {shipping === 0 ? "Ãœcretsiz" : formatPrice(shipping)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-black/5 pt-5 text-lg font-bold">
                  <span>Toplam</span>
                  <span className="text-[#111827]">{formatPrice(total)}</span>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <Link
                  href={buildPath("/odeme")}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#FF6A00] px-6 py-4 text-center text-sm font-semibold text-white transition-colors hover:bg-[#E85F00]"
                >
                  SipariÅŸi Tamamla
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={buildPath("/urunler")}
                  className="block w-full rounded-full border border-black/10 px-6 py-4 text-center text-sm font-semibold text-[#121713] transition-colors hover:bg-[#F8FAFC]"
                >
                  AlÄ±ÅŸveriÅŸe Devam Et
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

