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
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-4 border-b border-[var(--admin-border)] pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--admin-accent)] text-white shadow-[0_14px_28px_rgba(255,106,0,0.22)]">
          <CheckCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.02em] text-stone-900">Önizle ve Yayınla</h3>
          <p className="text-sm text-stone-500">Son kontrol ve yayınlama</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-[28px] border border-[var(--admin-border)] bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-semibold text-stone-700">Yayınlanma Durumu</span>
              <span className="text-lg font-black text-emerald-600" aria-live="polite">%{Math.round(progress)}</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-[#efe4da]">
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
            <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">Kontrol Listesi</h4>
            {checklistItems.map((item) => {
              const isChecked = item.check();
              return (
                <div
                  key={item.id}
                  className={cn(
                    "flex items-center gap-3 rounded-[22px] border p-4 transition-all",
                    isChecked ? "border-emerald-200 bg-emerald-50/80" : "border-[#eadfd4] bg-white"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full",
                      isChecked ? "bg-emerald-500 text-white" : "bg-[#f1e7dc] text-stone-400"
                    )}
                  >
                    {isChecked ? <CheckCircle className="w-4 h-4" /> : <span className="text-xs">○</span>}
                  </div>
                  <span className={cn("text-sm font-medium", isChecked ? "text-emerald-700" : "text-stone-500")}>
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={onSaveDraft}
              disabled={saving}
              className="flex items-center justify-center gap-2 rounded-[24px] border border-[var(--admin-border)] bg-white px-4 py-4 font-semibold text-stone-700 shadow-sm transition-all hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25 disabled:opacity-50"
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
                "flex items-center justify-center gap-2 rounded-[24px] px-4 py-4 font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25 disabled:opacity-50",
                progress >= 100
                  ? "bg-[var(--admin-accent)] text-white shadow-[0_12px_28px_rgba(255,106,0,0.18)] hover:from-[#E45700] hover:to-[#D34D00]"
                  : "cursor-not-allowed bg-stone-300 text-stone-500"
              )}
            >
              <Globe className="w-5 h-5" />
              {saving ? "Yayınlanıyor..." : "Yayınla"}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <h4 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--admin-accent-hover)]">Ürün Önizlemesi</h4>

          <div className="overflow-hidden rounded-[32px] border border-[var(--admin-border)] bg-white shadow-[0_18px_55px_rgba(72,36,8,0.08)]">
            <div className="relative aspect-[4/3] bg-[#f3e8dd]">
              {data.images[0] ? (
                <img
                  src={data.images[0].url}
                  alt={data.images[0].alt}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-stone-300">
                  <Eye className="w-16 h-16" />
                </div>
              )}
            </div>

            <div className="space-y-5 p-6">
              <div className="space-y-2">
                <h3 className="line-clamp-2 text-xl font-semibold text-stone-900">
                  {data.name || "Ürün Adı"}
                </h3>
                <p className="line-clamp-3 text-sm text-stone-500">
                  {data.shortDescription || "Kısa açıklama burada görünecek."}
                </p>
              </div>

              {data.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {data.tags.slice(0, 5).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--admin-accent-hover)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-black text-[var(--admin-accent)]">
                  ₺{primaryVariant?.price || 0}
                </span>
                {primaryVariant?.originalPrice ? (
                  <span className="text-lg text-stone-400 line-through">
                    ₺{primaryVariant.originalPrice}
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[22px] border border-[var(--admin-border)] bg-white/85 p-4">
                  <p className="text-xs uppercase tracking-wide text-stone-400">Kategori</p>
                  <p className="mt-1 font-semibold text-stone-900">
                    {data.category ? formatLabel(data.category) : "Belirtilmedi"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[var(--admin-border)] bg-white/85 p-4">
                  <p className="text-xs uppercase tracking-wide text-stone-400">Alt Kategori</p>
                  <p className="mt-1 font-semibold text-stone-900">
                    {data.subcategory ? formatLabel(data.subcategory) : "Yok"}
                  </p>
                </div>
                <div className="rounded-[22px] border border-[var(--admin-border)] bg-white/85 p-4">
                  <p className="text-xs uppercase tracking-wide text-stone-400">Varyant Sayısı</p>
                  <p className="mt-1 font-semibold text-stone-900">{data.variants.length}</p>
                </div>
                <div className="rounded-[22px] border border-[var(--admin-border)] bg-white/85 p-4">
                  <p className="text-xs uppercase tracking-wide text-stone-400">Stok Takibi</p>
                  <p className="mt-1 font-semibold text-stone-900">
                    {data.trackStock ? "Aktif" : "Pasif"}
                  </p>
                </div>
              </div>

              {data.variants.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h5 className="text-sm font-semibold text-stone-700">Varyantlar</h5>
                  <div className="space-y-2">
                    {data.variants.slice(0, 3).map((variant) => (
                      <div
                        key={variant.id}
                        className="flex items-center justify-between rounded-[22px] border border-[var(--admin-border)] bg-white/85 px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-stone-900">{variant.name}</p>
                          <p className="text-xs text-stone-500">{variant.sku || "SKU yok"}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-stone-900">₺{variant.price}</p>
                          <p className="text-xs text-stone-500">Stok: {variant.stock}</p>
                        </div>
                      </div>
                    ))}
                    {data.variants.length > 3 && (
                      <p className="text-xs text-stone-500">
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
