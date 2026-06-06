"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Package, Tag, X } from "lucide-react";
import { toast } from "sonner";

import { buildProductCategoryTree, getChildCategoriesByParentSlug } from "@/lib/admin-product-categories";
import { fetchCategories } from "@/lib/categories";
import { PRODUCT_TAG_LIMITS, normalizeProductTag } from "@/lib/product-tags";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import type { AdminProductWizardState } from "@/types/admin-product-wizard";

interface StepBasicInfoProps {
  data: AdminProductWizardState;
  onChange: (updates: Partial<AdminProductWizardState>) => void;
  errors: Record<string, string>;
  autoSyncSlugFromName?: boolean;
}

interface TagSuggestion {
  value: string;
  usageCount: number;
}

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

export function StepBasicInfo({
  data,
  onChange,
  errors,
  autoSyncSlugFromName = true,
}: StepBasicInfoProps) {
  const [categories, setCategories] = useState<
    Awaited<ReturnType<typeof fetchCategories>>
  >([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [tagInput, setTagInput] = useState("");
  const [tagSuggestions, setTagSuggestions] = useState<TagSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

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

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setLoadingSuggestions(true);

        const params = new URLSearchParams({
          limit: "12",
        });

        const normalizedQuery = normalizeProductTag(tagInput);
        if (normalizedQuery) {
          params.set("q", normalizedQuery);
        }

        const response = await fetch(
          `/api/admin/product-tag-suggestions?${params.toString()}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Etiket önerileri alınamadı");
        }

        const result = await response.json();
        if (!controller.signal.aborted && result.success) {
          setTagSuggestions(Array.isArray(result.tags) ? result.tags : []);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Failed to load tag suggestions:", error);
          setTagSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSuggestions(false);
        }
      }
    }, tagInput.trim() ? 180 : 0);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [tagInput]);

  const categoryTree = buildProductCategoryTree(categories);
  const subcategories = data.category
    ? getChildCategoriesByParentSlug(categoryTree, data.category)
    : [];
  const availableSuggestions = tagSuggestions.filter(
    (suggestion) => !data.tags.includes(suggestion.value)
  );
  const subcategoryKey = subcategories.map((subcategory) => subcategory.slug).join("|");
  const hasSelectedSubcategory = !data.subcategory
    ? true
    : subcategories.some((subcategory) => subcategory.slug === data.subcategory);

  useEffect(() => {
    if (!hasSelectedSubcategory) {
      onChange({ subcategory: "" });
    }
  }, [hasSelectedSubcategory, onChange, subcategoryKey]);

  const handleNameChange = (value: string) => {
    const updates: Partial<AdminProductWizardState> = { name: value };

    if (!data.slug || (autoSyncSlugFromName && data.slug === generateSlug(data.name))) {
      updates.slug = generateSlug(value);
    }

    onChange(updates);
  };

  const addTag = (rawValue: string) => {
    const normalizedTag = normalizeProductTag(rawValue);

    if (!normalizedTag) {
      setTagInput("");
      return;
    }

    if (normalizedTag.length > PRODUCT_TAG_LIMITS.maxLength) {
      toast.error(
        `Her etiket en fazla ${PRODUCT_TAG_LIMITS.maxLength} karakter olabilir.`
      );
      return;
    }

    if (data.tags.includes(normalizedTag)) {
      setTagInput("");
      return;
    }

    if (data.tags.length >= PRODUCT_TAG_LIMITS.maxCount) {
      toast.error(
        `En fazla ${PRODUCT_TAG_LIMITS.maxCount} benzersiz etiket ekleyebilirsiniz.`
      );
      return;
    }

    onChange({ tags: [...data.tags, normalizedTag] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    onChange({ tags: data.tags.filter((item) => item !== tag) });
  };

  return (
    <div className="space-y-6 p-4 md:p-6 lg:p-8">
      <div className="flex items-center gap-3 border-b border-[var(--admin-border)] pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--admin-accent)] text-white shadow-[0_14px_28px_rgba(255,106,0,0.22)] md:h-12 md:w-12 md:rounded-2xl">
          <Package className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.02em] text-stone-900 md:text-xl">Temel Bilgiler</h3>
          <p className="text-xs text-stone-500 md:text-sm">
            Ürünün temel tanımlayıcı bilgileri
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-2 rounded-[24px] border border-[var(--admin-border)] bg-white/90 p-4 shadow-sm">
            <label className="flex items-center gap-1 text-sm font-semibold text-stone-700">
              Ürün Adı <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={data.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Örn: El Yapımı Seramik Kupa"
              className={cn(
                "w-full rounded-2xl border bg-[#FCFDFE] px-4 py-3 text-sm text-stone-900 outline-none transition-all placeholder:text-stone-400 focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20",
                errors.name ? "border-rose-300 bg-rose-50/30" : "border-[#e8dbcf]"
              )}
            />
            {errors.name ? (
              <p className="text-xs text-rose-500 font-medium">{errors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-[24px] border border-[var(--admin-border)] bg-white/90 p-4 shadow-sm">
            <label className="text-sm font-semibold text-stone-700">
              URL Slug <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs text-stone-400 md:text-sm">
                /urunler/
              </span>
              <input
                type="text"
                value={data.slug}
                onChange={(event) => onChange({ slug: event.target.value })}
                placeholder="el-yapimi-seramik-kupa"
                className={cn(
                  "w-full rounded-2xl border bg-[#FCFDFE] py-3 pl-20 pr-4 text-xs font-mono outline-none transition-all md:text-sm focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20",
                  errors.slug ? "border-rose-300 bg-rose-50/30" : "border-[#e8dbcf]"
                )}
              />
            </div>
            {errors.slug ? (
              <p className="text-xs text-rose-500 font-medium">{errors.slug}</p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-[24px] border border-[var(--admin-border)] bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-stone-700">
                Kısa Açıklama <span className="text-rose-500">*</span>
              </label>
              <span
                className={cn(
                  "text-xs font-medium",
                  data.shortDescription.length > 150 ? "text-amber-600" : "text-stone-400"
                )}
              >
                {data.shortDescription.length}/160
              </span>
            </div>
            <textarea
              value={data.shortDescription}
              onChange={(event) => {
                if (event.target.value.length <= 160) {
                  onChange({ shortDescription: event.target.value });
                }
              }}
              placeholder="Arama sonuçlarında görünecek kısa özet."
              rows={2}
              className={cn(
                "w-full resize-none rounded-2xl border bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20",
                errors.shortDescription ? "border-rose-300 bg-rose-50/30" : "border-[#e8dbcf]"
              )}
            />
            {errors.shortDescription ? (
              <p className="text-xs text-rose-500 font-medium">
                {errors.shortDescription}
              </p>
            ) : null}
          </div>

          <div className="space-y-2 rounded-[24px] border border-[var(--admin-border)] bg-white/90 p-4 shadow-sm">
            <label className="text-sm font-semibold text-stone-700">
              Ürün Açıklaması <span className="text-rose-500">*</span>
            </label>
            <RichTextEditor
              value={data.description}
              onChange={(description) => onChange({ description })}
              placeholder="Ürün hakkında detaylı bilgi, başlıklar, listeler ve teknik özellikler."
              error={errors.description}
              minHeightClassName="min-h-[220px]"
            />
            {errors.description ? (
              <p className="text-xs text-rose-500 font-medium">{errors.description}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <div className="space-y-4 rounded-[24px] border border-[var(--admin-border)] bg-gradient-to-br from-white to-[#fff8f3] p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">
                  Kategori <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={data.category}
                    onChange={(event) =>
                      onChange({
                        category: event.target.value,
                        subcategory: "",
                      })
                    }
                    className={cn(
                      "w-full cursor-pointer appearance-none rounded-2xl border bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20",
                      errors.category ? "border-rose-300 bg-rose-50/30" : "border-[#e8dbcf]"
                    )}
                  >
                    <option value="">
                      {loadingCategories ? "Yükleniyor..." : "Kategori seçin"}
                    </option>
                    {categoryTree.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                </div>
                {errors.category ? (
                  <p className="text-xs text-rose-500 font-medium">{errors.category}</p>
                ) : null}
              </div>

              {subcategories.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-stone-700">Alt Kategori</label>
                  <div className="relative">
                    <select
                      value={data.subcategory}
                      onChange={(event) => onChange({ subcategory: event.target.value })}
                      className="w-full cursor-pointer appearance-none rounded-2xl border border-[#e8dbcf] bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                    >
                      <option value="">Alt kategori seçin</option>
                      {subcategories.map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.slug}>
                          {subcategory.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  </div>
                </div>
              ) : null}
            </div>

            {data.category && subcategories.length === 0 ? (
              <p className="text-xs text-stone-500">
                Seçili kategori için alt kategori tanımlı değil.
              </p>
            ) : null}
          </div>

          <div className="space-y-4 rounded-[24px] border border-[var(--admin-border)] bg-white/90 p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">Marka</label>
                <input
                  type="text"
                  value={data.brand}
                  onChange={(event) => onChange({ brand: event.target.value })}
                  placeholder="Marka veya üretici adı"
                  className="w-full rounded-2xl border border-[#e8dbcf] bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-stone-700">Menşei</label>
                <input
                  type="text"
                  value={data.countryOfOrigin}
                  onChange={(event) => onChange({ countryOfOrigin: event.target.value })}
                  placeholder="Menşei ülke veya bölge"
                  className="w-full rounded-2xl border border-[#e8dbcf] bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-[24px] border border-[var(--admin-border)] bg-gradient-to-br from-white to-[#fff8f3] p-4 shadow-sm">
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <Tag className="h-4 w-4 text-[var(--admin-accent)]" />
              Etiketler
            </label>

            <input
              type="text"
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag(tagInput);
                }
              }}
              placeholder="Etiket eklemek için yazın ve Enter'a basın"
              className="w-full rounded-2xl border border-[#e8dbcf] bg-[#FCFDFE] px-4 py-3 text-sm outline-none transition-all focus:border-[var(--admin-accent)] focus:bg-white focus:ring-2 focus:ring-[var(--admin-accent)]/20"
            />

            <div className="flex items-center justify-between text-xs text-stone-500" aria-live="polite">
              <span>
                {data.tags.length}/{PRODUCT_TAG_LIMITS.maxCount} etiket
              </span>
              <span>Her etiket en fazla {PRODUCT_TAG_LIMITS.maxLength} karakter</span>
            </div>

            {availableSuggestions.length > 0 || loadingSuggestions ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-stone-500">
                  {loadingSuggestions ? "Öneriler yükleniyor..." : "Öneriler"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.value}
                      type="button"
                      onClick={() => addTag(suggestion.value)}
                      className="rounded-full border border-[var(--admin-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--admin-accent-hover)] transition-all hover:border-[var(--admin-accent-border)] hover:bg-[#fff5ee] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25"
                    >
                      {suggestion.value}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {data.tags.length > 0 ? (
              <div className="space-y-2 border-t border-[var(--admin-border)] pt-2">
                <p className="text-xs text-stone-500">Seçilen etiketler</p>
                <div className="flex flex-wrap gap-2">
                  {data.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--admin-accent-hover)]"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="rounded-full text-[var(--admin-accent-hover)] transition-colors hover:text-[#9f3d00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6A00]/25"
                        aria-label={`${tag} etiketini kaldır`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
