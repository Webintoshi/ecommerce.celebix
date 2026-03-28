"use client";

import { Package, MapPin, Maximize2, Barcode } from "lucide-react";
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
    <div className="p-8 space-y-8">
      <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
        <div className="w-12 h-12 bg-orange-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
          <Package className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Stok Yönetimi</h3>
          <p className="text-sm text-gray-500">Stok takip ve uyarı ayarları</p>
        </div>
      </div>

      {/* Stock Tracking Toggle */}
      <div className="bg-orange-50 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h4 className="font-bold text-gray-900">Stok Takibi</h4>
              <p className="text-sm text-gray-500">Stok adetlerini otomatik takip et</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onTrackStockChange(!trackStock)}
            className={cn(
              "w-14 h-8 rounded-full transition-all relative",
              trackStock ? "bg-orange-500" : "bg-gray-300"
            )}
          >
            <div
              className={cn(
                "absolute top-1 left-1 w-6 h-6 bg-white rounded-full transition-all shadow-sm",
                trackStock && "translate-x-6"
              )}
            />
          </button>
        </div>
      </div>

      {/* Low Stock Alert */}
      {trackStock && (
        <div className="space-y-2">
          <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
            <BarChartIcon className="w-4 h-4 text-amber-500" />
            Düşük Stok Uyarı Eşiği
          </label>
          <input
            type="number"
            value={lowStockThreshold}
            onChange={(e) => onLowStockThresholdChange(parseInt(e.target.value) || 10)}
            className="w-32 px-4 py-3 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
          />
          <p className="text-xs text-gray-500">
            Stok bu seviyenin altına düştüğünde uyarı alacaksınız.
          </p>
        </div>
      )}

      {/* Variant Stock Details */}
      <div className="space-y-4">
        <h4 className="text-lg font-bold text-gray-900">Varyant Stok Bilgileri</h4>
        
        <div className="grid gap-4">
          {variants.map((variant, index) => (
            <div key={variant.id} className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-gray-900">{variant.name}</h5>
                <span className="text-sm text-gray-500">SKU: {variant.sku}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Stock */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase">Stok Adedi</label>
                  <input
                    type="number"
                    value={variant.stock}
                    onChange={(e) => updateVariantStock(index, parseInt(e.target.value) || 0)}
                    disabled={!trackStock}
                    className={cn(
                      "w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all",
                      !trackStock && "opacity-50 cursor-not-allowed"
                    )}
                  />
                </div>

                {/* Warehouse Location */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Depo Lokasyonu
                  </label>
                  <input
                    type="text"
                    value={variant.warehouseLocation || ""}
                    onChange={(e) => updateVariantWarehouse(index, e.target.value)}
                    placeholder="A-12-3"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
                  />
                </div>

                {/* Max Purchase Limit */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1">
                    <Maximize2 className="w-3 h-3" />
                    Max. Satın Alma
                  </label>
                  <input
                    type="number"
                    value={variant.maxPurchaseQuantity || ""}
                    onChange={(e) => updateVariantMaxPurchase(index, parseInt(e.target.value) || undefined)}
                    placeholder="Sınırsız"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all"
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
