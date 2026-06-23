"use client";

import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, CircleDashed, ImageIcon, Package, Search, Tag, Truck } from "lucide-react";
import { toast } from "sonner";

import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { buildProductCategoryTree } from "@/lib/admin-product-categories";
import { fetchCategories } from "@/lib/categories";
import { buildGeneratedSku } from "@/lib/sku";
import { cn } from "@/lib/utils";
import { PRODUCT_TAG_LIMITS, normalizeProductTag } from "@/lib/product-tags";
import type { AdminProductWizardState } from "@/types/admin-product-wizard";
import type { ProductStatus, ProductVariant } from "@/types/product";

import { StepImages } from "./steps/StepImages";

type SimpleProductQuickFormProps = {
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

function buildPrimaryVariant(current?: ProductVariant): ProductVariant {
  return {
    id: current?.id || `variant-${Date.now()}`,
    name: current?.name || "Varsayılan Varyant",
    weight: current?.weight || 0,
    price: Number(current?.price) || 0,
    originalPrice: current?.originalPrice,
    cost: current?.cost,
    stock: Number(current?.stock) || 0,
    sku: current?.sku || buildGeneratedSku(),
    barcode: current?.barcode,
    groupName: current?.groupName,
    unit: current?.unit || "adet",
    images: current?.images || [],
    isEnabled: current?.isEnabled !== false,
    maxPurchaseQuantity: current?.maxPurchaseQuantity,
    warehouseLocation: current?.warehouseLocation,
  };
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

export function SimpleProductQuickForm({ data, errors, onChange }: SimpleProductQuickFormProps) {
  const [categories, setCategories] = useState<Awaited<ReturnType<typeof fetchCategories>>>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const primaryVariant = useMemo(() => buildPrimaryVariant(data.variants[0]), [data.variants]);
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

  const updatePrimaryVariant = (updates: Partial<ProductVariant>) => {
    const nextVariant = { ...primaryVariant, ...updates, isEnabled: true };
    onChange({ variants: [nextVariant] });
  };

  const handleNameChange = (value: string) => {
    const currentGeneratedSlug = generateSlug(data.name);
    onChange({
      name: value,
      slug: !data.slug || data.slug === currentGeneratedSlug ? generateSlug(value) : data.slug,
    });
  };

  const addTag = () => {
    const normalizedTag = normalizeProductTag(tagInput);
    if (!normalizedTag) {
      setTagInput("");
      return;
    }

    if (normalizedTag.length > PRODUCT_TAG_LIMITS.maxLength) {
      toast.error(`Her etiket en fazla ${PRODUCT_TAG_LIMITS.maxLength} karakter olabilir.`);
      return;
    }

    if (data.tags.includes(normalizedTag)) {
      setTagInput("");
      return;
    }

    if (data.tags.length >= PRODUCT_TAG_LIMITS.maxCount) {
      toast.error(`En fazla ${PRODUCT_TAG_LIMITS.maxCount} benzersiz etiket ekleyebilirsiniz.`);
      return;
    }

    onChange({ tags: [...data.tags, normalizedTag] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    onChange({ tags: data.tags.filter((entry) => entry !== tag) });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[8px] border border-[var(--admin-border)] bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.05)] md:p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-[var(--admin-border)] pb-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-[var(--admin-accent)] text-white">
            <Package className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-stone-950">Hızlı ürün bilgileri</h2>
            <p className="text-sm text-stone-500">Kayda başlamak için gerekli operasyon alanları.</p>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <label className="space-y-2 xl:col-span-2">
            <span className="text-sm font-semibold text-stone-700">Ürün adı *</span>
            <input
              type="text"
              value={data.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Örn: Premium Akü"
              className={cn(
                "h-12 w-full rounded-[8px] border bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20",
                errors.name ? "border-rose-300 bg-rose-50/40" : "border-[#e8dbcf]",
              )}
            />
            {errors.name ? <span className="block text-xs font-medium text-rose-500">{errors.name}</span> : null}
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">Satış fiyatı *</span>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400">₺</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={primaryVariant.price || ""}
                onChange={(event) => updatePrimaryVariant({ price: Number(event.target.value) || 0 })}
                placeholder="0.00"
                className={cn(
                  "h-12 w-full rounded-[8px] border bg-[#FCFDFE] pl-10 pr-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20",
                  errors.price ? "border-rose-300 bg-rose-50/40" : "border-[#e8dbcf]",
                )}
              />
            </div>
            {errors.price ? <span className="block text-xs font-medium text-rose-500">{errors.price}</span> : null}
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">Stok</span>
            <input
              type="number"
              min={0}
              step={1}
              value={primaryVariant.stock}
              onChange={(event) => updatePrimaryVariant({ stock: Number.parseInt(event.target.value, 10) || 0 })}
              className={cn(
                "h-12 w-full rounded-[8px] border bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20",
                errors.stock ? "border-rose-300 bg-rose-50/40" : "border-[#e8dbcf]",
              )}
            />
            {errors.stock ? <span className="block text-xs font-medium text-rose-500">{errors.stock}</span> : null}
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
              placeholder="Boş bırakılırsa ürün adından güvenli taslak açıklama üretilir."
              className="w-full resize-none rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <div className="space-y-2 xl:col-span-2">
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

      <details className="rounded-[8px] border border-[var(--admin-border)] bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-stone-800">
          <span className="inline-flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-[var(--admin-accent)]" />
            Görseller
            <span className="text-xs font-normal text-stone-500">İsteğe bağlı, sonra da tamamlanabilir</span>
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
            <span className="text-xs font-normal text-stone-500">SEO, kargo, etiket, marka ve detaylı açıklama</span>
          </span>
          <ChevronDown className="h-4 w-4 text-stone-400" />
        </summary>

        <div className="grid gap-5 border-t border-[var(--admin-border)] p-4 sm:p-5 xl:grid-cols-2">
          <div className="space-y-3 rounded-[8px] border border-[#E7EAF0] bg-[#FCFDFE] p-4 xl:col-span-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <Truck className="h-4 w-4 text-[var(--admin-accent)]" />
              Kargo ve stok ayarları
            </span>
            <div className="grid gap-4 min-[1025px]:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Ağırlık</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={primaryVariant.weight || ""}
                  onChange={(event) => updatePrimaryVariant({ weight: Number.parseInt(event.target.value, 10) || 0 })}
                  className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-white px-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">Birim</span>
                <select
                  value={primaryVariant.unit || "adet"}
                  onChange={(event) => updatePrimaryVariant({ unit: event.target.value as ProductVariant["unit"] })}
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
            <span className="text-sm font-semibold text-stone-700">Marka</span>
            <input
              type="text"
              value={data.brand}
              onChange={(event) => onChange({ brand: event.target.value })}
              className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <div className="space-y-2 xl:col-span-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <Tag className="h-4 w-4 text-[var(--admin-accent)]" />
              Etiketler
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Etiket yaz ve Enter'a bas"
                className="h-11 flex-1 rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
              />
              <button
                type="button"
                onClick={addTag}
                className="h-11 rounded-[8px] bg-stone-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--admin-accent)]"
              >
                Ekle
              </button>
            </div>
            {data.tags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--admin-accent-hover)]"
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
            ) : null}
          </div>

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

          <label className="space-y-2">
            <span className="text-sm font-semibold text-stone-700">SEO açıklaması</span>
            <input
              type="text"
              value={data.seo.description}
              onChange={(event) => onChange({ seo: { ...data.seo, description: event.target.value } })}
              placeholder="Boşsa kısa açıklamadan üretilir"
              className="h-11 w-full rounded-[8px] border border-[#e8dbcf] bg-[#FCFDFE] px-4 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:ring-2 focus:ring-[#FF6A00]/20"
            />
          </label>

          <div className="space-y-2 xl:col-span-2">
            <span className="text-sm font-semibold text-stone-700">Detaylı açıklama</span>
            <RichTextEditor
              value={data.description}
              onChange={(description) => onChange({ description })}
              placeholder="Ürün hakkında detaylı bilgi, başlıklar veya teknik özellikler."
              minHeightClassName="min-h-[180px]"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
