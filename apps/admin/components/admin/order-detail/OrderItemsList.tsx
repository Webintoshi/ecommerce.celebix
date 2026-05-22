"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingBag, Package } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { buildStorefrontProductUrl } from "@/lib/store-runtime";

// Configure Next.js Image for external domains
const imageLoader = ({ src }: { src: string }) => {
  return src;
};

interface OrderItem {
  id: string;
  product_name: string;
  variant_name?: string;
  price: number;
  quantity: number;
  total: number;
  product?: {
    images?: string[];
    category?: string;
    slug?: string;
  };
  customizations?: Array<{
    selections?: Array<{
      step_label: string;
      display_value: string;
    }>;
    price_breakdown?: {
      total_adjustment?: number;
    };
  }>;
}

interface OrderItemsListProps {
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  discount: number;
  total: number;
  className?: string;
}

// Category emoji fallback
const getCategoryEmoji = (category?: string) => {
  const emojiMap: Record<string, string> = {
    "fistik-ezmesi": "🥜",
    "findik-ezmesi": "🌰",
    "fistik": "🥜",
    "findik": "🌰",
    "kuruyemis": "🥔",
    "badem": "🌰",
    "ceviz": "🌰",
  };
  return emojiMap[category || ""] || "🥔";
};

export function OrderItemsList({
  items,
  subtotal,
  shippingCost,
  discount,
  total,
  className = "",
}: OrderItemsListProps) {
  const hasDiscount = discount > 0;
  const hasFreeShipping = shippingCost === 0;

  return (
    <div className={`overflow-hidden rounded-[30px] border border-[var(--admin-border)] bg-white/90 shadow-[0_20px_55px_rgba(148,101,63,0.1)] backdrop-blur ${className}`}>
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-[var(--admin-border)] bg-gradient-to-r from-[#fffaf5] to-white px-5 py-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#f3dfc9] bg-[var(--admin-accent-soft)]">
            <ShoppingBag className="h-5 w-5 text-[var(--admin-accent-hover)]" />
          </div>
          <div>
            <div className="inline-flex rounded-full border border-[var(--admin-border)] bg-[#f9f2eb] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-text-secondary)]">
              Sepet Özeti
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-stone-950">Sipariş İçeriği</h3>
          </div>
        </div>
        <span className="inline-flex w-fit items-center rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--admin-text-secondary)] shadow-sm">
          {items.length} Ürün
        </span>
      </div>

      {/* Items */}
      <div className="divide-y divide-[#f3e7dc]">
        {items.map((item, index) => {
          // Get product image
          const productImage = item.product?.images?.[0];
          const categoryEmoji = getCategoryEmoji(item.product?.category);

          return (
            <div
              key={item.id}
              className="flex flex-col gap-4 p-4 transition-colors hover:bg-[#FCFDFE] sm:flex-row sm:items-center sm:gap-5 md:p-6"
            >
              {/* Product Image */}
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[22px] border border-[#f0e3d6] bg-[#fcf8f4]">
                {productImage ? (
                  <Image
                    src={productImage}
                    alt={item.product_name}
                    fill
                    className="object-cover"
                    sizes="80px"
                    loader={imageLoader}
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-3xl">
                    {categoryEmoji}
                  </div>
                )}
              </div>

              {/* Product Info */}
               <div className="min-w-0 flex-1">
                 {item.product?.slug ? (
                   <Link
                      href={buildStorefrontProductUrl(item.product.slug)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-base font-semibold text-stone-900 transition-colors hover:text-[var(--admin-accent-hover)]"
                    >
                      {item.product_name}
                    </Link>
                  ) : (
                    <p className="text-base font-semibold text-stone-900">{item.product_name}</p>
                  )}
                 {item.variant_name && (
                   <p className="mt-0.5 text-sm text-stone-500">{item.variant_name}</p>
                 )}
                 {item.customizations?.[0]?.selections?.length ? (
                   <div className="mt-3 rounded-[20px] border border-[#f0e3d6] bg-[#fcf8f4] p-3 text-xs text-stone-600">
                     {item.customizations[0].selections.map((selection, idx) => (
                       <div key={idx} className="flex items-center gap-2 py-0.5">
                         <span className="font-medium">{selection.step_label}:</span>
                         <span>{selection.display_value}</span>
                       </div>
                     ))}
                     {(item.customizations[0].price_breakdown?.total_adjustment || 0) > 0 && (
                       <div className="font-semibold text-[var(--admin-accent-hover)]">
                         Ekstra: +{formatPrice(item.customizations[0].price_breakdown?.total_adjustment || 0)}
                       </div>
                     )}
                  </div>
                ) : null}
              </div>

              {/* Quantity */}
              <div className="shrink-0 text-center sm:self-start">
                <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--admin-border)] bg-white px-3 py-2 shadow-sm">
                  <Package className="w-4 h-4 text-[#b18563]" />
                  <span className="text-sm font-semibold text-stone-700">x{item.quantity}</span>
                </div>
              </div>

              {/* Price */}
              <div className="w-full shrink-0 rounded-[22px] border border-[#f0e3d6] bg-[#fcf8f4] p-3 text-left sm:w-28 sm:self-start sm:text-right">
                <p className="text-sm text-stone-500">{formatPrice(item.price)}</p>
                <p className="text-lg font-semibold text-stone-950">{formatPrice(item.total)}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="border-t border-[var(--admin-border)] bg-gradient-to-b from-[#fffaf5] to-transparent p-5 md:p-8">
        <div className="space-y-3">
          <div className="flex justify-between font-medium text-stone-600">
            <span>Ara Toplam</span>
            <span className="text-stone-900">{formatPrice(subtotal)}</span>
          </div>

          <div className="flex justify-between font-medium text-stone-600">
            <span>Kargo</span>
            <span className={hasFreeShipping ? "font-semibold text-emerald-600" : "text-stone-900"}>
              {hasFreeShipping ? "Ücretsiz" : formatPrice(shippingCost)}
            </span>
          </div>

          {hasDiscount && (
            <div className="flex justify-between font-medium text-emerald-600">
              <span>İndirim</span>
              <span>-{formatPrice(discount)}</span>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-[var(--admin-border)] pt-4">
            <span className="text-lg font-semibold text-stone-950">Genel Toplam</span>
            <span className="text-2xl font-semibold text-[var(--admin-accent-hover)]">{formatPrice(total)}</span>
          </div>
        </div>

        {hasFreeShipping && (
          <div className="mt-4 flex items-center gap-2 rounded-[22px] border border-emerald-100 bg-emerald-50 p-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
              <Package className="w-3 h-3 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-emerald-700">
              Ücretsiz kargo! 🎉
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
