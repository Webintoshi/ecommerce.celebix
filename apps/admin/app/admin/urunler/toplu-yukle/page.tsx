"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Globe2,
  Loader2,
  Upload,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  AdminActionButton,
  AdminCallout,
  AdminDataTable,
  AdminEmptyState,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";
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

const STEP_LABELS = {
  1: "Kaynak",
  2: "Analiz",
  3: "Önizleme",
  4: "Sonuç",
} as const;

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
  const selectedFeedLabel = feedUrl.trim() || "Feed URL bekleniyor";
  const selectedSourceLabel = isFeedMode ? "Feed URL" : `CSV / ${selectedProviderMeta?.label ?? "-"}`;
  const selectedFileLabel = file ? file.name : "Dosya seçilmedi";
  const selectedAssetLabel = isFeedMode ? selectedFeedLabel : selectedFileLabel;
  const currentStepLabel = STEP_LABELS[currentStep];
  const isBusy = analyzing || feedAnalyzing || importing || repairing;

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
      setProgressText(`${index + 1}/${parseResult.products.length} ürün aktarılıyor: ${product.name}`);
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
            "Admin oturumu import sırasında kesildi. Tekrar giriş yapıp aynı feed ile devam edin.",
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
    setProgressText("Kategori hiyerarşisi feed üzerinden onarılıyor...");

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
    <main role="main" aria-busy={isBusy} className="min-h-screen bg-[#F9F9F9] text-[#111827]">
      <div className="w-full px-0 py-3 md:py-5">
        <AdminPageShell className="mx-auto max-w-none">
          <AdminPageHeader
            sectionLabel="Katalog"
            title="Toplu yükle"
            description="CSV veya XML feed ile ürünleri içe aktarın."
            actions={
              <>
                {!isFeedMode ? (
                  <AdminActionButton type="button" tone="secondary" onClick={handleDownloadTemplate}>
                    <Download className="h-4 w-4" />
                    Şablon indir
                  </AdminActionButton>
                ) : null}

                {parseResult?.products.length ? (
                  <AdminActionButton
                    type="button"
                    tone="secondary"
                    onClick={() => {
                      setCurrentStep(2);
                      setImportResult(null);
                      setRepairResult(null);
                    }}
                    disabled={isBusy}
                  >
                    <Upload className="h-4 w-4" />
                    {isFeedMode ? "Feed'i güncelle" : "Dosyayı güncelle"}
                  </AdminActionButton>
                ) : null}

                {isFeedMode && parseResult?.products.length ? (
                  <AdminActionButton
                    type="button"
                    tone="secondary"
                    onClick={handleRepairCategoriesFromFeed}
                    disabled={importing || repairing}
                  >
                    {repairing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                    Kategorileri onar
                  </AdminActionButton>
                ) : null}

                {parseResult?.products.length ? (
                  <AdminActionButton type="button" tone="primary" onClick={handleImport} disabled={importing || repairing}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    İçe aktar
                  </AdminActionButton>
                ) : null}
              </>
            }
            metrics={
              <>
                <HeaderMetric label="Kaynak" value={selectedSourceLabel} />
                <HeaderMetric label="Varlık" value={selectedAssetLabel} />
                <HeaderMetric label="Hazır ürün" value={String(readyProductCount)} />
                <HeaderMetric label="Durum" value={currentStepLabel} />
              </>
            }
          />

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Panel
              title="Kaynak"
              description="Aktarım tipini seçin, ardından dosya veya feed bilgisini analiz edin."
            >
              <div className="grid gap-2 md:grid-cols-2">
                <SourceButton
                  selected={!isFeedMode}
                  icon={FileSpreadsheet}
                  title="CSV dosyası"
                  description="Platform export dosyası"
                  onClick={() => {
                    setSourceMode("csv");
                    resetImportState();
                    setCurrentStep(2);
                  }}
                />
                <SourceButton
                  selected={isFeedMode}
                  icon={Globe2}
                  title="Feed URL"
                  description="XML ürün feed'i"
                  onClick={() => {
                    setSourceMode("feed");
                    resetImportState();
                    setCurrentStep(2);
                  }}
                />
              </div>

              {!isFeedMode ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => {
                        setSelectedProvider(provider.id);
                        setCurrentStep(2);
                        resetImportState();
                      }}
                      className={cn(
                        "min-h-20 rounded-[8px] border px-4 py-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]",
                        provider.id === selectedProvider
                          ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
                          : "border-[#E1E6EF] bg-white text-[#374151] hover:border-[#FFD7BF] hover:text-[#E85D04]",
                      )}
                    >
                      <span>{provider.label}</span>
                      <span className="mt-1 block text-xs font-medium text-[#6B7280]">
                        {provider.description}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-2">
                  <label htmlFor="feed-url" className="text-sm font-semibold text-[#1F2937]">
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
                    className="h-11 w-full rounded-[7px] border border-[#E1E6EF] bg-white px-3 text-[14px] font-medium text-[#111827] outline-none transition placeholder:text-[#7B8797] focus:border-[#FFD7BF] focus:ring-4 focus:ring-[#FFF1E8]"
                  />
                </div>
              )}
            </Panel>

            <Panel title="Analiz" description="Önizleme için kaynağı çalıştırın.">
              {!isFeedMode ? (
                <div className="space-y-3">
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
                    className="flex min-h-24 w-full items-center gap-3 rounded-[8px] border border-dashed border-[#DCE3EC] bg-[#F9F9F9] px-4 text-left transition-colors hover:border-[#FFD7BF] hover:bg-[#FFF8F3] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]">
                      <Upload className="h-5 w-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-[#111827]">
                        {file?.name ?? "CSV dosyası seç"}
                      </span>
                      <span className="mt-1 block text-xs font-medium text-[#6B7280]">
                        {file ? `${(file.size / 1024).toFixed(1)} KB` : "Dosya seçildiğinde analiz başlayabilir."}
                      </span>
                    </span>
                  </button>
                  <AdminActionButton
                    type="button"
                    tone="primary"
                    className="w-full rounded-[7px]"
                    onClick={handleAnalyzeFile}
                    disabled={!file || analyzing}
                  >
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
                    Analiz et
                  </AdminActionButton>
                </div>
              ) : (
                <div className="space-y-3">
                  <AdminCallout tone="neutral" className="rounded-[8px]">
                    Feed okunur, ürünler önizlemeye alınır.
                  </AdminCallout>
                  <AdminActionButton
                    type="button"
                    tone="primary"
                    className="w-full rounded-[7px]"
                    onClick={handleAnalyzeFeed}
                    disabled={!feedUrl.trim() || feedAnalyzing}
                  >
                    {feedAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe2 className="h-4 w-4" />}
                    Feed'i analiz et
                  </AdminActionButton>
                </div>
              )}
            </Panel>
          </section>

          {parseResult ? (
            <section className="space-y-4">
              <div className="grid gap-px overflow-hidden rounded-[8px] border border-[#DCE3EC] bg-[#DCE3EC] md:grid-cols-4">
                <InfoCard title="Toplam satır" value={String(parseResult.totalRows)} />
                <InfoCard title="Ürün" value={String(parseResult.products.length)} tone="success" />
                <InfoCard title="Atlanan" value={String(parseResult.skippedRows)} tone="warning" />
                <InfoCard title="Hata" value={String(parseResult.errors.length)} tone={parseResult.errors.length ? "danger" : "success"} />
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {parseResult.warnings.length > 0 ? (
                  <ResultPanel title="Uyarılar" tone="warning" items={parseResult.warnings} />
                ) : (
                  <AdminCallout tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
                    Uyarı bulunmuyor.
                  </AdminCallout>
                )}

                {parseResult.errors.length > 0 ? (
                  <ResultPanel title="Hatalar" tone="danger" items={parseResult.errors} />
                ) : (
                  <AdminCallout tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
                    Kritik hata bulunmuyor.
                  </AdminCallout>
                )}
              </div>

              {parseResult.products.length > 0 ? (
                <AdminDataTable className="rounded-[8px] shadow-none">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E1E6EF] bg-[#F9F9F9] px-4 py-3">
                    <div>
                      <h2 className="text-lg font-semibold tracking-[-0.03em] text-[#111827]">Önizleme</h2>
                      <p className="mt-1 text-sm text-[#6B7280]">İlk 20 kayıt gösteriliyor.</p>
                    </div>
                    <AdminStatusBadge tone="accent">{parseResult.products.length} ürün hazır</AdminStatusBadge>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-[840px] w-full text-left text-sm">
                      <thead className="bg-[#EEF3F7] text-[#4B5563]">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Ürün</th>
                          <th className="px-4 py-3 font-semibold">Slug</th>
                          <th className="px-4 py-3 font-semibold">Kategori</th>
                          <th className="px-4 py-3 font-semibold">Varyant</th>
                          <th className="px-4 py-3 font-semibold">Satır</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E1E6EF] bg-white">
                        {parseResult.products.slice(0, 20).map((product) => (
                          <tr key={`${product.slug}-${product.sourceRows.join("-")}`}>
                            <td className="max-w-[300px] px-4 py-3 font-semibold text-[#111827]">
                              <span className="block truncate">{product.name}</span>
                            </td>
                            <td className="max-w-[220px] px-4 py-3 text-[#4B5563]">
                              <span className="block truncate">{product.slug}</span>
                            </td>
                            <td className="max-w-[260px] px-4 py-3 text-[#4B5563]">
                              <span className="block truncate">
                                {product.categoryPath?.length
                                  ? product.categoryPath.map((segment) => segment.name).join(" > ")
                                  : product.category}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[#4B5563]">{product.variants.length}</td>
                            <td className="px-4 py-3 text-[#4B5563]">{product.sourceRows.join(", ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AdminDataTable>
              ) : (
                <AdminEmptyState
                  icon={<FileSpreadsheet className="h-5 w-5" />}
                  title="Aktarılacak ürün bulunamadı"
                  description="Kaynak dosyayı veya feed adresini kontrol edin."
                  className="rounded-[8px] bg-white"
                />
              )}
            </section>
          ) : null}

          {importing || repairing || importResult || repairResult ? (
            <section className="space-y-4">
              {progressText ? (
                <AdminCallout tone="info" icon={<Loader2 className="h-4 w-4 animate-spin" />}>
                  {progressText}
                </AdminCallout>
              ) : null}

              {importResult ? (
                <Panel title="İçe aktarım sonucu">
                  <div className="grid gap-px overflow-hidden rounded-[8px] border border-[#DCE3EC] bg-[#DCE3EC] md:grid-cols-3">
                    <InfoCard title="Toplam" value={String(importResult.total)} />
                    <InfoCard title="Başarılı" value={String(importResult.success)} tone="success" />
                    <InfoCard title="Başarısız" value={String(importResult.failed)} tone={importResult.failed ? "danger" : "success"} />
                  </div>

                  {importResult.errors.length > 0 ? (
                    <div className="mt-3">
                      <ResultPanel title="Aktarım hataları" tone="danger" items={importResult.errors} />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <AdminCallout tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
                        Aktarım tamamlandı.
                      </AdminCallout>
                    </div>
                  )}

                  {importResult.halted ? (
                    <div className="mt-3">
                      <AdminCallout tone="warning" icon={<AlertCircle className="h-4 w-4" />}>
                        Oturum kesildiği için aktarım durdu.
                      </AdminCallout>
                    </div>
                  ) : null}
                </Panel>
              ) : null}

              {repairResult ? (
                <Panel title="Kategori onarım sonucu">
                  <div className="grid gap-px overflow-hidden rounded-[8px] border border-[#DCE3EC] bg-[#DCE3EC] md:grid-cols-5">
                    <InfoCard title="Feed" value={String(repairResult.totalFeedProducts)} />
                    <InfoCard title="Eşleşen" value={String(repairResult.matchedProducts)} tone="success" />
                    <InfoCard title="Güncellenen" value={String(repairResult.updatedProducts)} tone="success" />
                    <InfoCard title="Atlanan" value={String(repairResult.skippedProducts)} tone="warning" />
                    <InfoCard title="Başarısız" value={String(repairResult.failedProducts)} tone={repairResult.failedProducts ? "danger" : "success"} />
                  </div>

                  {repairResult.errors.length > 0 ? (
                    <div className="mt-3">
                      <ResultPanel title="Kategori hataları" tone="danger" items={repairResult.errors} />
                    </div>
                  ) : (
                    <div className="mt-3">
                      <AdminCallout tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
                        Kategori onarımı tamamlandı.
                      </AdminCallout>
                    </div>
                  )}
                </Panel>
              ) : null}
            </section>
          ) : null}
        </AdminPageShell>
      </div>
    </main>
  );
}

function HeaderMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B8797]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#111827]">{value}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[8px] border border-[#DCE3EC] bg-white shadow-none">
      <div className="border-b border-[#E1E6EF] px-4 py-3">
        <h2 className="text-base font-semibold tracking-[-0.03em] text-[#111827]">{title}</h2>
        {description ? <p className="mt-1 text-sm text-[#6B7280]">{description}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SourceButton({
  selected,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex min-h-20 items-center gap-3 rounded-[8px] border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FFF1E8]",
        selected
          ? "border-[#FFD7BF] bg-[#FFF1E8] text-[#E85D04]"
          : "border-[#E1E6EF] bg-white text-[#374151] hover:border-[#FFD7BF] hover:text-[#E85D04]",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border",
          selected ? "border-[#FFD7BF] bg-white text-[#E85D04]" : "border-[#E1E6EF] bg-[#F9F9F9] text-[#6B7280]",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs font-medium text-[#6B7280]">{description}</span>
      </span>
    </button>
  );
}

function InfoCard({
  title,
  value,
  tone = "neutral",
}: {
  title: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  return (
    <div
      className={cn(
        "min-w-0 bg-white px-4 py-4",
        tone === "success" && "text-[#15803D]",
        tone === "warning" && "text-[#B45309]",
        tone === "danger" && "text-[#B91C1C]",
        tone === "neutral" && "text-[#111827]",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7B8797]">{title}</p>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
    </div>
  );
}

function ResultPanel({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "warning" | "danger";
  items: string[];
}) {
  return (
    <div
      className={cn(
        "rounded-[8px] border px-4 py-3 text-sm",
        tone === "warning" && "border-[#F8D9A8] bg-[#FFF8E8] text-[#92400E]",
        tone === "danger" && "border-[#F5D3D3] bg-[#FDECEC] text-[#B91C1C]",
      )}
    >
      <div className="mb-2 flex items-center gap-2 font-semibold">
        {tone === "danger" ? <XCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        {title}
      </div>
      <ul className="max-h-44 space-y-1 overflow-auto">
        {items.slice(0, 30).map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
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
