"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
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
}

const STEPS = [
  { id: 1, label: "Platform Seçimi" },
  { id: 2, label: "Dosya Yükleme" },
  { id: 3, label: "Önizleme" },
  { id: 4, label: "İçe Aktarım" },
] as const;

export default function BulkUploadPage() {
  const providers = useMemo(() => getBulkImportProviders(), []);
  const [selectedProvider, setSelectedProvider] = useState<BulkImportProvider>("woocommerce");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [parseResult, setParseResult] = useState<BulkImportParseResult | null>(null);
  const [importResult, setImportResult] = useState<ImportRunResult | null>(null);

  const selectedProviderMeta = providers.find((provider) => provider.id === selectedProvider);

  const handleDownloadTemplate = () => {
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
    setParseResult(null);
    setImportResult(null);

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
      setProgressText(`${index + 1}/${parseResult.products.length} ürün aktarılıyor: ${product.name}`);
      try {
        const response = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toApiPayload(product)),
        });
        const data = await response.json();
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Toplu Ürün Yükleme</h1>
          <p className="mt-1 text-gray-600">
            WooCommerce, Shopify ve diğer bilinen platformlardan ürünleri güvenli şekilde içe aktarın.
          </p>
        </div>
        <Link href="/admin/urunler" className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">
          Ürünlere Dön
        </Link>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          {STEPS.map((step) => {
            const active = currentStep === step.id;
            const completed = currentStep > step.id;
            return (
              <div
                key={step.id}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  completed
                    ? "border-green-200 bg-green-50 text-green-800"
                    : active
                      ? "border-blue-200 bg-blue-50 text-blue-800"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                }`}
              >
                <div className="font-semibold">{step.id}. {step.label}</div>
              </div>
            );
          })}
        </div>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">1) Platform Seç</h2>
        </div>
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
                className={`rounded-xl border p-4 text-left transition ${
                  selected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="font-semibold text-gray-900">{provider.label}</div>
                <p className="mt-1 text-xs text-gray-600">{provider.description}</p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">2) Dosya Yükle ve Analiz Et</h2>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            {selectedProviderMeta?.label} Şablonunu İndir
          </button>
        </div>

        <div className="rounded-xl border border-dashed border-gray-300 p-6">
          <div className="flex flex-col items-center justify-center text-center">
            <FileSpreadsheet className="mb-3 h-10 w-10 text-gray-500" />
            <p className="font-medium text-gray-900">
              {selectedProviderMeta?.label} için CSV dosyasını seçin
            </p>
            <p className="mt-1 text-sm text-gray-600">UTF-8 CSV önerilir. Ayraç olarak virgül, noktalı virgül veya tab desteklenir.</p>

            <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800">
              Dosya Seç
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setFile(nextFile);
                  setParseResult(null);
                  setImportResult(null);
                  if (nextFile) setCurrentStep(2);
                }}
              />
            </label>

            {file ? (
              <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <div className="font-medium">{file.name}</div>
                <div>{(file.size / 1024).toFixed(2)} KB</div>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleAnalyzeFile}
              disabled={!file || analyzing}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {analyzing ? "Analiz ediliyor..." : "Dosyayı Analiz Et"}
            </button>
          </div>
        </div>
      </section>

      {parseResult ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">3) Önizleme ve Doğrulama</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <InfoCard title="Toplam Satır" value={String(parseResult.totalRows)} tone="default" />
            <InfoCard title="Ürün Sayısı" value={String(parseResult.products.length)} tone="success" />
            <InfoCard title="Atlanan Satır" value={String(parseResult.skippedRows)} tone="warning" />
            <InfoCard title="Hata Sayısı" value={String(parseResult.errors.length)} tone={parseResult.errors.length ? "danger" : "success"} />
          </div>

          {parseResult.warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 text-sm font-semibold text-yellow-800">Uyarılar</p>
              <ul className="max-h-40 space-y-1 overflow-auto text-sm text-yellow-900">
                {parseResult.warnings.slice(0, 30).map((warning, index) => (
                  <li key={`${warning}-${index}`}>• {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {parseResult.errors.length > 0 ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-semibold text-red-800">Hatalar</p>
              <ul className="max-h-40 space-y-1 overflow-auto text-sm text-red-900">
                {parseResult.errors.slice(0, 30).map((error, index) => (
                  <li key={`${error}-${index}`}>• {error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {parseResult.products.length > 0 ? (
            <>
              <div className="mt-5 overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Ürün</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Slug</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Kategori</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Varyant</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Kaynak Satır</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parseResult.products.slice(0, 20).map((product) => (
                      <tr key={product.slug} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-900">{product.name}</td>
                        <td className="px-3 py-2 text-gray-700">{product.slug}</td>
                        <td className="px-3 py-2 text-gray-700">{product.category}</td>
                        <td className="px-3 py-2 text-gray-700">{product.variants.length}</td>
                        <td className="px-3 py-2 text-gray-700">{product.sourceRows.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {importing ? "İçe aktarım sürüyor..." : `${parseResult.products.length} Ürünü İçe Aktar`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep(2);
                    setImportResult(null);
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Dosyayı Güncelle
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {importing || importResult ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 flex items-center gap-2">
            {importResult && importResult.failed === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            ) : importResult && importResult.failed > 0 ? (
              <XCircle className="h-5 w-5 text-red-600" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
            )}
            <h2 className="text-lg font-semibold text-gray-900">4) İçe Aktarım Sonucu</h2>
          </div>

          {progressText ? (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{progressText}</div>
          ) : null}

          {importResult ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <InfoCard title="Toplam Ürün" value={String(importResult.total)} tone="default" />
                <InfoCard title="Başarılı" value={String(importResult.success)} tone="success" />
                <InfoCard title="Başarısız" value={String(importResult.failed)} tone={importResult.failed > 0 ? "danger" : "success"} />
              </div>

              {importResult.errors.length > 0 ? (
                <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="mb-2 text-sm font-semibold text-red-800">Aktarım Hataları</p>
                  <ul className="max-h-48 space-y-1 overflow-auto text-sm text-red-900">
                    {importResult.errors.slice(0, 50).map((error, index) => (
                      <li key={`${error}-${index}`}>• {error}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
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
      ? "border-green-200 bg-green-50 text-green-900"
      : tone === "warning"
        ? "border-yellow-200 bg-yellow-50 text-yellow-900"
        : tone === "danger"
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-gray-200 bg-gray-50 text-gray-900";

  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <p className="text-xs font-medium">{title}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
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
    subcategory: product.subcategory,
    tags: product.tags,
    images: product.images,
    is_active: true,
    is_featured: false,
    is_new: false,
    vegan: product.vegan,
    gluten_free: product.glutenFree,
    sugar_free: product.sugarFree,
    high_protein: product.highProtein,
    status: "published",
    is_draft: false,
    variants: product.variants.map((variant) => ({
      name: variant.name,
      weight: variant.weight,
      price: variant.price,
      original_price: variant.originalPrice ?? null,
      stock: variant.stock,
      sku: variant.sku,
      unit: "adet",
    })),
  };
}
