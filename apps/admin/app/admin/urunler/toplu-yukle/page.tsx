"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Globe2,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import {
  buildTemplateCsv,
  getBulkImportProviders,
  parseBulkProductsFromCsv,
  type BulkImportParseResult,
  type BulkImportProvider,
  type ParsedProduct,
} from "@/lib/admin/product-bulk-import";

interface ImportRunResult {
  total: number;
  success: number;
  failed: number;
  errors: string[];
  halted?: boolean;
}

interface RepairRunResult {
  totalFeedProducts: number;
  matchedProducts: number;
  updatedProducts: number;
  skippedProducts: number;
  failedProducts: number;
  errors: string[];
}

type ImportSourceMode = "csv" | "feed";

const STEPS = [
  { id: 1, label: "Platform Seçimi" },
  { id: 2, label: "Dosya Yükleme" },
  { id: 3, label: "Önizleme" },
  { id: 4, label: "İçe Aktarım" },
] as const;

export default function BulkUploadPage() {
  const providers = useMemo(() => getBulkImportProviders(), []);
  const [sourceMode, setSourceMode] = useState<ImportSourceMode>("csv");
  const [selectedProvider, setSelectedProvider] = useState<BulkImportProvider>("woocommerce");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedAnalyzing, setFeedAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [parseResult, setParseResult] = useState<BulkImportParseResult | null>(null);
  const [importResult, setImportResult] = useState<ImportRunResult | null>(null);
  const [repairResult, setRepairResult] = useState<RepairRunResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProviderMeta = providers.find((provider) => provider.id === selectedProvider);
  const isFeedMode = sourceMode === "feed";
  const readyProductCount = parseResult?.products.length ?? 0;
  const selectedFeedLabel = feedUrl.trim() || "Henüz feed URL girilmedi";
  const selectedSourceLabel = isFeedMode ? "Feed URL (XML)" : `CSV / ${selectedProviderMeta?.label ?? "-"}`;
  const selectedFileLabel = file ? file.name : "Henüz dosya seçilmedi";
  const selectedAssetLabel = isFeedMode ? selectedFeedLabel : selectedFileLabel;
  const currentStepLabel = STEPS.find((step) => step.id === currentStep)?.label ?? "Hazırlık";

  const resetImportState = () => {
    setParseResult(null);
    setImportResult(null);
    setRepairResult(null);
    setProgressText("");
  };

  const handleDownloadTemplate = () => {
    if (isFeedMode) return;
    const template = buildTemplateCsv(selectedProvider);
    const blob = new Blob(["\uFEFF" + template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedProvider}-urun-sablonu.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAnalyzeFile = async () => {
    if (!file) return;
    setAnalyzing(true);
    resetImportState();

    try {
      const content = await file.text();
      const result = parseBulkProductsFromCsv(content, selectedProvider);
      setParseResult(result);
      setCurrentStep(3);
    } catch (error) {
      setParseResult({
        headers: [],
        products: [],
        errors: [`Dosya analiz edilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`],
        warnings: [],
        skippedRows: 0,
        totalRows: 0,
      });
      setCurrentStep(3);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAnalyzeFeed = async () => {
    if (!feedUrl.trim()) return;
    setFeedAnalyzing(true);
    resetImportState();

    try {
      const response = await fetch("/api/admin/products/feed-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl.trim() }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success || !data?.parseResult) {
        throw new Error(data?.error ?? "Feed analizi tamamlanamadı.");
      }

      setParseResult(data.parseResult as BulkImportParseResult);
      setCurrentStep(3);
    } catch (error) {
      setParseResult({
        headers: [],
        products: [],
        errors: [
          `Feed analiz edilemedi: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`,
        ],
        warnings: [],
        skippedRows: 0,
        totalRows: 0,
      });
      setCurrentStep(3);
    } finally {
      setFeedAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || parseResult.products.length === 0) return;
    setImporting(true);
    setImportResult(null);

    const runResult: ImportRunResult = {
      total: parseResult.products.length,
      success: 0,
      failed: 0,
      errors: [],
    };

    for (let index = 0; index < parseResult.products.length; index += 1) {
      const product = parseResult.products[index];
      setProgressText(`${index + 1}/${parseResult.products.length} ürün aktarılıyor ve görseller R2 storage'a kopyalanıyor: ${product.name}`);
      try {
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(toApiPayload(product)),
        });
        const data = await response.json();

        if (response.status === 401 || response.status === 403) {
          runResult.failed += parseResult.products.length - index;
          runResult.halted = true;
          runResult.errors.push(
            "Admin oturumu import sirasinda kesildi. Tekrar giris yapip ayni feed ile devam edin.",
          );
          break;
        }

        if (!response.ok || !data?.success) {
          runResult.failed += 1;
          runResult.errors.push(`${product.name}: ${data?.error ?? "API hatası"}`);
          continue;
        }
        runResult.success += 1;
      } catch (error) {
        runResult.failed += 1;
        runResult.errors.push(`${product.name}: ${error instanceof Error ? error.message : "Bilinmeyen hata"}`);
      }
    }

    setProgressText("");
    setImporting(false);
    setImportResult(runResult);
    setCurrentStep(4);
  };

  const handleRepairCategoriesFromFeed = async () => {
    if (!isFeedMode || !feedUrl.trim()) return;
    setRepairing(true);
    setRepairResult(null);
    setProgressText("Mevcut ürünlerde kategori hiyerarşisi aynı feed üzerinden onarılıyor...");

    try {
      const response = await fetch("/api/admin/products/feed-category-repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: feedUrl.trim() }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success || !data?.result) {
        throw new Error(data?.error ?? "Feed kategori onarımı tamamlanamadı.");
      }

      setRepairResult(data.result as RepairRunResult);
      setCurrentStep(4);
    } catch (error) {
      setRepairResult({
        totalFeedProducts: parseResult?.products.length ?? 0,
        matchedProducts: 0,
        updatedProducts: 0,
        skippedProducts: 0,
        failedProducts: 1,
        errors: [
          error instanceof Error ? error.message : "Feed kategori onarımı tamamlanamadı.",
        ],
      });
      setCurrentStep(4);
    } finally {
      setProgressText("");
      setRepairing(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-[#fff8f3] via-[#fffdf9] to-[#f7efe8] p-4 text-[var(--admin-heading)] sm:p-6 lg:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[var(--admin-bg)]" />
      <div className="hidden" />
      <div className="hidden" />

      <div className="relative space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-[var(--admin-border)] bg-white shadow-[var(--shadow-md)]">
          <div className="border-b border-[var(--admin-border)] px-5 py-5 md:px-8 md:py-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-4">
                <div className="inline-flex w-fit items-center rounded-full border border-[var(--admin-accent-border)] bg-[var(--admin-accent-soft)] px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent)]">
                  Toplu Ürün Yükleme
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--admin-text-secondary)]">
                  <span className="inline-flex items-center rounded-full border border-[#ead9cb] bg-white/85 px-3 py-1.5 shadow-sm">
                    Aktif kaynak: {selectedSourceLabel}
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#ead9cb] bg-white/85 px-3 py-1.5 shadow-sm">
                    Adım: {currentStep}. {currentStepLabel}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/admin/urunler"
                  className="inline-flex items-center justify-center rounded-2xl border border-[var(--admin-accent-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-accent-hover)] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                >
                  Ürünlere Dön
                </Link>
                {!isFeedMode ? (
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                  >
                    <Download className="h-4 w-4" />
                    Şablonu İndir
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-px bg-[#EEF1F4] md:grid-cols-4">
            {[
              { label: "Seçili kaynak", value: selectedSourceLabel },
              { label: "Seçilen varlık", value: selectedAssetLabel },
              { label: "Hazır ürün", value: String(readyProductCount) },
              {
                label: "Aktarım durumu",
                value:
                  importResult || repairResult
                    ? "Tamamlandı"
                    : importing || repairing
                      ? "Sürüyor"
                      : "Hazır",
              },
            ].map((metric) => (
              <div key={metric.label} className="border border-white/70 bg-white/70 px-5 py-5 backdrop-blur-sm md:px-6">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9d816d]">{metric.label}</p>
                <p className="mt-2 line-clamp-2 text-base font-semibold text-[var(--admin-heading)] md:text-lg">{metric.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--admin-accent)]">Adım akışı</p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--admin-heading)]">4 aşamalı aktarım planı</h2>
            </div>
            <div className="rounded-full border border-[#ead9cb] bg-white/85 px-3 py-1.5 text-xs font-medium text-[var(--admin-text-secondary)] shadow-sm">
              Mevcut adım: {currentStep}/4
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
          {STEPS.map((step) => {
            const active = currentStep === step.id;
            const completed = currentStep > step.id;
            return (
              <div
                key={step.id}
                className={`rounded-[24px] border px-4 py-4 text-sm shadow-sm transition ${
                  completed
                    ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-emerald-900"
                    : active
                      ? "border-[var(--admin-accent-border)] bg-gradient-to-br from-[#fff3e8] to-white text-[#8b4b20] shadow-[var(--shadow-md)]"
                      : "border-[var(--admin-border)] bg-white/85 text-[#8d796a]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold ${
                      completed
                        ? "bg-emerald-100 text-emerald-700"
                        : active
                          ? "bg-[var(--admin-accent)] text-white"
                          : "bg-[#f5ede6] text-[#8d796a]"
                    }`}
                  >
                    {step.id}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-current/70">Aşama</p>
                    <div className="mt-1 font-semibold">{step.label}</div>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
        </section>

        <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#fff0e3] to-[#f8ddc7] shadow-[var(--shadow-md)]">
              <CheckCircle2 className="h-5 w-5 text-[var(--admin-accent)]" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">1. aşama</p>
              <h2 className="mt-1 text-xl font-semibold text-[var(--admin-heading)]">Kaynak ve platform seçimi</h2>
            </div>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-2">
            {[
              {
                id: "csv" as const,
                title: "CSV Dosyası",
                description:
                  "WooCommerce, Shopify ve benzeri CSV export dosyalarını mevcut parser ile içe aktar.",
                icon: FileSpreadsheet,
              },
              {
                id: "feed" as const,
                title: "Feed URL (XML)",
                description:
                  "Google Merchant / Atom benzeri XML feed URL'sini analiz et, varyantlara ayır ve içe aktar.",
                icon: Globe2,
              },
            ].map((source) => {
              const selected = sourceMode === source.id;
              return (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => {
                    setSourceMode(source.id);
                    resetImportState();
                    setCurrentStep(2);
                  }}
                  className={`rounded-[24px] border p-5 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] ${
                    selected
                      ? "border-[var(--admin-accent-border)] bg-gradient-to-br from-[#fff1e6] to-white shadow-[var(--shadow-md)]"
                      : "border-[var(--admin-border)] bg-white/85 hover:border-[var(--admin-accent-border)] hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 font-semibold text-[var(--admin-heading)]">
                        <source.icon className="h-4 w-4 text-[var(--admin-accent)]" />
                        <span>{source.title}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">{source.description}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        selected ? "bg-[var(--admin-accent)] text-white" : "bg-[#f5ede6] text-[#8d796a]"
                      }`}
                    >
                      {selected ? "Seçili" : "Hazır"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {!isFeedMode ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {providers.map((provider) => {
                const selected = provider.id === selectedProvider;
                return (
                  <button
                    key={provider.id}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(provider.id);
                      setCurrentStep(2);
                    }}
                    className={`rounded-[24px] border p-5 text-left shadow-sm transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] ${
                      selected
                        ? "border-[var(--admin-accent-border)] bg-gradient-to-br from-[#fff1e6] to-white shadow-[var(--shadow-md)]"
                        : "border-[var(--admin-border)] bg-white/85 hover:border-[var(--admin-accent-border)] hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold text-[var(--admin-heading)]">{provider.label}</div>
                        <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">{provider.description}</p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${
                          selected ? "bg-[var(--admin-accent)] text-white" : "bg-[#f5ede6] text-[#8d796a]"
                        }`}
                      >
                        {selected ? "Seçili" : "Hazır"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[24px] border border-[var(--admin-border)] bg-white/85 p-5 shadow-sm">
              <p className="text-sm font-semibold text-[var(--admin-heading)]">Feed modu aktif</p>
              <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">
                Google Merchant / Atom feed içindeki satırlar{" "}
                <code className="rounded bg-[#f8efe6] px-1 py-0.5 text-[var(--admin-accent-hover)]">item_group_id</code>{" "}
                bazlı gruplanır, çoklu görseller tek üründe birleşir ve varyant özellikleri
                otomatik çıkarılır.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#fff0e3] to-[#f8ddc7] shadow-[var(--shadow-md)]">
                <Upload className="h-5 w-5 text-[var(--admin-accent)]" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">2. aşama</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--admin-heading)]">Dosya yükleme ve analiz</h2>
              </div>
            </div>

            {!isFeedMode ? (
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--admin-accent-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-accent-hover)] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
              >
                <Download className="h-4 w-4" />
                {selectedProviderMeta?.label} şablonunu indir
              </button>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
            {!isFeedMode ? (
              <div className="rounded-[28px] border border-dashed border-[#d9b99f] bg-gradient-to-br from-[#fffaf6] to-white p-6 shadow-inner">
                <div className="flex flex-col items-center justify-center text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#fff0e3] to-[#f6deca] shadow-[var(--shadow-md)]">
                    <FileSpreadsheet className="h-10 w-10 text-[var(--admin-accent)]" />
                  </div>
                  <p className="mt-5 text-lg font-semibold text-[var(--admin-heading)]">
                    {selectedProviderMeta?.label} için CSV dosyasını seçin
                  </p>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--admin-text-secondary)]">
                    UTF-8 CSV önerilir. Ayraç olarak virgül, noktalı virgül veya tab desteklenir.
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setFile(nextFile);
                      resetImportState();
                      if (nextFile) setCurrentStep(2);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-5 inline-flex items-center rounded-2xl bg-[#2f241d] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:bg-[#241b16] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                  >
                    Dosya Seç
                  </button>

                  {file ? (
                    <div className="mt-4 w-full max-w-md rounded-[22px] border border-[#ead9cb] bg-white px-4 py-4 text-sm text-[#5e4b3e] shadow-sm">
                      <div className="font-semibold text-[var(--admin-heading)]">{file.name}</div>
                      <div className="mt-1 text-xs text-[#8d796a]">{(file.size / 1024).toFixed(2)} KB</div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleAnalyzeFile}
                    disabled={!file || analyzing}
                    className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {analyzing ? "Analiz ediliyor..." : "Dosyayı Analiz Et"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-[28px] border border-dashed border-[#d9b99f] bg-gradient-to-br from-[#fffaf6] to-white p-6 shadow-inner">
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-gradient-to-br from-[#fff0e3] to-[#f6deca] shadow-[var(--shadow-md)]">
                      <Globe2 className="h-7 w-7 text-[var(--admin-accent)]" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-[var(--admin-heading)]">Feed URL ile ürünleri analiz et</p>
                      <p className="mt-1 text-sm leading-6 text-[var(--admin-text-secondary)]">
                        XML feed sunucu tarafında çekilir, önizleme hazırlanır ve mevcut toplu
                        aktarım akışıyla ürüne dönüşür.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="feed-url" className="text-sm font-semibold text-[var(--admin-heading)]">
                      Feed URL
                    </label>
                    <input
                      id="feed-url"
                      type="url"
                      value={feedUrl}
                      onChange={(event) => {
                        setFeedUrl(event.target.value);
                        resetImportState();
                        setCurrentStep(2);
                      }}
                      placeholder="https://www.example.com/XMLExport/feed.xml"
                      className="w-full rounded-2xl border border-[var(--admin-border)] bg-white px-4 py-3 text-sm text-[var(--admin-heading)] shadow-sm outline-none transition placeholder:text-[var(--admin-text-muted)] focus:border-[var(--admin-accent-border)] focus:ring-4 focus:ring-[rgba(255,106,0,0.12)]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAnalyzeFeed}
                    disabled={!feedUrl.trim() || feedAnalyzing}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--admin-accent)] px-5 py-3 text-sm font-semibold text-white shadow-[var(--shadow-md)] transition hover:translate-y-[-1px] hover:bg-[var(--admin-accent-hover)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {feedAnalyzing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Globe2 className="h-4 w-4" />
                    )}
                    {feedAnalyzing ? "Feed analiz ediliyor..." : "Feed'i Analiz Et"}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {[
                { title: "Seçili kaynak", value: selectedSourceLabel },
                { title: "Beklenen format", value: isFeedMode ? "XML / Atom / Google Merchant" : "CSV / UTF-8" },
                { title: "Seçilen varlık", value: selectedAssetLabel },
              ].map((item) => (
                <div key={item.title} className="rounded-[24px] border border-[var(--admin-border)] bg-white/85 p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9d816d]">{item.title}</p>
                  <p className="mt-2 break-words text-sm font-semibold text-[var(--admin-heading)]">{item.value}</p>
                </div>
              ))}

            </div>
          </div>
        </section>

        {parseResult ? (
          <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#fff0e3] to-[#f8ddc7] shadow-[var(--shadow-md)]">
                <AlertCircle className="h-5 w-5 text-[var(--admin-accent)]" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">3. aşama</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--admin-heading)]">Önizleme ve doğrulama</h2>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <InfoCard title="Toplam Satır" value={String(parseResult.totalRows)} tone="default" />
              <InfoCard title="Ürün Sayısı" value={String(parseResult.products.length)} tone="success" />
              <InfoCard title="Atlanan Satır" value={String(parseResult.skippedRows)} tone="warning" />
              <InfoCard title="Hata Sayısı" value={String(parseResult.errors.length)} tone={parseResult.errors.length ? "danger" : "success"} />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              {parseResult.warnings.length > 0 ? (
                <div className="rounded-[24px] border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
                  <p className="mb-2 text-sm font-semibold text-amber-900">Uyarılar</p>
                  <ul className="max-h-48 space-y-1 overflow-auto text-sm text-amber-900">
                    {parseResult.warnings.slice(0, 30).map((warning, index) => (
                      <li key={`${warning}-${index}`}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-[24px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-emerald-900">Uyarı bulunmuyor</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-800">Dosya yapısı kontrol edildi; önizleme aşaması devam etmeye hazır.</p>
                </div>
              )}

              {parseResult.errors.length > 0 ? (
                <div className="rounded-[24px] border border-red-200/70 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm">
                  <p className="mb-2 text-sm font-semibold text-red-900">Hatalar</p>
                  <ul className="max-h-48 space-y-1 overflow-auto text-sm text-red-900">
                    {parseResult.errors.slice(0, 30).map((error, index) => (
                      <li key={`${error}-${index}`}>• {error}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-[24px] border border-[var(--admin-border)] bg-white/85 p-4 shadow-sm">
                  <p className="text-sm font-semibold text-[var(--admin-heading)]">Kritik hata bulunmuyor</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--admin-text-secondary)]">İçe aktarıma geçmeden önce tabloyu kontrol edip ürün sayısını doğrulayabilirsiniz.</p>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[24px] border border-[var(--admin-border)] bg-gradient-to-r from-[#fff3e9] to-white p-4 text-sm leading-6 text-[var(--admin-text-secondary)] shadow-sm">
              Import sırasında ürün ve varyant görselleri uzak URL'den alınır, bu mağazanın R2 bucket'ına yüklenir ve kayıtlar bizim storage URL'lerimizle oluşturulur.
            </div>

            {parseResult.products.length > 0 ? (
              <>
                <div className="mt-5 rounded-[28px] border border-[var(--admin-border)] bg-white/90 shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-[#f0e4d8] px-5 py-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#9d816d]">Önizleme tablosu</p>
                    </div>
                    <span className="rounded-full border border-[var(--admin-border)] bg-[var(--admin-accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-accent)]">
                      {parseResult.products.length} ürün hazır
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[#f9f3ed] text-[#6c584b]">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Ürün</th>
                          <th className="px-4 py-3 text-left font-semibold">Slug</th>
                          <th className="px-4 py-3 text-left font-semibold">Kategori</th>
                          <th className="px-4 py-3 text-left font-semibold">Varyant</th>
                          <th className="px-4 py-3 text-left font-semibold">Kaynak Satır</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parseResult.products.slice(0, 20).map((product) => (
                          <tr key={product.slug} className="border-t border-[#f2e7dc] align-top">
                            <td className="px-4 py-3 font-semibold text-[var(--admin-heading)]">{product.name}</td>
                            <td className="px-4 py-3 text-[#6c584b]">{product.slug}</td>
                            <td className="px-4 py-3 text-[#6c584b]">
                              {product.categoryPath?.length
                                ? product.categoryPath.map((segment) => segment.name).join(" > ")
                                : product.category}
                            </td>
                            <td className="px-4 py-3 text-[#6c584b]">{product.variants.length}</td>
                            <td className="px-4 py-3 text-[#6c584b]">{product.sourceRows.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={importing || repairing}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#2f9e5f] to-[#21824b] px-5 py-3 text-sm font-semibold text-white shadow-[0_18px_35px_rgba(33,130,75,0.22)] transition hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 disabled:opacity-50"
                  >
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {importing ? "İçe aktarım sürüyor..." : `${parseResult.products.length} ürünü içe aktar`}
                  </button>
                  {isFeedMode ? (
                    <button
                      type="button"
                      onClick={handleRepairCategoriesFromFeed}
                      disabled={importing || repairing}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[#7b61ff]/18 bg-white px-5 py-3 text-sm font-semibold text-[#5b3fd1] shadow-sm transition hover:border-[#7b61ff]/35 hover:bg-[#f7f3ff] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7b61ff]/15 disabled:opacity-50"
                    >
                      {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                      {repairing
                        ? "Kategori zinciri onarılıyor..."
                        : "Mevcut feed ürünlerinde kategori hiyerarşisini onar"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentStep(2);
                      setImportResult(null);
                      setRepairResult(null);
                    }}
                    className="rounded-2xl border border-[var(--admin-accent-border)] bg-white px-4 py-3 text-sm font-semibold text-[var(--admin-accent-hover)] shadow-sm transition hover:border-[var(--admin-accent-border)] hover:bg-[var(--admin-accent-soft)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(255,106,0,0.20)]"
                  >
                    {isFeedMode ? "Feed'i Güncelle" : "Dosyayı Güncelle"}
                  </button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {importing || repairing || importResult || repairResult ? (
          <section className="rounded-[30px] border border-[var(--admin-border)] bg-gradient-to-br from-white/95 via-[#fffdfa] to-[#f6eee6] p-5 shadow-[0_24px_55px_rgba(98,64,33,0.09)] md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#fff0e3] to-[#f8ddc7] shadow-[var(--shadow-md)]">
                {importResult && importResult.failed === 0 && !repairResult ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : importResult && importResult.failed > 0 && !repairResult ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : repairResult && repairResult.failedProducts === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : repairResult && repairResult.failedProducts > 0 ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : (
                  <Loader2 className="h-5 w-5 animate-spin text-[var(--admin-accent)]" />
                )}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--admin-accent)]">4. aşama</p>
                <h2 className="mt-1 text-xl font-semibold text-[var(--admin-heading)]">İçe aktarım sonucu</h2>
              </div>
            </div>

            <div aria-live="polite" aria-atomic="true" role="status" className="min-h-0">
              {progressText ? (
                <div className="mb-4 rounded-[24px] border border-[var(--admin-accent-border)] bg-gradient-to-r from-[#fff3e9] to-white px-4 py-4 text-sm font-medium text-[var(--admin-accent-hover)] shadow-sm">
                  {progressText}
                </div>
              ) : null}
            </div>

            {importResult ? (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoCard title="Toplam Ürün" value={String(importResult.total)} tone="default" />
                  <InfoCard title="Başarılı" value={String(importResult.success)} tone="success" />
                  <InfoCard title="Başarısız" value={String(importResult.failed)} tone={importResult.failed > 0 ? "danger" : "success"} />
                </div>

                {importResult.errors.length > 0 ? (
                  <div className="mt-4 rounded-[24px] border border-red-200/70 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm">
                    <p className="mb-2 text-sm font-semibold text-red-900">Aktarım hataları</p>
                    <ul className="max-h-48 space-y-1 overflow-auto text-sm text-red-900">
                      {importResult.errors.slice(0, 50).map((error, index) => (
                        <li key={`${error}-${index}`}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[24px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-emerald-900">Aktarım başarıyla tamamlandı</p>
                    <p className="mt-2 text-sm leading-6 text-emerald-800">Tüm ürünler hatasız işlendi ve sonuç kartları güncellendi.</p>
                  </div>
                )}

                {importResult.halted ? (
                  <div className="mt-4 rounded-[24px] border border-amber-200/70 bg-gradient-to-br from-amber-50 to-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-amber-900">Aktarım durduruldu</p>
                    <p className="mt-2 text-sm leading-6 text-amber-800">
                      Uzun süren aktarımlarda admin oturumu sona erebilir. Tekrar giriş yapıp aynı feed ile kaldığın yerden devam et.
                    </p>
                  </div>
                ) : null}
              </>
            ) : null}

            {repairResult ? (
              <>
                <div className="mt-6 grid gap-3 md:grid-cols-5">
                  <InfoCard title="Feed Ürünü" value={String(repairResult.totalFeedProducts)} tone="default" />
                  <InfoCard title="Eşleşen" value={String(repairResult.matchedProducts)} tone="success" />
                  <InfoCard title="Güncellenen" value={String(repairResult.updatedProducts)} tone="success" />
                  <InfoCard title="Atlanan" value={String(repairResult.skippedProducts)} tone="warning" />
                  <InfoCard
                    title="Başarısız"
                    value={String(repairResult.failedProducts)}
                    tone={repairResult.failedProducts > 0 ? "danger" : "success"}
                  />
                </div>

                {repairResult.errors.length > 0 ? (
                  <div className="mt-4 rounded-[24px] border border-red-200/70 bg-gradient-to-br from-red-50 to-white p-4 shadow-sm">
                    <p className="mb-2 text-sm font-semibold text-red-900">Kategori onarım hataları</p>
                    <ul className="max-h-48 space-y-1 overflow-auto text-sm text-red-900">
                      {repairResult.errors.slice(0, 50).map((error, index) => (
                        <li key={`${error}-${index}`}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-4 rounded-[24px] border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
                    <p className="text-sm font-semibold text-emerald-900">Kategori hiyerarşisi onarımı tamamlandı</p>
                    <p className="mt-2 text-sm leading-6 text-emerald-800">
                      Eşleşen ürünlerin kategori zinciri feed içindeki tam yol bilgisine göre güncellendi.
                    </p>
                  </div>
                )}
              </>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

function InfoCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: "default" | "success" | "warning" | "danger";
}) {
  const className =
    tone === "success"
      ? "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white text-emerald-950"
      : tone === "warning"
        ? "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white text-amber-950"
        : tone === "danger"
          ? "border-red-200/70 bg-gradient-to-br from-red-50 to-white text-red-950"
          : "border-[var(--admin-border)] bg-gradient-to-br from-white to-[#fbf6f0] text-[var(--admin-heading)]";

  return (
    <div className={`rounded-[24px] border p-4 shadow-sm ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-70">{title}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function toApiPayload(product: ParsedProduct) {
  return {
    name: product.name,
    slug: product.slug,
    description: product.description,
    short_description: product.shortDescription,
    category: product.category,
    subcategory: product.subcategory || null,
    category_path: product.categoryPath ?? [],
    tags: product.tags,
    images: product.images,
    images_v2: product.imagesV2 ?? product.images.map((url, index) => ({
      url,
      alt: product.name,
      is_primary: index === 0,
      sort_order: index,
    })),
    is_active: product.isActive ?? true,
    is_featured: false,
    is_new: false,
    vegan: product.vegan,
    gluten_free: product.glutenFree,
    sugar_free: product.sugarFree,
    high_protein: product.highProtein,
    brand: product.brand ?? null,
    seo_title: product.seoTitle ?? null,
    seo_description: product.seoDescription ?? null,
    status: product.status ?? "published",
    is_draft: product.isDraft ?? false,
    published_at: product.publishedAt ?? undefined,
    shopify_metadata: product.shopifyMetadata ?? {},
    shopify_metafields: product.shopifyMetafields ?? {},
    variants: product.variants.map((variant) => ({
      name: variant.name,
      weight: variant.weight,
      price: variant.price,
      original_price: variant.originalPrice ?? null,
      stock: variant.stock,
      sku: variant.sku,
      unit: variant.unit ?? "adet",
      cost: variant.cost ?? null,
      barcode: variant.barcode ?? null,
      group_name: variant.groupName ?? null,
      images: variant.images ?? [],
      attributes: variant.attributes ?? [],
      shopify_metadata: variant.shopifyMetadata ?? {},
    })),
  };
}
