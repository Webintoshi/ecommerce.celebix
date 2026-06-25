"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Filter,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import {
  PRODUCT_SEO_FAMILY_LABELS,
  PRODUCT_SEO_ROBOT_OPTIONS,
  normalizeProductSEOKeywords,
  type ProductSEORobots,
} from "@/lib/product-seo";
import type {
  ProductApiResponse,
  ProductSEOViewModel,
  ProductWithSEO,
} from "@/types/product-seo";
import { toProductSEOViewModel } from "@/types/product-seo";

type ProductFilter = "all" | "active" | "weak" | "missing";

interface ProductSEODraft {
  metaTitle: string;
  metaDescription: string;
  seoKeywords: string[];
  seoFocusKeyword: string;
  canonicalUrl: string;
  seoRobots: ProductSEORobots;
  ogImage: string;
}

interface MessageState {
  type: "success" | "error";
  text: string;
}

interface DisplayProduct {
  base: ProductSEOViewModel;
  current: ProductSEOViewModel;
  pending: boolean;
}

const WEAK_SCORE_THRESHOLD = 80;

function normalizeProductRecord(product: ProductWithSEO): ProductWithSEO {
  return {
    ...product,
    images: Array.isArray(product.images) ? product.images : [],
    variants: Array.isArray(product.variants) ? product.variants : [],
    tags: Array.isArray(product.tags) ? product.tags : [],
    seo_keywords: Array.isArray(product.seo_keywords) ? product.seo_keywords : [],
    faq: Array.isArray(product.faq) ? product.faq : [],
    geo_data: product.geo_data || { keyTakeaways: [], entities: [] },
    seo_focus_keyword: product.seo_focus_keyword || null,
    canonical_url: product.canonical_url || null,
    seo_robots: product.seo_robots || null,
    og_image: product.og_image || null,
  };
}

function createDraft(product: ProductSEOViewModel): ProductSEODraft {
  return {
    metaTitle: product.metaTitle,
    metaDescription: product.metaDescription,
    seoKeywords: [...product.seoKeywords],
    seoFocusKeyword: product.seoFocusKeyword,
    canonicalUrl: product.canonicalUrl || "",
    seoRobots: product.seoRobots,
    ogImage: product.ogImage || "",
  };
}

function draftsEqual(left: ProductSEODraft, right: ProductSEODraft) {
  return (
    left.metaTitle === right.metaTitle &&
    left.metaDescription === right.metaDescription &&
    left.seoFocusKeyword === right.seoFocusKeyword &&
    left.canonicalUrl === right.canonicalUrl &&
    left.seoRobots === right.seoRobots &&
    left.ogImage === right.ogImage &&
    left.seoKeywords.length === right.seoKeywords.length &&
    left.seoKeywords.every((keyword, index) => keyword === right.seoKeywords[index])
  );
}

function applyDraft(
  base: ProductSEOViewModel,
  draft: ProductSEODraft | undefined,
): ProductSEOViewModel {
  if (!draft) {
    return base;
  }

  return toProductSEOViewModel(
    normalizeProductRecord({
      ...base,
      seo_title: draft.metaTitle || null,
      seo_description: draft.metaDescription || null,
      seo_keywords: draft.seoKeywords,
      seo_focus_keyword: draft.seoFocusKeyword || null,
      canonical_url: draft.canonicalUrl || null,
      seo_robots: draft.seoRobots,
      og_image: draft.ogImage || null,
    }),
  );
}

function buildDisplayProducts(
  products: ProductSEOViewModel[],
  drafts: Record<string, ProductSEODraft>,
): DisplayProduct[] {
  return products.map((base) => {
    const draft = drafts[base.id];
    const current = applyDraft(base, draft);

    return {
      base,
      current,
      pending: draft ? !draftsEqual(draft, createDraft(base)) : false,
    };
  });
}

function productMatchesSearch(product: ProductSEOViewModel, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    product.name,
    product.slug,
    product.category,
    product.subcategory,
    product.metaTitle,
    product.metaDescription,
    product.seoFocusKeyword,
    product.seoKeywords.join(" "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("tr");

  return haystack.includes(query.toLocaleLowerCase("tr"));
}

function productMatchesFilter(product: ProductSEOViewModel, filter: ProductFilter) {
  if (filter === "active") {
    return product.is_active;
  }

  if (filter === "weak") {
    return product.score < WEAK_SCORE_THRESHOLD;
  }

  if (filter === "missing") {
    return (
      !product.seoAudit.summary.titlePresent ||
      !product.seoAudit.summary.descriptionPresent ||
      !product.seoAudit.summary.focusKeywordPresent
    );
  }

  return true;
}

function buildSuggestionDraft(
  current: ProductSEOViewModel,
  seedDraft: ProductSEODraft,
): ProductSEODraft {
  return {
    metaTitle: current.seoSuggestion.metaTitle,
    metaDescription: current.seoSuggestion.metaDescription,
    seoKeywords: [...current.seoSuggestion.keywords],
    seoFocusKeyword: current.seoSuggestion.focusKeyword,
    canonicalUrl: seedDraft.canonicalUrl,
    seoRobots: current.seoAudit.summary.robotsCustom
      ? seedDraft.seoRobots
      : current.seoSuggestion.robots,
    ogImage: seedDraft.ogImage || current.seoSuggestion.ogImage || "",
  };
}

async function fetchProducts(): Promise<ProductWithSEO[]> {
  const response = await fetch("/api/products?all=true", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as ProductApiResponse;

  if (!data.success) {
    throw new Error(data.error || "Products could not be loaded");
  }

  return (data.products || []).map(normalizeProductRecord);
}

async function updateProductSEO(
  productId: string,
  productSlug: string,
  draft: ProductSEODraft,
): Promise<ProductWithSEO> {
  const payload = {
    id: productId,
    seo_title: draft.metaTitle,
    seo_description: draft.metaDescription,
    seo_keywords: draft.seoKeywords,
    seo_focus_keyword: draft.seoFocusKeyword || null,
    canonical_url: draft.canonicalUrl || null,
    seo_robots: draft.seoRobots,
    og_image: draft.ogImage || null,
  };

  const response = await fetch("/api/products", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as ProductApiResponse;

  if (!response.ok || !data.success || !data.product) {
    throw new Error(data.error || "Product SEO could not be saved");
  }

  try {
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: `/urunler/${productSlug}` }),
    });
  } catch {
    console.warn("Product revalidation failed");
  }

  return normalizeProductRecord(data.product);
}

export default function ProductSEOPage() {
  const [products, setProducts] = useState<ProductSEOViewModel[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ProductSEODraft>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState<ProductFilter>("all");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<MessageState | null>(null);

  async function loadProducts(showSpinner = true) {
    if (showSpinner) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setMessage(null);

    try {
      const rawProducts = await fetchProducts();
      setProducts(rawProducts.map((product) => toProductSEOViewModel(product)));
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Product SEO paneli yuklenemedi.",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadProducts(true);
  }, []);

  const displayProducts = buildDisplayProducts(products, drafts);
  const filteredProducts = displayProducts.filter(
    ({ current }) =>
      productMatchesSearch(current, query) && productMatchesFilter(current, filter),
  );
  const activeVisibleProducts = filteredProducts.filter(
    ({ current }) => current.is_active,
  );
  const pendingVisibleActiveProducts = activeVisibleProducts.filter(
    ({ pending }) => pending,
  );
  const activeCount = displayProducts.filter(({ current }) => current.is_active).length;
  const weakCount = displayProducts.filter(
    ({ current }) => current.score < WEAK_SCORE_THRESHOLD,
  ).length;
  const missingCount = displayProducts.filter(
    ({ current }) =>
      !current.seoAudit.summary.titlePresent ||
      !current.seoAudit.summary.descriptionPresent ||
      !current.seoAudit.summary.focusKeywordPresent,
  ).length;
  const pendingCount = displayProducts.filter(({ pending }) => pending).length;

  function updateDraftForProduct(
    base: ProductSEOViewModel,
    updater: (draft: ProductSEODraft) => ProductSEODraft,
  ) {
    setDrafts((previous) => {
      const baseDraft = createDraft(base);
      const currentDraft = previous[base.id] || baseDraft;
      const nextDraft = updater(currentDraft);

      if (draftsEqual(nextDraft, baseDraft)) {
        const nextState = { ...previous };
        delete nextState[base.id];
        return nextState;
      }

      return {
        ...previous,
        [base.id]: nextDraft,
      };
    });
  }

  function resetDraft(productId: string) {
    setDrafts((previous) => {
      const nextState = { ...previous };
      delete nextState[productId];
      return nextState;
    });
  }

  function applySuggestion(base: ProductSEOViewModel, current: ProductSEOViewModel) {
    updateDraftForProduct(base, (draft) => buildSuggestionDraft(current, draft));
  }

  function applyBulkSuggestions() {
    if (activeVisibleProducts.length === 0) {
      setMessage({
        type: "error",
        text: "Oneri uygulanacak aktif urun bulunamadi.",
      });
      return;
    }

    setDrafts((previous) => {
      const nextState = { ...previous };

      for (const item of activeVisibleProducts) {
        const baseDraft = previous[item.base.id] || createDraft(item.base);
        const nextDraft = buildSuggestionDraft(item.current, baseDraft);

        if (draftsEqual(nextDraft, createDraft(item.base))) {
          delete nextState[item.base.id];
        } else {
          nextState[item.base.id] = nextDraft;
        }
      }

      return nextState;
    });

    setMessage({
      type: "success",
      text: `${activeVisibleProducts.length} aktif urun icin deterministik SEO onerileri hazirlandi.`,
    });
  }

  async function saveSingleProduct(base: ProductSEOViewModel) {
    const draft = drafts[base.id];

    if (!draft) {
      setMessage({
        type: "error",
        text: "Kaydedilecek bir degisiklik bulunamadi.",
      });
      return;
    }

    setSavingIds((previous) => ({ ...previous, [base.id]: true }));
    setMessage(null);

    try {
      const updated = await updateProductSEO(base.id, base.slug, draft);

      setProducts((previous) =>
        previous.map((product) =>
          product.id === base.id ? toProductSEOViewModel(updated) : product,
        ),
      );

      resetDraft(base.id);
      setMessage({
        type: "success",
        text: `${base.name} icin SEO kaydi guncellendi.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Ürün SEO kaydi guncellenemedi.",
      });
    } finally {
      setSavingIds((previous) => {
        const nextState = { ...previous };
        delete nextState[base.id];
        return nextState;
      });
    }
  }

  async function saveBulkProducts() {
    if (pendingVisibleActiveProducts.length === 0) {
      setMessage({
        type: "error",
        text: "Kaydedilecek aktif taslak bulunamadi.",
      });
      return;
    }

    setBulkSaving(true);
    setMessage(null);

    const updatedProducts = new Map<string, ProductSEOViewModel>();
    const savedIds: string[] = [];
    const failedProducts: string[] = [];

    for (const item of pendingVisibleActiveProducts) {
      const draft = drafts[item.base.id];

      if (!draft) {
        continue;
      }

      try {
        const updated = await updateProductSEO(
          item.base.id,
          item.base.slug,
          draft,
        );

        updatedProducts.set(item.base.id, toProductSEOViewModel(updated));
        savedIds.push(item.base.id);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Kayit basarisiz";
        failedProducts.push(`${item.base.name}: ${reason}`);
      }
    }

    if (updatedProducts.size > 0) {
      setProducts((previous) =>
        previous.map((product) => updatedProducts.get(product.id) || product),
      );
    }

    if (savedIds.length > 0) {
      setDrafts((previous) => {
        const nextState = { ...previous };
        for (const savedId of savedIds) {
          delete nextState[savedId];
        }
        return nextState;
      });
    }

    setBulkSaving(false);

    if (failedProducts.length > 0) {
      setMessage({
        type: "error",
        text:
          `${savedIds.length} urun kaydedildi. ` +
          `${failedProducts.length} urun hata verdi: ${failedProducts.join(" | ")}`,
      });
      return;
    }

    setMessage({
      type: "success",
      text: `${savedIds.length} aktif urun SEO kaydi toplu olarak guncellendi.`,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Package className="h-7 w-7 text-primary" />
            Ürün SEO Kontrol Paneli
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Ürün bazinda meta alanlarini yonetin, zayif veya eksik SEO
            kayitlarini filtreleyin, sonra aktif urunler icin aile bazli
            deterministik onerileri topluca uygulayin.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`flex items-start gap-3 rounded-2xl border p-4 ${
            message.type === "success"
              ? "border-emerald-100 bg-emerald-50 text-emerald-700"
              : "border-rose-100 bg-rose-50 text-rose-700"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          )}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <section className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Toplam urun" value={displayProducts.length} />
          <SummaryCard label="Aktif urun" value={activeCount} />
          <SummaryCard label="Zayif SEO" value={weakCount} tone="warning" />
          <SummaryCard label="Core SEO eksik" value={missingCount} tone="warning" />
          <SummaryCard label="Bekleyen degisiklik" value={pendingCount} tone="info" />
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ürün adi, slug, focus keyword veya meta alani ara"
              className="w-full rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
            />
          </div>

          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as ProductFilter)}
              className="w-full appearance-none rounded-2xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
            >
              <option value="all">Tum urunler</option>
              <option value="active">Sadece aktif</option>
              <option value="weak">Zayif SEO</option>
              <option value="missing">Baslik / aciklama / focus eksik</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => void loadProducts(false)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Yenile
          </button>

          <div className="flex items-center justify-end rounded-2xl border border-gray-100 bg-gray-50 px-4 text-sm text-gray-500">
            Gorunen: {filteredProducts.length}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={applyBulkSuggestions}
            disabled={activeVisibleProducts.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Aktif gorunen urunlere onerileri uygula
          </button>

          <button
            type="button"
            onClick={() => void saveBulkProducts()}
            disabled={bulkSaving || pendingVisibleActiveProducts.length === 0}
            className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bulkSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Aktif gorunen taslaklari kaydet
          </button>

          <div className="text-sm text-gray-500">
            {activeVisibleProducts.length} aktif urun,{" "}
            {pendingVisibleActiveProducts.length} kayda hazir taslak
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-gray-200 bg-white">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="ml-3 text-sm text-gray-500">
            Ürün SEO verileri yukleniyor...
          </span>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <p className="text-sm text-gray-500">
            Secili filtre icin gosterilecek urun bulunamadi.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredProducts.map(({ base, current, pending }) => {
            const saving = Boolean(savingIds[base.id]) || bulkSaving;
            const summary = current.seoAudit.summary;
            const keywordCoverage = current.seoAudit.keywordCoverage;

            return (
              <article
                key={base.id}
                className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="border-b border-gray-100 px-5 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex gap-4">
                      {current.images[0] ? (
                        <img
                          src={current.images[0]}
                          alt={current.name}
                          className="h-20 w-20 rounded-2xl object-cover"
                        />
                      ) : (
                        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100">
                          <Package className="h-7 w-7 text-gray-400" />
                        </div>
                      )}

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-gray-900">
                            {current.name}
                          </h2>
                          <Pill tone={current.is_active ? "success" : "muted"}>
                            {current.is_active ? "Aktif" : "Pasif"}
                          </Pill>
                          <Pill tone="info">
                            {PRODUCT_SEO_FAMILY_LABELS[current.family]}
                          </Pill>
                          <Pill
                            tone={
                              current.score >= 85
                                ? "success"
                                : current.score >= WEAK_SCORE_THRESHOLD
                                  ? "warning"
                                  : "danger"
                            }
                          >
                            SEO {current.score}/100
                          </Pill>
                          {pending && <Pill tone="warning">Taslak degisiklik var</Pill>}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                          <span>/urunler/{current.slug}</span>
                          <a
                            href={current.effectiveCanonicalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary transition hover:text-primary/80"
                          >
                            Onizleme
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <StatusChip label="Title" active={summary.titlePresent} />
                          <StatusChip
                            label="Description"
                            active={summary.descriptionPresent}
                          />
                          <StatusChip
                            label="Focus keyword"
                            active={summary.focusKeywordPresent}
                          />
                          <StatusChip
                            label="Canonical override"
                            active={summary.canonicalOverridePresent}
                          />
                          <StatusChip
                            label="Robots custom"
                            active={summary.robotsCustom}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                      <div className="font-medium text-gray-900">
                        Keyword coverage
                      </div>
                      <div className="mt-1">
                        {keywordCoverage.covered.length}/{current.seoKeywords.length} eslesme
                      </div>
                      {keywordCoverage.missing.length > 0 && (
                        <div className="mt-1 text-xs text-amber-700">
                          Eksik: {keywordCoverage.missing.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>

                  {current.issues.length > 0 && (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      {current.issues.map((issue) => (
                        <div
                          key={issue.code}
                          className={`rounded-2xl border px-3 py-2 text-sm ${
                            issue.severity === "error"
                              ? "border-rose-100 bg-rose-50 text-rose-700"
                              : "border-amber-100 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {issue.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-6 px-5 py-5 xl:grid-cols-[minmax(0,1.4fr)_340px]">
                  <div className="grid gap-4 md:grid-cols-2">
                    <FieldBlock
                      label={`Meta title (${current.seoAudit.titleLength}/60)`}
                      hint={current.seoSuggestion.metaTitle}
                    >
                      <input
                        type="text"
                        value={
                          drafts[base.id]?.metaTitle !== undefined
                            ? drafts[base.id].metaTitle
                            : current.metaTitle
                        }
                        onChange={(event) =>
                          updateDraftForProduct(base, (draft) => ({
                            ...draft,
                            metaTitle: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
                        placeholder={current.seoSuggestion.metaTitle}
                      />
                    </FieldBlock>

                    <FieldBlock
                      label="Focus keyword"
                      hint={current.seoSuggestion.focusKeyword}
                    >
                      <input
                        type="text"
                        value={
                          drafts[base.id]?.seoFocusKeyword !== undefined
                            ? drafts[base.id].seoFocusKeyword
                            : current.seoFocusKeyword
                        }
                        onChange={(event) =>
                          updateDraftForProduct(base, (draft) => ({
                            ...draft,
                            seoFocusKeyword: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
                        placeholder={current.seoSuggestion.focusKeyword}
                      />
                    </FieldBlock>

                    <FieldBlock
                      label={`Meta description (${current.seoAudit.descriptionLength}/160)`}
                      hint={current.seoSuggestion.metaDescription}
                      className="md:col-span-2"
                    >
                      <textarea
                        rows={4}
                        value={
                          drafts[base.id]?.metaDescription !== undefined
                            ? drafts[base.id].metaDescription
                            : current.metaDescription
                        }
                        onChange={(event) =>
                          updateDraftForProduct(base, (draft) => ({
                            ...draft,
                            metaDescription: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
                        placeholder={current.seoSuggestion.metaDescription}
                      />
                    </FieldBlock>

                    <FieldBlock
                      label="SEO keywords"
                      hint="Virgul ile ayirin. Coverage title ve description uzerinden hesaplanir."
                    >
                      <input
                        type="text"
                        value={(drafts[base.id]?.seoKeywords || current.seoKeywords).join(", ")}
                        onChange={(event) =>
                          updateDraftForProduct(base, (draft) => ({
                            ...draft,
                            seoKeywords: normalizeProductSEOKeywords(
                              event.target.value,
                            ),
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
                        placeholder={current.seoSuggestion.keywords.join(", ")}
                      />
                    </FieldBlock>

                    <FieldBlock
                      label="Canonical override"
                      hint={`Bos birakilirsa varsayilan: ${current.seoAudit.defaultCanonicalUrl}`}
                    >
                      <input
                        type="url"
                        value={
                          drafts[base.id]?.canonicalUrl !== undefined
                            ? drafts[base.id].canonicalUrl
                            : current.canonicalUrl || ""
                        }
                        onChange={(event) =>
                          updateDraftForProduct(base, (draft) => ({
                            ...draft,
                            canonicalUrl: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
                        placeholder={current.seoAudit.defaultCanonicalUrl}
                      />
                    </FieldBlock>

                    <FieldBlock label="Robots">
                      <select
                        value={
                          drafts[base.id]?.seoRobots !== undefined
                            ? drafts[base.id].seoRobots
                            : current.seoRobots
                        }
                        onChange={(event) =>
                          updateDraftForProduct(base, (draft) => ({
                            ...draft,
                            seoRobots: event.target.value as ProductSEORobots,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
                      >
                        {PRODUCT_SEO_ROBOT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </FieldBlock>

                    <FieldBlock
                      label="OG image"
                      hint="Bos kalirsa ilk urun gorseli kullanilabilir."
                      className="md:col-span-2"
                    >
                      <input
                        type="url"
                        value={
                          drafts[base.id]?.ogImage !== undefined
                            ? drafts[base.id].ogImage
                            : current.ogImage || ""
                        }
                        onChange={(event) =>
                          updateDraftForProduct(base, (draft) => ({
                            ...draft,
                            ogImage: event.target.value,
                          }))
                        }
                        className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/10"
                        placeholder={current.seoSuggestion.ogImage || current.images[0] || ""}
                      />
                    </FieldBlock>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
                      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        Google Preview
                      </div>
                      <div className="space-y-1">
                        <div className="line-clamp-2 text-lg font-medium text-blue-700">
                          {current.effectiveMetaTitle}
                        </div>
                        <div className="truncate text-xs text-emerald-700">
                          {current.effectiveCanonicalUrl}
                        </div>
                        <p className="line-clamp-3 text-sm text-gray-600">
                          {current.effectiveMetaDescription}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-3xl border border-gray-200 bg-white p-4">
                      <div className="mb-3 text-sm font-semibold text-gray-900">
                        Kontrol ozeti
                      </div>
                      <dl className="space-y-2 text-sm text-gray-600">
                        <div className="flex items-center justify-between gap-3">
                          <dt>Varsayilan canonical</dt>
                          <dd className="truncate text-right text-gray-900">
                            {current.seoAudit.defaultCanonicalUrl}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>Efektif canonical</dt>
                          <dd className="truncate text-right text-gray-900">
                            {current.seoAudit.effectiveCanonicalUrl}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>Title length</dt>
                          <dd className="text-gray-900">
                            {current.seoAudit.titleLength}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>Description length</dt>
                          <dd className="text-gray-900">
                            {current.seoAudit.descriptionLength}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <dt>OG image</dt>
                          <dd className="text-gray-900">
                            {current.seoAudit.summary.ogImagePresent ? "Hazir" : "Eksik"}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-gray-500">
                    {pending
                      ? "Bu urunde kaydedilmemis SEO degisikligi var."
                      : "Kayitli SEO verisi ile ekran senkron."}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => applySuggestion(base, current)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Sparkles className="h-4 w-4" />
                      Oneriyi uygula
                    </button>

                    <button
                      type="button"
                      onClick={() => resetDraft(base.id)}
                      disabled={!pending}
                      className="rounded-2xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Taslagi sifirla
                    </button>

                    <button
                      type="button"
                      onClick={() => void saveSingleProduct(base)}
                      disabled={!pending || saving}
                      className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Kaydet
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "warning" | "info";
}) {
  const className =
    tone === "warning"
      ? "border-amber-100 bg-amber-50 text-amber-700"
      : tone === "info"
        ? "border-blue-100 bg-blue-50 text-blue-700"
        : "border-gray-100 bg-gray-50 text-gray-700";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${className}`}>
      <div className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </div>
  );
}

function FieldBlock({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "info" | "muted";
  children: ReactNode;
}) {
  const className =
    tone === "success"
      ? "bg-emerald-100 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-100 text-amber-700"
        : tone === "danger"
          ? "bg-rose-100 text-rose-700"
          : tone === "info"
            ? "bg-blue-100 text-blue-700"
            : "bg-gray-100 text-gray-600";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

function StatusChip({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        active
          ? "bg-emerald-100 text-emerald-700"
          : "bg-gray-100 text-gray-500"
      }`}
    >
      {label}
    </span>
  );
}
