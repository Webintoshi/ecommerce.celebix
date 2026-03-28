"use client";

import { CheckCircle, Eye, Globe, Save } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { AdminProductWizardState } from "@/types/admin-product-wizard";

interface StepPreviewProps {
  data: AdminProductWizardState;
  onPublish: () => void;
  onSaveDraft: () => void;
  saving: boolean;
}

function formatLabel(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function StepPreview({
  data,
  onPublish,
  onSaveDraft,
  saving,
}: StepPreviewProps) {
  const checklistItems = [
    { id: "name", label: "Ürün adı girilmiş", check: () => data.name.length > 0 },
    { id: "images", label: "En az 1 görsel yüklenmiş", check: () => data.images.length > 0 },
    { id: "price", label: "Fiyat belirlenmiş", check: () => data.variants.some((variant) => variant.price > 0) },
    { id: "category", label: "Kategori seçilmiş", check: () => Boolean(data.category) },
    { id: "variants", label: "Varyantlar oluşturulmuş", check: () => data.variants.length > 0 },
    {
      id: "seo",
      label: "SEO alanları doldurulmuş",
      check: () => data.seo.title.length > 0 && data.seo.description.length > 0,
    },
  ];

  const completedCount = checklistItems.filter((item) => item.check()).length;
  const progress = (completedCount / checklistItems.length) * 100;
  const primaryVariant = data.variants[0];

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center gap-4 pb-6 border-b border-gray-100">
        <div className="w-12 h-12 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
          <CheckCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Önizle & Yayınla</h3>
          <p className="text-sm text-gray-500">Son kontrol ve yayınlama</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-gray-50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold text-gray-700">Yayınlanma Durumu</span>
              <span className="text-lg font-black text-emerald-600">%{Math.round(progress)}</span>
            </div>
            <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  progress >= 100 ? "bg-emerald-500" : progress >= 70 ? "bg-amber-500" : "bg-rose-500"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {completedCount} / {checklistItems.length} kontrol tamamlandı
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-gray-700">Kontrol Listesi</h4>
            {checklistItems.map((item) => {
              const isChecked = item.check();
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border transition-all",
                    isChecked ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-200"
                  )}
                >
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center",
                      isChecked ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-400"
                    )}
                  >
                    {isChecked ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs">○</span>}
                  </div>
                  <span className={cn("text-sm font-medium", isChecked ? "text-emerald-700" : "text-gray-500")}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-4 py-4 bg-gray-100 text-gray-700 rounded-2xl font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              <Save className="w-5 h-5" />
              Taslak Kaydet
            </button>
            <button
              type="button"
              onClick={() => {
                if (progress < 100) {
                  toast.error("Lütfen önce tüm zorunlu alanları doldurun");
                  return;
                }

                onPublish();
              }}
              disabled={saving}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-4 rounded-2xl font-bold transition-all disabled:opacity-50",
                progress >= 100
                  ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                  : "bg-gray-300 text-gray-500 cursor-not-allowed"
              )}
            >
              <Globe className="w-5 h-5" />
              {saving ? "Yayınlanıyor..." : "Yayınla"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="text-sm font-bold text-gray-700">Ürün Önizlemesi</h4>

          <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
            <div className="aspect-[4/3] bg-gray-100 relative">
              {data.images[0] ? (
                <img
                  src={data.images[0].url}
                  alt={data.images[0].alt}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-300">
                  <Eye className="w-16 h-16" />
                </div>
              )}
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-gray-900 line-clamp-2">
                  {data.name || "Ürün Adı"}
                </h3>
                <p className="text-sm text-gray-500 line-clamp-3">
                  {data.shortDescription || "Kısa açıklama burada görünecek."}
                </p>
              </div>

              {data.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.tags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-primary">
                  ₺{primaryVariant?.price || 0}
                </span>
                {primaryVariant?.originalPrice ? (
                  <span className="text-lg text-gray-400 line-through">
                    ₺{primaryVariant.originalPrice}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Kategori</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {data.category ? formatLabel(data.category) : "Belirtilmedi"}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Alt Kategori</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {data.subcategory ? formatLabel(data.subcategory) : "Yok"}
                  </p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Varyant Sayısı</p>
                  <p className="mt-1 font-semibold text-gray-900">{data.variants.length}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Stok Takibi</p>
                  <p className="mt-1 font-semibold text-gray-900">
                    {data.trackStock ? "Aktif" : "Pasif"}
                  </p>
                </div>
              </div>

              {data.variants.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h5 className="text-sm font-bold text-gray-700">Varyantlar</h5>
                  <div className="space-y-2">
                    {data.variants.slice(0, 3).map((variant) => (
                      <div
                        key={variant.id}
                        className="flex items-center justify-between rounded-2xl border border-gray-100 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{variant.name}</p>
                          <p className="text-xs text-gray-500">{variant.sku || "SKU yok"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">₺{variant.price}</p>
                          <p className="text-xs text-gray-500">Stok: {variant.stock}</p>
                        </div>
                      </div>
                    ))}
                    {data.variants.length > 3 && (
                      <p className="text-xs text-gray-500">
                        +{data.variants.length - 3} varyant daha
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
