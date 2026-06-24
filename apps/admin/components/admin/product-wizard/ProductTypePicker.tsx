"use client";

import { Layers3, Package, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminProductMode } from "@/types/admin-product-wizard";

type ProductTypePickerProps = {
  onSelect: (mode: AdminProductMode) => void;
};

const PRODUCT_TYPE_OPTIONS: Array<{
  mode: AdminProductMode;
  title: string;
  description: string;
  bullets: string[];
  icon: typeof Package;
}> = [
  {
    mode: "simple",
    title: "Basit ürün",
    description: "Tek fiyat ve tek stokla hızlı ürün girişi.",
    bullets: ["Ürün adı, fiyat ve stok önde", "Görsel ve SEO daha sonra tamamlanabilir"],
    icon: Package,
  },
  {
    mode: "variant",
    title: "Varyasyonlu ürün",
    description: "Kapasite, renk, beden gibi seçeneklerle varyant oluştur.",
    bullets: ["Seçenek ve değerlerden otomatik matrix", "Her varyanta fiyat, stok ve SKU"],
    icon: Layers3,
  },
];

export function ProductTypePicker({ onSelect }: ProductTypePickerProps) {
  return (
    <div className="admin-page-root min-h-screen bg-[#F9F9F9] px-4 py-8 text-stone-900 md:px-6 md:py-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">
            <Sparkles className="h-3.5 w-3.5" />
            Yeni ürün
          </div>
          <div className="max-w-3xl space-y-2">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-stone-950 md:text-4xl">
              Ne tür ürün ekliyorsunuz?
            </h1>
            <p className="text-sm leading-6 text-stone-600 md:text-base">
              Önce ürün yapısını seçin. Basit ürün hızlı kayıt için, varyasyonlu ürün ise seçeneklerden otomatik varyant üretmek için tasarlandı.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {PRODUCT_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => onSelect(option.mode)}
                className={cn(
                  "group flex min-h-[260px] flex-col items-start justify-between rounded-[8px] border border-[#E7EAF0] bg-white p-6 text-left shadow-[0_18px_50px_rgba(15,23,42,0.06)] transition-all",
                  "hover:-translate-y-0.5 hover:border-[var(--admin-accent-border)] hover:shadow-[0_22px_58px_rgba(255,106,0,0.10)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F9F9]",
                )}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-[8px] bg-[var(--admin-accent)] text-white shadow-[0_14px_28px_rgba(255,106,0,0.20)]">
                  <Icon className="h-6 w-6" />
                </span>

                <span className="space-y-3">
                  <span className="block text-2xl font-semibold tracking-[-0.03em] text-stone-950">
                    {option.title}
                  </span>
                  <span className="block text-sm leading-6 text-stone-600">{option.description}</span>
                  <span className="block space-y-2">
                    {option.bullets.map((bullet) => (
                      <span key={bullet} className="flex items-center gap-2 text-sm text-stone-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--admin-accent)]" />
                        {bullet}
                      </span>
                    ))}
                  </span>
                </span>

                <span className="inline-flex items-center rounded-[8px] bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-[var(--admin-accent)]">
                  Seç ve devam et
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
