"use client";

import { ArrowRight, Layers3, Package } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AdminProductMode } from "@/types/admin-product-wizard";

type ProductTypePickerProps = {
  onSelect: (mode: AdminProductMode) => void;
};

const PRODUCT_TYPE_OPTIONS: Array<{
  mode: AdminProductMode;
  title: string;
  description: string;
  icon: typeof Package;
}> = [
  {
    mode: "simple",
    title: "Basit ürün",
    description: "Tek fiyat, tek stok.",
    icon: Package,
  },
  {
    mode: "variant",
    title: "Varyasyonlu ürün",
    description: "Seçenekli ürünler.",
    icon: Layers3,
  },
];

export function ProductTypePicker({ onSelect }: ProductTypePickerProps) {
  return (
    <div className="admin-page-root min-h-screen bg-[#F9F9F9] px-4 py-7 text-stone-900 md:px-6 md:py-9">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="border-b border-[var(--admin-border)] pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">Yeni ürün</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950 md:text-3xl">
            Ürün türü seçin
          </h1>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {PRODUCT_TYPE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.mode}
                type="button"
                onClick={() => onSelect(option.mode)}
                className={cn(
                  "group flex min-h-[148px] items-center justify-between gap-4 rounded-[8px] border border-[#E2E6ED] bg-white px-5 py-4 text-left shadow-[0_12px_34px_rgba(15,23,42,0.05)] transition-all",
                  "hover:border-[var(--admin-accent-border)] hover:bg-[#FFF9F5] hover:shadow-[0_18px_44px_rgba(255,106,0,0.09)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F9F9]",
                )}
              >
                <span className="flex min-w-0 items-center gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-[var(--admin-accent)] text-white shadow-[0_12px_24px_rgba(255,106,0,0.18)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="block space-y-2">
                    <span className="block truncate text-xl font-semibold tracking-[-0.03em] text-stone-950">
                      {option.title}
                    </span>
                    <span className="block text-sm leading-5 text-stone-500">{option.description}</span>
                  </span>
                </span>

                <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[8px] border border-transparent px-3 text-sm font-semibold text-stone-500 transition-colors group-hover:border-[var(--admin-accent-border)] group-hover:bg-white group-hover:text-[var(--admin-accent)]">
                  Seç
                  <ArrowRight className="h-4 w-4" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
