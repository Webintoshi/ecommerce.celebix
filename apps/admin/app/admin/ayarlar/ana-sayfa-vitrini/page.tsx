"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  LayoutGrid,
  Loader2,
  Save,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { fetchAdminJson } from "@/lib/admin-client-fetch";
import { fetchCategories } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { CategoryInfo } from "@/types/product";

const MAX_HOMEPAGE_CATEGORIES = 4;
const MAX_VISIBLE_PRODUCTS = 60;

type HomepageCurationSettings = {
  featuredCategorySlugs: string[];
  updatedAt?: string;
};

type HomepageProduct = {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string;
  featured: boolean;
  isActive: boolean;
  status: string | null;
  images: string[];
};

function normalizeHomepageCuration(value: unknown): HomepageCurationSettings {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const featuredCategorySlugs = Array.isArray(record.featuredCategorySlugs)
    ? record.featuredCategorySlugs
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .filter((entry, index, source) => source.indexOf(entry) === index)
        .slice(0, MAX_HOMEPAGE_CATEGORIES)
    : [];

  return {
    featuredCategorySlugs,
    updatedAt:
      typeof record.updatedAt === "string" && record.updatedAt.trim().length > 0
        ? record.updatedAt
        : undefined,
  };
}

function mapProduct(record: Record<string, unknown>): HomepageProduct {
  return {
    id: String(record.id || ""),
    name: String(record.name || ""),
    slug: String(record.slug || ""),
    category: String(record.category || ""),
    subcategory: String(record.subcategory || ""),
    featured: Boolean(record.is_featured),
    isActive: record.is_active !== false,
    status: typeof record.status === "string" ? record.status : null,
    images: Array.isArray(record.images)
      ? record.images.filter((entry): entry is string => typeof entry === "string")
      : [],
  };
}

function reorderSlugs(slugs: string[], slug: string, direction: "up" | "down") {
  const currentIndex = slugs.indexOf(slug);
  if (currentIndex < 0) {
    return slugs;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= slugs.length) {
    return slugs;
  }

  const next = [...slugs];
  [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
  return next;
}

export default function HomepageCurationPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [products, setProducts] = useState<HomepageProduct[]>([]);
  const [featuredCategorySlugs, setFeaturedCategorySlugs] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [updatingProductIds, setUpdatingProductIds] = useState<string[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const [fetchedCategories, productsPayload, homepagePayload] = await Promise.all([
        fetchCategories({ fresh: true }),
        fetchAdminJson<{ success: boolean; products?: Record<string, unknown>[] }>(
          "/api/products?all=true",
          { timeoutMs: 15000 },
        ),
        fetchAdminJson<{ success: boolean; homepageCuration?: HomepageCurationSettings }>(
          "/api/settings?type=homepage-curation",
          { timeoutMs: 10000 },
        ),
      ]);

      setCategories(
        fetchedCategories
          .filter((category) => category.is_active !== false)
          .sort((left, right) => {
            const leftOrder = typeof left.sort_order === "number" ? left.sort_order : 999;
            const rightOrder = typeof right.sort_order === "number" ? right.sort_order : 999;

            if (leftOrder !== rightOrder) {
              return leftOrder - rightOrder;
            }

            return left.name.localeCompare(right.name, "tr");
          }),
      );
      setProducts((productsPayload.products || []).map(mapProduct));
      setFeaturedCategorySlugs(
        normalizeHomepageCuration(homepagePayload.homepageCuration).featuredCategorySlugs,
      );
    } catch (error) {
      console.error("Failed to load homepage curation data:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Ana sayfa vitrini verileri yuklenemedi.",
      );
    } finally {
      setLoading(false);
    }
  }

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.slug, category])),
    [categories],
  );

  const selectedCategories = useMemo(
    () =>
      featuredCategorySlugs
        .map((slug) => categoryMap.get(slug))
        .filter((category): category is CategoryInfo => Boolean(category)),
    [categoryMap, featuredCategorySlugs],
  );

  const availableCategories = useMemo(
    () =>
      categories.filter((category) => !featuredCategorySlugs.includes(category.slug)),
    [categories, featuredCategorySlugs],
  );

  const featuredProducts = useMemo(
    () => products.filter((product) => product.featured),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const normalizedQuery = productSearch.trim().toLocaleLowerCase("tr-TR");

    const byCategoryPriority = [...products].sort((left, right) => {
      if (left.featured !== right.featured) {
        return left.featured ? -1 : 1;
      }

      const leftCategoryPriority = featuredCategorySlugs.indexOf(left.category);
      const rightCategoryPriority = featuredCategorySlugs.indexOf(right.category);

      if (leftCategoryPriority !== rightCategoryPriority) {
        const normalizedLeft = leftCategoryPriority === -1 ? 999 : leftCategoryPriority;
        const normalizedRight = rightCategoryPriority === -1 ? 999 : rightCategoryPriority;
        return normalizedLeft - normalizedRight;
      }

      return left.name.localeCompare(right.name, "tr");
    });

    if (!normalizedQuery) {
      return byCategoryPriority.slice(0, MAX_VISIBLE_PRODUCTS);
    }

    return byCategoryPriority
      .filter((product) => {
        const haystack = [
          product.name,
          product.slug,
          product.category,
          product.subcategory,
          categoryMap.get(product.category)?.name || "",
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR");

        return haystack.includes(normalizedQuery);
      })
      .slice(0, MAX_VISIBLE_PRODUCTS);
  }, [categoryMap, featuredCategorySlugs, productSearch, products]);

  function toggleCategory(slug: string) {
    setFeaturedCategorySlugs((current) => {
      if (current.includes(slug)) {
        return current.filter((entry) => entry !== slug);
      }

      if (current.length >= MAX_HOMEPAGE_CATEGORIES) {
        toast.error("Ana sayfada en fazla 4 kategori vitrine alinabilir.");
        return current;
      }

      return [...current, slug];
    });
  }

  function moveCategory(slug: string, direction: "up" | "down") {
    setFeaturedCategorySlugs((current) => reorderSlugs(current, slug, direction));
  }

  async function saveCategories() {
    setSaving(true);

    try {
      await fetchAdminJson("/api/settings", {
        timeoutMs: 10000,
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "homepage-curation",
            homepageCuration: {
              featuredCategorySlugs,
            },
          }),
        },
      });

      toast.success("Ana sayfa kategori vitrini kaydedildi.");
    } catch (error) {
      console.error("Failed to save homepage curation:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Ana sayfa vitrini kaydedilemedi.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleProductFeatured(product: HomepageProduct) {
    const nextFeatured = !product.featured;

    setUpdatingProductIds((current) => [...current, product.id]);
    setProducts((current) =>
      current.map((entry) =>
        entry.id === product.id ? { ...entry, featured: nextFeatured } : entry,
      ),
    );

    try {
      await fetchAdminJson("/api/products", {
        timeoutMs: 12000,
        init: {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            id: product.id,
            is_featured: nextFeatured,
          }),
        },
      });
    } catch (error) {
      setProducts((current) =>
        current.map((entry) =>
          entry.id === product.id ? { ...entry, featured: product.featured } : entry,
        ),
      );
      console.error("Failed to toggle featured product:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Ürün yildizi guncellenemedi.",
      );
    } finally {
      setUpdatingProductIds((current) => current.filter((entry) => entry !== product.id));
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6efe7] px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[32px] border border-[#FE6100]/10 bg-gradient-to-br from-white via-[#fffdf9] to-[#f8efe6] p-6 shadow-[0_24px_80px_rgba(120,74,32,0.10)] md:p-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center rounded-full border border-[#FE6100]/18 bg-gradient-to-r from-[#FE6100]/10 to-[#FFB067]/10 px-5 py-2 text-sm font-semibold uppercase tracking-[0.18em] text-[#C54E00]">
                Ana Sayfa Vitrini
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[#2f241d]">
                Kategori ve urun vitrini burada yonetilir
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[#7d6959]">
                En fazla 4 kategori secilir. Storefront, bu kategorileri secili siraniza gore
                ana sayfada gosterir. Her kategori icin once o kategoriye ait yildizli urunler
                kullanilir; eksik kalirsa normal aktif urunlerle otomatik tamamlanir.
              </p>
              <p className="mt-3 text-sm leading-7 text-[#9a7a63]">
                Kategori secimini bos birakirsan sistem mevcut otomatik vitrini kullanmaya devam eder.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void saveCategories()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FE6100] to-[#E45700] px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(254,97,0,0.22)] transition-all hover:from-[#f15c00] hover:to-[#d84f00] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Kategori sirasini kaydet
            </button>
          </div>
        </section>

        <div className="grid gap-5 md:grid-cols-3">
          <div className="rounded-[28px] border border-[#eadccd] bg-white p-6 shadow-[0_18px_40px_rgba(99,67,37,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fff3e8] text-[#FE6100]">
                <LayoutGrid className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-[#7d6959]">Secili kategori</p>
                <p className="text-2xl font-semibold tracking-[-0.04em] text-[#2f241d]">
                  {selectedCategories.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#eadccd] bg-white p-6 shadow-[0_18px_40px_rgba(99,67,37,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fff7eb] text-[#d98417]">
                <Star className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-[#7d6959]">Yildizli urun</p>
                <p className="text-2xl font-semibold tracking-[-0.04em] text-[#2f241d]">
                  {featuredProducts.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[#eadccd] bg-white p-6 shadow-[0_18px_40px_rgba(99,67,37,0.08)]">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-[#fff9f1] text-[#b8681f]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-[#7d6959]">Canli davranis</p>
                <p className="text-sm font-semibold leading-6 text-[#2f241d]">
                  Secili kategori sirasi + kategori icindeki yildizli ilk 4 urun
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <section className="rounded-[30px] border border-[#FE6100]/10 bg-white shadow-[0_24px_70px_rgba(72,36,8,0.08)]">
            <div className="border-b border-[#FE6100]/8 px-6 py-5">
              <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#2f241d]">
                One cikan kategoriler
              </h2>
              <p className="mt-2 text-sm leading-6 text-[#7d6959]">
                Ana sayfa kategori bloklari bu siraya gore yukaridan asagiya kurulur.
              </p>
            </div>

            <div className="space-y-6 px-6 py-6">
              <div className="space-y-3">
                {selectedCategories.length === 0 ? (
                  <div className="rounded-[24px] border border-dashed border-[#eadccd] bg-[#fdf8f3] px-5 py-6 text-sm leading-7 text-[#8c7564]">
                    Henuz kategori secilmedi. Bu durumda storefront mevcut otomatik kategori vitriniyle devam eder.
                  </div>
                ) : (
                  selectedCategories.map((category, index) => (
                    <div
                      key={category.id}
                      className="rounded-[24px] border border-[#eadccd] bg-[#fffdfa] p-4 shadow-[0_10px_24px_rgba(99,67,37,0.05)]"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C54E00]">
                            Sira {index + 1}
                          </p>
                          <h3 className="mt-2 text-base font-semibold text-[#2f241d]">
                            {category.name}
                          </h3>
                          <p className="mt-1 text-sm text-[#7d6959]">{category.slug}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleCategory(category.slug)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 transition-all hover:bg-amber-100"
                          aria-label={`${category.name} kategorisini vitrinden kaldir`}
                        >
                          <Star className="h-4 w-4 fill-current" />
                        </button>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => moveCategory(category.slug, "up")}
                          disabled={index === 0}
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-600 transition-all hover:text-[#C54E00] disabled:cursor-not-allowed disabled:opacity-40",
                          )}
                          aria-label={`${category.name} kategorisini yukari tasi`}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCategory(category.slug, "down")}
                          disabled={index === selectedCategories.length - 1}
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-stone-200 bg-white text-stone-600 transition-all hover:text-[#C54E00] disabled:cursor-not-allowed disabled:opacity-40",
                          )}
                          aria-label={`${category.name} kategorisini asagi tasi`}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-[24px] border border-dashed border-[#eadccd] bg-[#fdf8f3] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8f6c54]">
                  Eklenebilir kategoriler
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {availableCategories.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      onClick={() => toggleCategory(category.slug)}
                      disabled={featuredCategorySlugs.length >= MAX_HOMEPAGE_CATEGORIES}
                      className="inline-flex items-center gap-2 rounded-full border border-[#eadccd] bg-white px-4 py-2 text-sm font-medium text-[#5e4b3f] transition-all hover:border-[#FE6100]/24 hover:text-[#C54E00] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Star className="h-3.5 w-3.5" />
                      {category.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[30px] border border-[#FE6100]/10 bg-white shadow-[0_24px_70px_rgba(72,36,8,0.08)]">
            <div className="border-b border-[#FE6100]/8 px-6 py-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#2f241d]">
                    Yildizli urun havuzu
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[#7d6959]">
                    Homepage, secili kategoriler icin once ilgili kategoriye ait yildizli urunleri kullanir.
                    Aynı kategoride 4 urunden fazla yildizli urun varsa ilk 4 urun vitrinde gosterilir.
                  </p>
                </div>

                <div className="relative w-full lg:max-w-xs">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(event) => setProductSearch(event.target.value)}
                    placeholder="Ürün ara"
                    className="w-full rounded-2xl border border-stone-200 bg-[#fcfaf8] py-3 pl-11 pr-4 text-sm text-stone-900 outline-none transition-all focus:border-[#FE6100]/30 focus:bg-white focus:ring-4 focus:ring-[#FE6100]/12"
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-4 px-6 py-6 sm:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => {
                const categoryLabel =
                  categoryMap.get(product.category)?.name || product.category || "Kategorisiz";
                const isUpdating = updatingProductIds.includes(product.id);

                return (
                  <article
                    key={product.id}
                    className="rounded-[24px] border border-[#eadccd] bg-[#fffdfa] p-4 shadow-[0_10px_24px_rgba(99,67,37,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-[#2f241d]">
                          {product.name}
                        </p>
                        <p className="mt-1 text-sm text-[#7d6959]">{categoryLabel}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#9d8574]">
                          {product.slug}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void toggleProductFeatured(product)}
                        disabled={isUpdating}
                        className={cn(
                          "inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition-all",
                          product.featured
                            ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-stone-200 bg-white text-stone-500 hover:text-[#C54E00]",
                          isUpdating ? "cursor-wait opacity-70" : "",
                        )}
                        aria-label={`${product.name} urunu icin vitrin yildizini degistir`}
                      >
                        {isUpdating ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Star className={cn("h-4 w-4", product.featured ? "fill-current" : "")} />
                        )}
                      </button>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 font-medium",
                          product.featured
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-stone-200 bg-stone-100 text-stone-600",
                        )}
                      >
                        {product.featured ? "Vitrinde oncelikli" : "Normal"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 font-medium",
                          product.isActive && product.status !== "archived"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-rose-200 bg-rose-50 text-rose-700",
                        )}
                      >
                        {product.isActive && product.status !== "archived" ? "Aktif" : "Pasif"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
