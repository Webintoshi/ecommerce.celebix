"use client";

import { Package, MapPin, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductVariant } from "@/types/product";

interface StepStockProps {
  trackStock: boolean;
  lowStockThreshold: number;
  variants: ProductVariant[];
  onTrackStockChange: (track: boolean) => void;
  onLowStockThresholdChange: (threshold: number) => void;
  onVariantsChange: (variants: ProductVariant[]) => void;
}

export function StepStock({
  trackStock,
  lowStockThreshold,
  variants,
  onTrackStockChange,
  onLowStockThresholdChange,
  onVariantsChange,
}: StepStockProps) {
  const updateVariantStock = (index: number, stock: number) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], stock };
    onVariantsChange(newVariants);
  };

  const updateVariantWarehouse = (index: number, location: string) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], warehouseLocation: location };
    onVariantsChange(newVariants);
  };

  const updateVariantMaxPurchase = (index: number, maxQty: number | undefined) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], maxPurchaseQuantity: maxQty };
    onVariantsChange(newVariants);
  };

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-4 border-b border-[#FE6100]/8 pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] text-white shadow-[0_14px_28px_rgba(254,97,0,0.22)]">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-stone-900">Stok Yönetimi</h3>
          <p className="text-sm text-stone-500">Stok takip ve uyarı ayarları</p>
        </div>
      </div>

      {/* Stock Tracking Toggle */}
      <div className="rounded-[26px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffaf6] to-[#faf4ed] p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm">
              <Package className="w-5 h-5 text-[#FE6100]" />
            </div>
            <div>
              <h4 className="font-semibold text-stone-900">Stok Takibi</h4>
              <p className="text-sm text-stone-500">Stok adetlerini otomatik takip et</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTrackStockChange(!trackStock)}
            aria-pressed={trackStock}
            aria-label={trackStock ? "Stok takibini kapat" : "Stok takibini aç"}
            className={cn(
              "relative h-8 w-14 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE6100]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fbf4ed]",
              trackStock ? "bg-[#FE6100]" : "bg-stone-300"
            )}
          >
            <div
              className={cn(
                "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-all",
                trackStock && "translate-x-6"
              )}
            />
          </button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {trackStock && (
        <div className="space-y-2 rounded-[24px] border border-[#FE6100]/10 bg-white/90 p-5 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
            <BarChartIcon className="w-4 h-4 text-[#FE6100]" />
            Düşük Stok Uyarı Eşiği
          </label>
          <input
            type="number"
            value={lowStockThreshold}
            onChange={(e) => onLowStockThresholdChange(parseInt(e.target.value) || 10)}
            className="w-32 rounded-2xl border border-[#e8dbcf] bg-[#fffaf6] px-4 py-3 outline-none transition-all focus:border-[#FE6100] focus:bg-white focus:ring-2 focus:ring-[#FE6100]/20"
          />
          <p className="text-xs text-stone-500" aria-live="polite">
            Stok bu seviyenin altına düştüğünde uyarı alacaksınız.
          </p>
        </div>
      )}

      {/* Variant Stock Details */}
      <div className="space-y-4">
        <h4 className="text-lg font-semibold text-stone-900">Varyant Stok Bilgileri</h4>
        
        <div className="grid gap-4">
          {variants.map((variant, index) => (
            <div key={variant.id} className="space-y-4 rounded-[26px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdfb] to-[#faf5f0] p-4 shadow-sm md:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h5 className="font-semibold text-stone-900">{variant.name}</h5>
                <span className="inline-flex w-fit items-center rounded-full border border-[#FE6100]/12 bg-[#fff7f1] px-3 py-1.5 text-xs font-medium text-[#C94E00]">SKU: {variant.sku}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Stock */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Stok Adedi</label>
                  <input
                    type="number"
                    value={variant.stock}
                    onChange={(e) => updateVariantStock(index, parseInt(e.target.value) || 0)}
                    disabled={!trackStock}
                    className={cn(
                      "w-full rounded-2xl border border-[#e8dbcf] bg-[#fffaf6] px-4 py-3 outline-none transition-all focus:border-[#FE6100] focus:bg-white focus:ring-2 focus:ring-[#FE6100]/20",
                      !trackStock && "opacity-50 cursor-not-allowed"
                    )}
                  />
                </div>

                {/* Warehouse Location */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <MapPin className="w-3 h-3" />
                    Depo Lokasyonu
                  </label>
                  <input
                    type="text"
                    value={variant.warehouseLocation || ""}
                    onChange={(e) => updateVariantWarehouse(index, e.target.value)}
                    placeholder="A-12-3"
                    className="w-full rounded-2xl border border-[#e8dbcf] bg-[#fffaf6] px-4 py-3 outline-none transition-all focus:border-[#FE6100] focus:bg-white focus:ring-2 focus:ring-[#FE6100]/20"
                  />
                </div>

                {/* Max Purchase Limit */}
                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    <Maximize2 className="w-3 h-3" />
                    Max. Satın Alma
                  </label>
                  <input
                    type="number"
                    value={variant.maxPurchaseQuantity || ""}
                    onChange={(e) => updateVariantMaxPurchase(index, parseInt(e.target.value) || undefined)}
                    placeholder="Sınırsız"
                    className="w-full rounded-2xl border border-[#e8dbcf] bg-[#fffaf6] px-4 py-3 outline-none transition-all focus:border-[#FE6100] focus:bg-white focus:ring-2 focus:ring-[#FE6100]/20"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
