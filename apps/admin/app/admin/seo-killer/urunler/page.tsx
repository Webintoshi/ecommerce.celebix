"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ExternalLink,
  Eye,
  Filter,
  Globe,
  ImageIcon,
  Link2,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tag,
} from "lucide-react";
import { STORE_RUNTIME } from "@/lib/store-runtime";
import type {
  ProductApiResponse,
  ProductSEOViewModel,
  ProductWithSEO,
} from "@/types/product-seo";
import { toProductSEOViewModel } from "@/types/product-seo";

type SeoFilter = "all" | "weak" | "missing" | "healthy";
type BulkMode = "all" | "weak" | "missing";

interface EditFormState {
  metaTitle: string;
  metaDescription: string;
  focusKeyword: string;
  keywordsText: string;
  canonicalUrl: string;
  robots: ProductSEOViewModel["robots"];
  ogImage: string;
}

interface MessageState {
  type: "success" | "error";
  text: string;
}

const EMPTY_FORM_STATE: EditFormState = {
  metaTitle: "",
  metaDescription: "",
  focusKeyword: "",
  keywordsText: "",
  canonicalUrl: "",
  robots: "index,follow",
  ogImage: "",
};

const FILTER_LABELS: Record<SeoFilter, string> = {
  all: "Tüm ürünler",
  weak: "Zayıf SEO",
  missing: "Kritik eksik",
  healthy: "Sağlıklı",
};

const BULK_BUTTONS: Array<{
  mode: BulkMode;
  label: string;
  description: string;
}> = [
  {
    mode: "missing",
    label: "Eksikleri Doldur",
    description: "Focus keyword, title, description veya keyword eksiği olan aktif ürünleri tamamlar.",
  },
  {
    mode: "weak",
    label: "Zayıfları Güçlendir",
    description: "Skoru düşük aktif ürünlerde title, description, focus ve robots alanlarını yeniden yazar.",
  },
  {
    mode: "all",
    label: "Tüm Aktiflere Uygula",
    description: "Tüm aktif katalogda kural bazlı SEO backfill çalıştırır.",
  },
];

function normalizeProductRecord(raw: any): ProductWithSEO {
  return {
    ...raw,
    images: Array.isArray(raw?.images) ? raw.images : [],
    variants: Array.isArray(raw?.variants) ? raw.variants : [],
    tags: Array.isArray(raw?.tags) ? raw.tags : [],
    seo_keywords: Array.isArray(raw?.seo_keywords) ? raw.seo_keywords : [],
    faq: Array.isArray(raw?.faq) ? raw.faq : [],
    geo_data:
      raw?.geo_data && typeof raw.geo_data === "object"
        ? raw.geo_data
        : { keyTakeaways: [], entities: [] },
  };
}

function parseKeywordsInput(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\n,;]+/g)
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
}

function serializeKeywords(value: string[]) {
  return value.join(", ");
}

async function fetchProducts(): Promise<ProductWithSEO[]> {
  const response = await fetch("/api/products?all=true&limit=250", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as ProductApiResponse;

  if (!data.success) {
    throw new Error(data.error || "Ürünler alınamadı.");
  }

  return (data.products || []).map((product) => normalizeProductRecord(product));
}

async function updateProduct(
  productId: string,
  slug: string,
  formState: EditFormState,
): Promise<ProductWithSEO> {
  const response = await fetch("/api/products", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: productId,
      seo_title: formState.metaTitle,
      seo_description: formState.metaDescription,
      seo_keywords: parseKeywordsInput(formState.keywordsText),
      seo_focus_keyword: formState.focusKeyword.trim() || null,
      canonical_url: formState.canonicalUrl.trim() || null,
      seo_robots: formState.robots,
      og_image: formState.ogImage.trim() || null,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.success || !data.product) {
    throw new Error(data.error || "Ürün SEO kaydı başarısız.");
  }

  try {
    await fetch("/api/revalidate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: `/urunler/${slug}` }),
    });
  } catch {
    // Dynamic metadata already reads the latest product row.
  }

  return normalizeProductRecord(data.product);
}

async function runBulkSeo(mode: BulkMode) {
  const response = await fetch("/api/admin/products/seo-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, activeOnly: true }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Toplu SEO işlemi tamamlanamadı.");
  }

  return data as { updated: number; skipped: number; mode: BulkMode };
}

async function generateMetaWithAI(product: ProductSEOViewModel) {
  const response = await fetch("/api/seo/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: product.name,
      description: product.description || product.short_description || "",
      category: product.category,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "AI meta üretimi başarısız.");
  }

  return {
    metaTitle: String(data.metaTitle || ""),
    metaDescription: String(data.metaDescription || ""),
  };
}

function scoreTone(score: number) {
  if (score >= 85) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (score >= 65) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-rose-100 text-rose-700";
}

function summaryTone(ok: boolean) {
  return ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-rose-200 bg-rose-50 text-rose-700";
}

function ProductSummaryPill({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${summaryTone(ok)}`}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}: {value}
    </span>
  );
}

function FieldLabel({
  label,
  hint,
}: {
  label: string;
  hint?: string;
}) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <label className="text-sm font-semibold text-stone-800">{label}</label>
      {hint ? <span className="text-xs text-stone-500">{hint}</span> : null}
    </div>
  );
}

export default function ProductSEOPage() {
  const storeHost = STORE_RUNTIME.storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const [products, setProducts] = useState<ProductSEOViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_FORM_STATE);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState<BulkMode | null>(null);
  const [aiGeneratingId, setAiGeneratingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [seoFilter, setSeoFilter] = useState<SeoFilter>("weak");
  const [activeOnly, setActiveOnly] = useState(true);
  const deferredSearch = useDeferredValue(searchQuery);

  async function loadProducts() {
    setLoading(true);
    setMessage(null);

    try {
      const data = await fetchProducts();
      setProducts(data.map((product) => toProductSEOViewModel(product)));
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ürün SEO listesi yüklenemedi.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLocaleLowerCase("tr-TR");

    return products.filter((product) => {
      if (activeOnly && !product.is_active) {
        return false;
      }

      if (normalizedSearch) {
        const haystack = [
          product.name,
          product.slug,
          product.category,
          product.metaTitle,
          product.metaDescription,
          product.focusKeyword,
        ]
          .join(" ")
          .toLocaleLowerCase("tr-TR");

        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (seoFilter === "missing") {
        return !product.hasTitle || !product.hasDescription || !product.hasFocusKeyword || !product.hasKeywords;
      }

      if (seoFilter === "weak") {
        return product.score < 80;
      }

      if (seoFilter === "healthy") {
        return product.score >= 80;
      }

      return true;
    });
  }, [activeOnly, deferredSearch, products, seoFilter]);

  const summary = useMemo(() => {
    const baseProducts = activeOnly ? products.filter((product) => product.is_active) : products;

    return {
      total: baseProducts.length,
      weak: baseProducts.filter((product) => product.score < 80).length,
      missing: baseProducts.filter(
        (product) => !product.hasTitle || !product.hasDescription || !product.hasFocusKeyword || !product.hasKeywords,
      ).length,
      healthy: baseProducts.filter((product) => product.score >= 80).length,
    };
  }, [activeOnly, products]);

  function handleEdit(product: ProductSEOViewModel) {
    setEditingId(product.id);
    setEditForm({
      metaTitle: product.metaTitle,
      metaDescription: product.metaDescription,
      focusKeyword: product.focusKeyword,
      keywordsText: serializeKeywords(product.keywords),
      canonicalUrl: product.canonicalUrl,
      robots: product.robots,
      ogImage: product.ogImage,
    });
    setMessage(null);
  }

  function handleCancel() {
    setEditingId(null);
    setEditForm(EMPTY_FORM_STATE);
  }

  function applyRecommendation(product: ProductSEOViewModel) {
    setEditForm((prev) => ({
      ...prev,
      metaTitle: product.recommendation.title,
      metaDescription: product.recommendation.description,
      focusKeyword: product.recommendation.focusKeyword,
      keywordsText: serializeKeywords(product.recommendation.keywords),
      canonicalUrl: product.recommendation.canonicalUrl || "",
      robots: product.recommendation.robots,
      ogImage: product.recommendation.ogImage || "",
    }));
  }

  async function handleSave(product: ProductSEOViewModel) {
    setSavingId(product.id);
    setMessage(null);

    try {
      const updated = await updateProduct(product.id, product.slug, editForm);
      const nextProduct = toProductSEOViewModel(updated);

      setProducts((current) =>
        current.map((entry) => (entry.id === product.id ? nextProduct : entry)),
      );
      setEditingId(null);
      setEditForm(EMPTY_FORM_STATE);
      setMessage({
        type: "success",
        text: `${product.name} için ürün SEO alanları kaydedildi.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Ürün SEO kaydı başarısız oldu.",
      });
    } finally {
      setSavingId(null);
    }
  }

  async function handleBulk(mode: BulkMode) {
    setBulkRunning(mode);
    setMessage(null);

    try {
      const result = await runBulkSeo(mode);
      await loadProducts();
      setMessage({
        type: "success",
        text: `${result.updated} aktif ürünün SEO alanı güncellendi. ${result.skipped} ürün atlandı.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Toplu SEO işlemi başarısız oldu.",
      });
    } finally {
      setBulkRunning(null);
    }
  }

  async function handleAiGeneration(product: ProductSEOViewModel) {
    setAiGeneratingId(product.id);
    setMessage(null);

    try {
      const generated = await generateMetaWithAI(product);
      setEditForm((prev) => ({
        ...prev,
        metaTitle: generated.metaTitle,
        metaDescription: generated.metaDescription,
      }));
      setMessage({
        type: "success",
        text: `${product.name} için AI meta önerisi hazırlandı.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "AI meta üretimi başarısız oldu.",
      });
    } finally {
      setAiGeneratingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/seo-killer" className="mb-2 inline-flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-4 w-4" />
          SEO Merkezi
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-stone-950">
          <Package className="h-7 w-7 text-orange-600" />
          Ürün SEO Yönetimi
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          DeryCraft katalogundaki ürünlerde title, description, focus keyword, canonical, robots ve OG alanlarını tek panelden yönetin.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-stone-500">Aktif Katalog</div>
          <div className="mt-2 text-3xl font-bold text-stone-950">{summary.total}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-amber-700">Zayıf SEO</div>
          <div className="mt-2 text-3xl font-bold text-amber-800">{summary.weak}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-rose-700">Kritik Eksik</div>
          <div className="mt-2 text-3xl font-bold text-rose-800">{summary.missing}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-emerald-700">Sağlıklı</div>
          <div className="mt-2 text-3xl font-bold text-emerald-800">{summary.healthy}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Ürün, slug, kategori veya focus keyword ara"
                className="w-full rounded-2xl border border-stone-200 bg-stone-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
              />
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3">
              <Filter className="h-4 w-4 text-stone-500" />
              <select
                value={seoFilter}
                onChange={(event) => setSeoFilter(event.target.value as SeoFilter)}
                className="h-11 bg-transparent text-sm text-stone-700 outline-none"
              >
                {Object.entries(FILTER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <label className="inline-flex items-center gap-2 rounded-2xl border border-stone-200 bg-stone-50 px-3 text-sm text-stone-700">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(event) => setActiveOnly(event.target.checked)}
                className="h-4 w-4 rounded border-stone-300 text-orange-600 focus:ring-orange-200"
              />
              Sadece aktif ürünler
            </label>
          </div>
          <button
            type="button"
            onClick={() => void loadProducts()}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-stone-200 px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Yenile
          </button>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {BULK_BUTTONS.map((button) => (
            <button
              key={button.mode}
              type="button"
              onClick={() => void handleBulk(button.mode)}
              disabled={bulkRunning !== null}
              className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-left transition hover:border-orange-300 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                <Sparkles className="h-4 w-4 text-orange-600" />
                {button.label}
                {bulkRunning === button.mode ? <Loader2 className="h-4 w-4 animate-spin text-orange-600" /> : null}
              </div>
              <p className="mt-2 text-sm text-stone-500">{button.description}</p>
            </button>
          ))}
        </div>
      </div>

      {message ? (
        <div
          className={`flex items-center gap-3 rounded-2xl border p-4 text-sm ${
            message.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          )}
          {message.text}
        </div>
      ) : null}

      <div className="text-sm text-stone-500">
        {filteredProducts.length} ürün gösteriliyor. Filter: <span className="font-medium text-stone-700">{FILTER_LABELS[seoFilter]}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-stone-200 bg-white py-20 text-stone-500">
          <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
          Ürün SEO listesi yükleniyor...
        </div>
      ) : null}

      {!loading && filteredProducts.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
          Seçili filtrede ürün bulunamadı.
        </div>
      ) : null}

      {!loading &&
        filteredProducts.map((product) => {
          const isEditing = editingId === product.id;
          const previewTitle = isEditing ? editForm.metaTitle : product.metaTitle;
          const previewDescription = isEditing ? editForm.metaDescription : product.metaDescription;
          const currentRobots = isEditing ? editForm.robots : product.robots;

          return (
            <div key={product.id} className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
              <div className="border-b border-stone-100 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-4">
                    {product.images[0] ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="h-20 w-20 rounded-2xl border border-stone-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50">
                        <Package className="h-8 w-8 text-stone-400" />
                      </div>
                    )}
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold text-stone-950">{product.name}</h2>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${scoreTone(product.score)}`}>
                          SEO {product.score}/100
                        </span>
                        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-600">
                          {product.family}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            product.is_active ? "bg-emerald-100 text-emerald-700" : "bg-stone-200 text-stone-600"
                          }`}
                        >
                          {product.is_active ? "Aktif" : "Pasif"}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-stone-500">/tr/urunler/{product.slug}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ProductSummaryPill label="Title" value={product.hasTitle ? "Var" : "Yok"} ok={product.hasTitle} />
                        <ProductSummaryPill label="Description" value={product.hasDescription ? "Var" : "Yok"} ok={product.hasDescription} />
                        <ProductSummaryPill label="Focus" value={product.hasFocusKeyword ? "Var" : "Yok"} ok={product.hasFocusKeyword} />
                        <ProductSummaryPill label="Canonical" value={product.hasCanonicalOverride ? "Override" : "Varsayılan"} ok />
                        <ProductSummaryPill label="Robots" value={currentRobots} ok={product.hasValidRobots} />
                        <ProductSummaryPill label="OG" value={product.hasOgImage ? "Var" : "Yok"} ok={product.hasOgImage} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`${STORE_RUNTIME.storefrontUrl.replace(/\/$/, "")}/tr/urunler/${product.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center rounded-2xl border border-stone-200 px-3 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Ürünü Aç
                    </a>
                    {!isEditing ? (
                      <button
                        type="button"
                        onClick={() => handleEdit(product)}
                        className="inline-flex h-10 items-center rounded-2xl bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700"
                      >
                        Düzenle
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="inline-flex h-10 items-center rounded-2xl border border-stone-200 px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50"
                      >
                        Kapat
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  {product.issues.length > 0 ? (
                    product.issues.slice(0, 4).map((issue) => (
                      <span
                        key={issue}
                        className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700"
                      >
                        {issue}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Kritik SEO sorunu yok
                    </span>
                  )}
                </div>

                {isEditing ? (
                  <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                    <div className="space-y-5">
                      <div className="grid gap-5 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <FieldLabel label="Meta Title" hint={`${editForm.metaTitle.length}/70`} />
                          <input
                            type="text"
                            value={editForm.metaTitle}
                            onChange={(event) => setEditForm((prev) => ({ ...prev, metaTitle: event.target.value }))}
                            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <FieldLabel label="Meta Description" hint={`${editForm.metaDescription.length}/160`} />
                          <textarea
                            value={editForm.metaDescription}
                            onChange={(event) =>
                              setEditForm((prev) => ({ ...prev, metaDescription: event.target.value }))
                            }
                            rows={4}
                            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                          />
                        </div>

                        <div>
                          <FieldLabel label="Focus Keyword" />
                          <input
                            type="text"
                            value={editForm.focusKeyword}
                            onChange={(event) =>
                              setEditForm((prev) => ({ ...prev, focusKeyword: event.target.value }))
                            }
                            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                          />
                        </div>

                        <div>
                          <FieldLabel label="Robots" />
                          <select
                            value={editForm.robots}
                            onChange={(event) =>
                              setEditForm((prev) => ({
                                ...prev,
                                robots: event.target.value as ProductSEOViewModel["robots"],
                              }))
                            }
                            className="h-[50px] w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                          >
                            <option value="index,follow">index,follow</option>
                            <option value="noindex,follow">noindex,follow</option>
                            <option value="index,nofollow">index,nofollow</option>
                            <option value="noindex,nofollow">noindex,nofollow</option>
                          </select>
                        </div>

                        <div className="md:col-span-2">
                          <FieldLabel label="SEO Keywords" hint="Virgül veya satır sonu ile ayırın" />
                          <textarea
                            value={editForm.keywordsText}
                            onChange={(event) =>
                              setEditForm((prev) => ({ ...prev, keywordsText: event.target.value }))
                            }
                            rows={3}
                            className="w-full rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                          />
                        </div>

                        <div>
                          <FieldLabel label="Canonical Override" />
                          <div className="relative">
                            <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              value={editForm.canonicalUrl}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, canonicalUrl: event.target.value }))
                              }
                              placeholder={`${STORE_RUNTIME.storefrontUrl}/tr/urunler/${product.slug}`}
                              className="w-full rounded-2xl border border-stone-200 bg-stone-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                            />
                          </div>
                        </div>

                        <div>
                          <FieldLabel label="OG Image" />
                          <div className="relative">
                            <ImageIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                            <input
                              type="text"
                              value={editForm.ogImage}
                              onChange={(event) =>
                                setEditForm((prev) => ({ ...prev, ogImage: event.target.value }))
                              }
                              placeholder="https://..."
                              className="w-full rounded-2xl border border-stone-200 bg-stone-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyRecommendation(product)}
                          className="inline-flex h-11 items-center rounded-2xl border border-orange-200 bg-orange-50 px-4 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          Kural Bazlı Öneriyi Uygula
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleAiGeneration(product)}
                          disabled={aiGeneratingId === product.id}
                          className="inline-flex h-11 items-center rounded-2xl border border-stone-200 px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {aiGeneratingId === product.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Bot className="mr-2 h-4 w-4" />
                          )}
                          AI Meta Üret
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleSave(product)}
                          disabled={savingId === product.id}
                          className="inline-flex h-11 items-center rounded-2xl bg-stone-950 px-4 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {savingId === product.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Kaydet
                        </button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          <Eye className="h-4 w-4" />
                          Google Önizlemesi
                        </div>
                        <div className="space-y-1">
                          <div className="line-clamp-2 text-lg font-medium text-[#1a0dab]">
                            {previewTitle || product.name}
                          </div>
                          <div className="text-sm text-[#006621]">{storeHost} › tr › urunler › {product.slug}</div>
                          <div className="text-sm leading-6 text-stone-600">{previewDescription}</div>
                        </div>
                      </div>

                      <div className="rounded-3xl border border-stone-200 bg-white p-5">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Önerilen Yapı
                        </div>
                        <div className="mt-3 space-y-3 text-sm">
                          <div>
                            <div className="font-medium text-stone-800">Focus keyword</div>
                            <div className="mt-1 text-stone-600">{product.recommendation.focusKeyword}</div>
                          </div>
                          <div>
                            <div className="font-medium text-stone-800">Keyword seti</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {product.recommendation.keywords.map((keyword) => (
                                <span key={keyword} className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700">
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl bg-stone-50 p-3">
                              <div className="flex items-center gap-2 font-medium text-stone-800">
                                <Link2 className="h-4 w-4 text-stone-500" />
                                Canonical
                              </div>
                              <div className="mt-1 break-all text-xs text-stone-500">
                                {editForm.canonicalUrl || "Varsayılan localized canonical kullanılır"}
                              </div>
                            </div>
                            <div className="rounded-2xl bg-stone-50 p-3">
                              <div className="flex items-center gap-2 font-medium text-stone-800">
                                <Tag className="h-4 w-4 text-stone-500" />
                                Robots
                              </div>
                              <div className="mt-1 text-xs text-stone-500">{currentRobots}</div>
                            </div>
                          </div>
                          <div className="rounded-2xl bg-stone-50 p-3 text-xs text-stone-600">
                            FAQ kaydı: {product.faq?.length || 0} | GEO key takeaways: {product.geo.keyTakeaways.length}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-3">
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Meta Title
                        </div>
                        <div className="text-sm text-stone-700">{product.metaTitle}</div>
                      </div>
                      <div>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Meta Description
                        </div>
                        <div className="text-sm leading-6 text-stone-600">{product.metaDescription}</div>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-stone-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Focus keyword
                        </div>
                        <div className="mt-2 text-sm font-medium text-stone-800">{product.focusKeyword || "-"}</div>
                      </div>
                      <div className="rounded-2xl bg-stone-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Keywords
                        </div>
                        <div className="mt-2 text-sm text-stone-600">{product.keywords.length}</div>
                      </div>
                      <div className="rounded-2xl bg-stone-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          Canonical
                        </div>
                        <div className="mt-2 break-all text-sm text-stone-600">
                          {product.canonicalUrl || "Varsayılan localized canonical"}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-stone-50 p-4">
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                          OG image
                        </div>
                        <div className="mt-2 break-all text-sm text-stone-600">
                          {product.ogImage || "İlk ürün görseli fallback"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
