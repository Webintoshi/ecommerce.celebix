"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, ChevronDown, CircleDashed, ImageIcon, Package, Search, Truck } from "lucide-react";

import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { buildProductCategoryTree } from "@/lib/admin-product-categories";
import { fetchCategories } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { AdminProductWizardState } from "@/types/admin-product-wizard";
import type { ProductStatus, ProductVariant } from "@/types/product";

import { StepImages } from "./steps/StepImages";
import { VariantOptionBuilder } from "./VariantOptionBuilder";

type VariantProductQuickFormProps = {
  data: AdminProductWizardState;
  errors: Record<string, string>;
  onChange: (updates: Partial<AdminProductWizardState>) => void;
};

const SLUG_CHAR_MAP: Record<string, string> = {
  ş: "s",
  Ş: "s",
  ı: "i",
  İ: "i",
  ğ: "g",
  Ğ: "g",
  ü: "u",
  Ü: "u",
  ö: "o",
  Ö: "o",
  ç: "c",
  Ç: "c",
};

function generateSlug(name: string) {
  return name
    .split("")
    .map((char) => SLUG_CHAR_MAP[char] || char)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const PRODUCT_STATUS_CHOICES: Array<{
  value: Extract<ProductStatus, "draft" | "published">;
  label: string;
  description: string;
}> = [
  {
    value: "draft",
    label: "Satışa kapalı",
    description: "Taslak olarak kaydedilir",
  },
  {
    value: "published",
    label: "Yayına hazır",
    description: "Yayınla ile satışa açılır",
  },
];

export function VariantProductQuickForm({ data, errors, onChange }: VariantProductQuickFormProps) {
  const [categories, setCategories] = useState<Awaited<ReturnType<typeof fetchCategories>>>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [defaultPrice, setDefaultPrice] = useState(() => Number(data.variants[0]?.price) || 0);
  const [defaultStock, setDefaultStock] = useState(() => Number(data.variants[0]?.stock) || 0);
  const [defaultWeight, setDefaultWeight] = useState(() => Number(data.variants[0]?.weight) || 0);
  const [defaultUnit, setDefaultUnit] = useState<ProductVariant["unit"]>(() => data.variants[0]?.unit || "adet");
  const categoryTree = buildProductCategoryTree(categories);

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      try {
        const fetchedCategories = await fetchCategories();
        if (!cancelled) {
          setCategories(fetchedCategories);
        }
      } catch (error) {
        console.error("Failed to load categories:", error);
      } finally {
        if (!cancelled) {
          setLoadingCategories(false);
        }
      }
    }

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleNameChange = (value: string) => {
    const currentGeneratedSlug = generateSlug(data.name);
    onChange({
      name: value,
      slug: !data.slug || data.slug === currentGeneratedSlug ? generateSlug(value) : data.slug,
    });
  };

  const updateVariantDefaults = (updates: Partial<ProductVariant>) => {
    if (data.variants.length === 0) {
      return;
    }

    onChange({
      variants: data.variants.map((variant) => ({
        ...variant,
        ...updates,
      })),
    });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[8px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.05)] md:p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-[var(--admin-border)] pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--admin-accent)] text-white">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-stone-950">Varyasyonlu ürün bilgileri</h2>
            <p className="text-sm text-stone-500">Ürün ailesini tanımlayın, sonra seçeneklerden varyantları üretin.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 lg:col-span-2">
            <span className="text-sm font-semibold text-stone-700">Ürün adı *</span>
            <input
              type="text"
              value={data.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Örn: Start-stop akü"
              className={cn(
                "h-12 w-full rounded-[8px] border bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20",
                errors.name ? "border-rose-300 bg-rose-50/40" : "border-[#e8dbcf]",
              )}
            />
            {errors.name ? <span className="block text-xs font-medium text-rose-500">{errors.name}</span> : null}
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">Varsayılan fiyat</span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">₺</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={defaultPrice || ""}
                onChange={(event) => setDefaultPrice(Number(event.target.value) || 0)}
                placeholder="Matrix oluşurken kullanılır"
                className="h-12 w-full rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] pl-10 pr-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
              />
            </div>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">Varsayılan stok</span>
            <input
              type="number"
              min={0}
              step={1}
              value={defaultStock}
              onChange={(event) => setDefaultStock(Number.parseInt(event.target.value, 10) || 0)}
              className="h-12 w-full rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">Kategori *</span>
            <span className="relative block">
              <select
                value={data.category}
                onChange={(event) => onChange({ category: event.target.value, subcategory: "" })}
                className={cn(
                  "h-12 w-full appearance-none rounded-[8px] border bg-[#FCFDFE] px-4 pr-10 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20",
                  errors.category ? "border-rose-300 bg-rose-50/40" : "border-[#e8dbcf]",
                )}
              >
                <option value="">{loadingCategories ? "Yükleniyor..." : "Kategori seçin"}</option>
                {categoryTree.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            </span>
            {errors.category ? <span className="block text-xs font-medium text-rose-500">{errors.category}</span> : null}
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">Kısa açıklama</span>
            <textarea
              value={data.shortDescription}
              onChange={(event) => onChange({ shortDescription: event.target.value.slice(0, 160) })}
              rows={3}
              placeholder="Boşsa ürün adından taslak açıklama üretilir."
              className="w-full resize-none rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <div className="space-y-2 lg:col-span-2">
            <span className="text-sm font-semibold text-stone-700">Yayın durumu</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRODUCT_STATUS_CHOICES.map((choice) => {
                const isSelected = data.status === choice.value;
                const Icon = choice.value === "published" ? BadgeCheck : CircleDashed;

                return (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => onChange({ status: choice.value })}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-[8px] border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/20",
                      isSelected
                        ? "border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] text-[var(--admin-accent-hover)]"
                        : "border-[#E7EAF0] bg-[#FCFDFE] text-stone-700 hover:border-[var(--admin-accent-border)]",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>
                      <span className="block text-sm font-semibold">{choice.label}</span>
                      <span className="block text-xs text-stone-500">{choice.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <VariantOptionBuilder
        options={data.variantOptions}
        variants={data.variants}
        defaultPrice={defaultPrice}
        defaultStock={defaultStock}
        defaultWeight={defaultWeight}
        defaultUnit={defaultUnit}
        errors={errors}
        onOptionsChange={(variantOptions) => onChange({ variantOptions })}
        onVariantsChange={(variants) => onChange({ variants })}
      />

      <details className="rounded-[8px] border border-[var(--admin-border)] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-stone-800">
          <span className="inline-flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[var(--admin-accent)]" />
            Görseller
            <span className="text-xs font-normal text-stone-500">Ürün galerisi ve varyant görselleri daha sonra tamamlanabilir</span>
          </span>
          <ChevronDown className="h-4 w-4 text-stone-400" />
        </summary>
        <div className="border-t border-[var(--admin-border)]">
          <StepImages images={data.images} onChange={(images) => onChange({ images })} errors={{}} />
        </div>
      </details>

      <details className="rounded-[8px] border border-[var(--admin-border)] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-stone-800">
          <span className="inline-flex items-center gap-2">
            <Search className="h-4 w-4 text-[var(--admin-accent)]" />
            Gelişmiş ayarlar
            <span className="text-xs font-normal text-stone-500">Slug, SEO, kargo ve detaylı açıklama</span>
          </span>
          <ChevronDown className="h-4 w-4 text-stone-400" />
        </summary>
        <div className="grid gap-5 border-t border-[var(--admin-border)] p-5 lg:grid-cols-2">
          <div className="space-y-3 rounded-[8px] border border-[#E7EAF0] bg-[#FCFDFE] p-4 lg:col-span-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <Truck className="h-4 w-4 text-[var(--admin-accent)]" />
              Matrix varsayılanları
            </span>
            <div className="grid gap-4 md:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Ağırlık</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={defaultWeight || ""}
                  onChange={(event) => {
                    const nextWeight = Number.parseInt(event.target.value, 10) || 0;
                    setDefaultWeight(nextWeight);
                    updateVariantDefaults({ weight: nextWeight });
                  }}
                  className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-white px-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Birim</span>
                <select
                  value={defaultUnit || "adet"}
                  onChange={(event) => {
                    const nextUnit = event.target.value as ProductVariant["unit"];
                    setDefaultUnit(nextUnit);
                    updateVariantDefaults({ unit: nextUnit });
                  }}
                  className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-white px-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                >
                  {["adet", "kg", "g", "lt", "ml", "paket", "kutu"].map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Düşük stok eşiği</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={data.lowStockThreshold}
                  onChange={(event) => onChange({ lowStockThreshold: Number.parseInt(event.target.value, 10) || 0 })}
                  className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-white px-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 self-end rounded-[8px] border border-[#e8dbcf] bg-white px-3 text-sm font-semibold text-stone-700">
                <input
                  type="checkbox"
                  checked={data.trackStock}
                  onChange={(event) => onChange({ trackStock: event.target.checked })}
                  className="h-4 w-4 rounded border-[#D1D5DB] accent-[#FF6A00]"
                />
                Stok takibi
              </label>
            </div>
          </div>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">URL slug</span>
            <input
              type="text"
              value={data.slug}
              onChange={(event) => onChange({ slug: event.target.value })}
              className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 font-mono text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">SEO başlığı</span>
            <input
              type="text"
              value={data.seo.title}
              onChange={(event) => onChange({ seo: { ...data.seo, title: event.target.value } })}
              placeholder="Boşsa ürün adından üretilir"
              className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <label className="space-y-2 lg:col-span-2">
            <span className="text-sm font-semibold text-stone-700">SEO açıklaması</span>
            <input
              type="text"
              value={data.seo.description}
              onChange={(event) => onChange({ seo: { ...data.seo, description: event.target.value } })}
              placeholder="Boşsa kısa açıklamadan üretilir"
              className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <div className="space-y-2 lg:col-span-2">
            <span className="text-sm font-semibold text-stone-700">Detaylı açıklama</span>
            <RichTextEditor
              value={data.description}
              onChange={(description) => onChange({ description })}
              placeholder="Ürün ailesi hakkında detaylı bilgi, başlıklar veya teknik özellikler."
              minHeightClassName="min-h-[180px]"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
