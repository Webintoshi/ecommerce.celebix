"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Package, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { buildProductCategoryTree, getChildCategoriesByParentSlug } from "@/lib/admin-product-categories";
import { fetchCategories } from "@/lib/categories";
import { PRODUCT_TAG_LIMITS, normalizeProductTag } from "@/lib/product-tags";
import { cn } from "@/lib/utils";
import type { AdminProductWizardState } from "@/types/admin-product-wizard";

interface StepBasicInfoProps {
  data: AdminProductWizardState;
  onChange: (updates: Partial<AdminProductWizardState>) => void;
  errors: Record<string, string>;
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

export function StepBasicInfo({ data, onChange, errors }: StepBasicInfoProps) {
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

    if (!data.slug || data.slug === generateSlug(data.name)) {
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
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
        <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/20">
          <Package className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <div>
          <h3 className="text-lg md:text-xl font-bold text-gray-900">Temel Bilgiler</h3>
          <p className="text-xs md:text-sm text-gray-500">
            Ürünün temel tanımlayıcı bilgileri
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-2">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1">
              Ürün Adı <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={data.name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Örn: El Yapımı Seramik Kupa"
              className={cn(
                "w-full px-3 py-2.5 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm",
                errors.name ? "border-rose-300 bg-rose-50/30" : "border-gray-200"
              )}
            />
            {errors.name ? (
              <p className="text-xs text-rose-500 font-medium">{errors.name}</p>
            ) : null}
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              URL Slug <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs md:text-sm">
                /urunler/
              </span>
              <input
                type="text"
                value={data.slug}
                onChange={(event) => onChange({ slug: event.target.value })}
                placeholder="el-yapimi-seramik-kupa"
                className={cn(
                  "w-full pl-16 pr-3 py-2.5 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-xs md:text-sm font-mono",
                  errors.slug ? "border-rose-300 bg-rose-50/30" : "border-gray-200"
                )}
              />
            </div>
            {errors.slug ? (
              <p className="text-xs text-rose-500 font-medium">{errors.slug}</p>
            ) : null}
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-gray-700">
                Kısa Açıklama <span className="text-rose-500">*</span>
              </label>
              <span
                className={cn(
                  "text-xs font-medium",
                  data.shortDescription.length > 150 ? "text-amber-500" : "text-gray-400"
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
                "w-full px-3 py-2.5 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none text-sm",
                errors.shortDescription ? "border-rose-300 bg-rose-50/30" : "border-gray-200"
              )}
            />
            {errors.shortDescription ? (
              <p className="text-xs text-rose-500 font-medium">
                {errors.shortDescription}
              </p>
            ) : null}
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-2">
            <label className="text-sm font-semibold text-gray-700">
              Ürün Açıklaması <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={data.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="Ürün hakkında detaylı bilgi, kullanım alanları ve teknik özellikler."
              rows={5}
              className={cn(
                "w-full px-3 py-2.5 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all resize-none text-sm",
                errors.description ? "border-rose-300 bg-rose-50/30" : "border-gray-200"
              )}
            />
            {errors.description ? (
              <p className="text-xs text-rose-500 font-medium">{errors.description}</p>
            ) : null}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">
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
                      "w-full appearance-none px-3 py-2.5 bg-gray-50 border rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer text-sm",
                      errors.category ? "border-rose-300 bg-rose-50/30" : "border-gray-200"
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
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                {errors.category ? (
                  <p className="text-xs text-rose-500 font-medium">{errors.category}</p>
                ) : null}
              </div>

              {subcategories.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700">Alt Kategori</label>
                  <div className="relative">
                    <select
                      value={data.subcategory}
                      onChange={(event) => onChange({ subcategory: event.target.value })}
                      className="w-full appearance-none px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all cursor-pointer text-sm"
                    >
                      <option value="">Alt kategori seçin</option>
                      {subcategories.map((subcategory) => (
                        <option key={subcategory.id} value={subcategory.slug}>
                          {subcategory.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
              ) : null}
            </div>

            {data.category && subcategories.length === 0 ? (
              <p className="text-xs text-gray-500">
                Seçili kategori için alt kategori tanımlı değil.
              </p>
            ) : null}
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Marka</label>
                <input
                  type="text"
                  value={data.brand}
                  onChange={(event) => onChange({ brand: event.target.value })}
                  placeholder="Marka veya üretici adı"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">Menşei</label>
                <input
                  type="text"
                  value={data.countryOfOrigin}
                  onChange={(event) => onChange({ countryOfOrigin: event.target.value })}
                  placeholder="Menşei ülke veya bölge"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 border border-gray-200 space-y-3">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
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
              className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm"
            />

            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {data.tags.length}/{PRODUCT_TAG_LIMITS.maxCount} etiket
              </span>
              <span>Her etiket en fazla {PRODUCT_TAG_LIMITS.maxLength} karakter</span>
            </div>

            {availableSuggestions.length > 0 || loadingSuggestions ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500">
                  {loadingSuggestions ? "Öneriler yükleniyor..." : "Öneriler"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {availableSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.value}
                      type="button"
                      onClick={() => addTag(suggestion.value)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all"
                    >
                      {suggestion.value}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {data.tags.length > 0 ? (
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <p className="text-xs text-gray-500">Seçilen etiketler</p>
                <div className="flex flex-wrap gap-2">
                  {data.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(tag)}
                        className="hover:text-blue-900"
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
