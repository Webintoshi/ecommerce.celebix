"use client";

import { useCart } from "@/lib/cart-context";
import { Trash2, ShoppingBag, Plus, Minus } from "lucide-react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { SHIPPING_THRESHOLD as SHIPPING_THRESHOLD_FALLBACK } from "@/lib/constants";
import { CartItemCustomizationDisplay } from "@/components/cart/cart-item-customization";

export default function CartPage() {
  const {
    items,
    removeFromCart,
    updateQuantity,
    subtotal,
    shipping,
    shippingThreshold,
    total,
    getTotalItems,
  } = useCart();
  const shippingThresholdValue = shippingThreshold ?? SHIPPING_THRESHOLD_FALLBACK;

  if (items.length === 0) {
    return (
      <div className="min-h-screen">
        <div className="container mx-auto px-4 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <ShoppingBag className="h-12 w-12 text-primary" />
            </div>
            <h1 className="mb-4 text-3xl font-bold text-primary">Your cart is empty</h1>
            <p className="mb-8 text-muted">
              You do not have any products in your cart yet. Continue shopping to explore DeryCraft collections.
            </p>
            <Link
              href="/urunler"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-4 font-medium text-primary-foreground transition-all hover:bg-primary/90"
            >
              Start Shopping
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="bg-primary py-8 text-primary-foreground">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl font-bold md:text-3xl">
            Cart ({getTotalItems()} items)
          </h1>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-primary/10 bg-white p-4 shadow-sm md:p-6"
              >
                <div className="flex gap-4">
                  <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/5 text-4xl md:h-24 md:w-24">
                    {item.product.images && item.product.images.length > 0 ? (
                      <img
                        src={item.product.images[0]}
                        alt={item.product.name}
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                  </div>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/urunler/${item.product.slug}`}
                      className="mb-2 block font-semibold text-primary hover:underline"
                    >
                      {item.product.name}
                    </Link>
                    <p className="mb-2 text-sm text-muted">{item.variant.name}</p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-primary">
                        {formatPrice(item.unitPrice)}
                      </span>
                    </div>
                    {item.customization && (
                      <CartItemCustomizationDisplay customization={item.customization} />
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <div className="flex items-center rounded-lg border border-primary/20">
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-primary/5"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-12 text-center font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className="flex h-10 w-10 items-center justify-center transition-colors hover:bg-primary/5"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      onClick={() => removeFromCart(item.id)}
                      className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700"
                      aria-label="Remove from cart"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex justify-end border-t border-primary/10 pt-4">
                  <span className="font-semibold text-primary">
                    Item total: {formatPrice(item.unitPrice * item.quantity)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="lg:col-span-1">
            <div className="sticky top-24 rounded-xl border border-primary/10 bg-white p-6 shadow-sm">
              <h2 className="mb-6 text-xl font-bold text-primary">Order Summary</h2>

              <div className="mb-6 space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted">Subtotal</span>
                  <span className="font-medium">{formatPrice(subtotal)}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted">Shipping</span>
                  <span className="font-medium">
                    {shipping === 0 ? (
                      <span className="text-primary">Free</span>
                    ) : (
                      formatPrice(shipping)
                    )}
                  </span>
                </div>

                {shipping > 0 && shippingThreshold != null && (
                  <div className="rounded-lg bg-primary/5 p-3 text-xs text-muted">
                    Add {formatPrice(shippingThresholdValue - subtotal)} more to unlock free shipping.
                  </div>
                )}

                <div className="flex justify-between border-t border-primary/10 pt-4 text-lg font-bold">
                  <span>Total</span>
                  <span className="text-primary">{formatPrice(total)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Link
                  href="/odeme"
                  className="block w-full rounded-lg bg-primary px-6 py-4 text-center font-medium text-primary-foreground transition-all hover:bg-primary/90"
                >
                  Complete Order
                </Link>
                <Link
                  href="/urunler"
                  className="block w-full rounded-lg border border-primary/20 px-6 py-4 text-center font-medium transition-all hover:bg-primary/5"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
