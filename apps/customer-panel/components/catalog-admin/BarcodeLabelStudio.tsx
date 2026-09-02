"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  Printer,
  RefreshCw,
  Search,
  Tag,
  X,
} from "lucide-react";
import {
  parseBarcodeLabelListResult,
  parseBarcodeLabelTemplate,
  parseBarcodeInternalCreateResult,
  parseBarcodePrintJobList,
  parseBarcodePrintJob,
  parseCatalogOnboardingOptions,
  type BarcodeLabelTemplate,
  type BarcodeLabelTemplateConfig,
  type BarcodeLabelVariantRow,
  type BarcodePrintJob,
  type BarcodePrintJobSummary,
} from "@celebix/saas-contracts";
import {
  applyQuantityMode,
  hiddenSelectionCount,
  selectionMatchesFilter,
  togglePageSelection,
  upsertSelection,
  type BarcodeSelection,
} from "@/lib/barcode-labels/selection.ts";
import { buildLabelDocument } from "@/lib/barcode-labels/document.ts";
import { validateBarcodeValue } from "@/lib/barcode-labels/barcodes.ts";
import { normalizePaperTypeChange } from "@/lib/barcode-labels/preview-geometry.ts";
import { idempotentJsonMutation } from "@/lib/barcode-labels/idempotent-mutation.ts";
import {
  cancelPrintWindow,
  completePrintWindow,
  reservePrintWindow,
} from "@/lib/barcode-labels/print-window.ts";
import { reconcileActiveTemplateMutation } from "@/lib/barcode-labels/template-state.ts";
import {
  SYSTEM_BARCODE_LABEL_TEMPLATES,
  getSystemBarcodeLabelTemplate,
} from "@/lib/barcode-labels/system-templates.ts";
import { BarcodePreview } from "./BarcodePreview";
import "./barcode-label-studio.css";

type Filters = {
  q: string;
  status: string;
  stockState: string;
  categoryId: string;
  brandId: string;
  productId: string;
  hasBarcode: string;
  sort: string;
  pageSize: string;
};
type Option = { id: string; name: string };
const DEFAULT_FILTERS: Filters = {
  q: "",
  status: "",
  stockState: "",
  categoryId: "",
  brandId: "",
  productId: "",
  hasBarcode: "",
  sort: "updated-desc",
  pageSize: "20",
};
const FIELD_LABELS: Record<string, string> = {
  storeName: "Mağaza adı",
  productTitle: "Ürün adı",
  variantTitle: "Varyant",
  sku: "SKU",
  barcodeSymbol: "Barkod sembolü",
  barcodeValue: "Barkod numarası",
  price: "Fiyat",
  compareAtPrice: "Karşılaştırma fiyatı",
  brand: "Marka",
  category: "Kategori",
  stock: "Stok",
  attributes: "Varyant nitelikleri",
};
const INTERNAL_FAILURE_LABELS: Record<string, string> = {
  existing_barcode: "Mevcut barkod korundu",
  version_conflict: "Varyant başka bir işlemle güncellendi",
  variant_not_found: "Varyant bulunamadı",
};
const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
function initialFilters(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const url = new URL(window.location.href),
    next = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(next) as (keyof Filters)[]) {
    const value = url.searchParams.get(key);
    if (value !== null) next[key] = value;
  }
  return next;
}
function initialCursor(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return new URL(window.location.href).searchParams.get("cursor") ?? undefined;
}
function writeUrlState(
  filters: Filters,
  cursor: string | undefined,
  mode: "push" | "replace",
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== "" && value !== DEFAULT_FILTERS[key as keyof Filters])
      query.set(key, value);
  if (cursor) query.set("cursor", cursor);
  window.history[mode === "push" ? "pushState" : "replaceState"](
    null,
    "",
    `${window.location.pathname}${query.size ? `?${query}` : ""}`,
  );
}
async function json(request: Promise<Response>) {
  const response = await request;
  const value = await response.json().catch(() => ({ code: "unavailable" }));
  if (!response.ok)
    throw new Error(
      typeof value?.code === "string" ? value.code : "unavailable",
    );
  return value;
}
function mutation<T>(
  path: string,
  method: string,
  payload: unknown,
  parse: (value: unknown) => T,
) {
  return idempotentJsonMutation(path, method, payload, { parse });
}

function BarcodeCell({
  row,
  config,
}: {
  row: BarcodeLabelVariantRow;
  config: BarcodeLabelTemplateConfig;
}) {
  const selectedValue =
    config.barcodeSource === "sku" ? row.sku : row.barcode;
  const validation = validateBarcodeValue(config.barcodeFormat, selectedValue);
  const label =
    validation.code === "ean13_checksum"
      ? "EAN-13 checksum hatalı"
      : validation.code === "ean13_length"
        ? "EAN-13 değeri 13 hane olmalı"
        : validation.code === "code128_invalid"
          ? "Code 128 değeri geçersiz"
          : validation.code === "barcode_missing"
            ? `${config.barcodeSource === "sku" ? "SKU" : "Barkod"} yok`
            : undefined;
  return (
    <>
      {row.barcode ? <code>{row.barcode}</code> : <span className="missing-badge">Barkod yok</span>}
      {label ? (
        <small className="invalid-barcode-badge" role="status">
          {label}
        </small>
      ) : null}
    </>
  );
}

export function BarcodeLabelStudio({
  canManage,
  storeName,
}: {
  canManage: boolean;
  storeName: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1),
    [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS),
    [rows, setRows] = useState<readonly BarcodeLabelVariantRow[]>([]),
    [total, setTotal] = useState(0),
    [displayStoreName, setDisplayStoreName] = useState(storeName),
    [nextCursor, setNextCursor] = useState<string>(),
    [cursor, setCursor] = useState<string | undefined>(),
    [cursorHistory, setCursorHistory] = useState<string[]>([]),
    [showSelectedOnly, setShowSelectedOnly] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<string>();
  const [selection, setSelection] = useState<Map<string, BarcodeSelection>>(
      new Map(),
    ),
    [snapshots, setSnapshots] = useState<Map<string, BarcodeLabelVariantRow>>(
      new Map(),
    ),
    [options, setOptions] = useState<{
      categories: Option[];
      brands: Option[];
    }>({ categories: [], brands: [] }),
    [optionsLoading, setOptionsLoading] = useState(true),
    [optionsError, setOptionsError] = useState<string>();
  const [templateKey, setTemplateKey] = useState("retail-50x30"),
    systemTemplate =
      getSystemBarcodeLabelTemplate(templateKey) ??
      SYSTEM_BARCODE_LABEL_TEMPLATES[0]!,
    [config, setConfig] = useState<BarcodeLabelTemplateConfig>(
      systemTemplate.config,
    ),
    [templateName, setTemplateName] = useState("Mağaza etiketi"),
    [activeCustomTemplate, setActiveCustomTemplate] =
      useState<BarcodeLabelTemplate>(),
    [detachedHistoryTemplate, setDetachedHistoryTemplate] = useState(false),
    [startCell, setStartCell] = useState(0),
    [templates, setTemplates] = useState<readonly BarcodeLabelTemplate[]>([]),
    [jobs, setJobs] = useState<readonly BarcodePrintJobSummary[]>([]),
    [libraryLoading, setLibraryLoading] = useState(true),
    [libraryError, setLibraryError] = useState<string>(),
    [internalReport, setInternalReport] = useState<{
      succeeded: readonly string[];
      failed: readonly string[];
    }>({ succeeded: [], failed: [] }),
    [summaryOpen, setSummaryOpen] = useState(false),
    [busy, setBusy] = useState<string>(),
    [notice, setNotice] = useState<string>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const loadRequest = useRef(0);
  const preselectionApplied = useRef(false);
  const defaultTemplateApplied = useRef(false);
  const selectedRows = useMemo(
      () =>
        [...selection.values()]
          .map((item) => snapshots.get(item.variantId))
          .filter((row): row is BarcodeLabelVariantRow => row !== undefined),
      [selection, snapshots],
    ),
    displayedRows = showSelectedOnly ? selectedRows : rows,
    matchingSelectedIds = useMemo(
      () =>
        new Set(
          selectedRows
            .filter((row) => selectionMatchesFilter(row, filters))
            .map((row) => row.variantId),
        ),
      [filters, selectedRows],
    ),
    hidden = hiddenSelectionCount(selectedRows, filters);
  const selectedQuantity = useMemo(
    () => [...selection.values()].reduce((sum, item) => sum + item.quantity, 0),
    [selection],
  );
  const activeTemplateName = activeCustomTemplate?.name ?? systemTemplate.name;
  const buildSelectedDocument = (
    printerProfile: "a4" | "thermal" | "zebra-203" | "zebra-300",
    selectedStartCell = 0,
  ) =>
    buildLabelDocument({
      templateName: activeTemplateName,
      template: config,
      printerProfile,
      startCell: selectedStartCell,
      storeName: displayStoreName,
      items: selectedRows.map((row) => ({
        row,
        quantity: selection.get(row.variantId)?.quantity ?? 0,
      })),
    });
  const documentState = useMemo(() => {
    try {
      return {
        document: buildSelectedDocument(
          config.paperType === "a4" ? "a4" : "thermal",
          config.paperType === "a4" ? startCell : 0,
        ),
      };
    } catch {
      return { error: "Şablon ölçüleri veya alan ayarları geçersiz." };
    }
  }, [activeTemplateName, config, displayStoreName, selectedRows, selection, startCell]);
  const document = documentState.document;
  const documentErrors = document?.errors ?? [];
  const zebra203Errors = useMemo(() => {
    try {
      return buildSelectedDocument("zebra-203").errors;
    } catch {
      return [{ code: "label_document_invalid" }] as const;
    }
  }, [activeTemplateName, config, displayStoreName, selectedRows, selection]);
  const zebra300Errors = useMemo(() => {
    try {
      return buildSelectedDocument("zebra-300").errors;
    } catch {
      return [{ code: "label_document_invalid" }] as const;
    }
  }, [activeTemplateName, config, displayStoreName, selectedRows, selection]);

  const load = useCallback(
    async (activeFilters: Filters, activeCursor?: string) => {
      const requestId = ++loadRequest.current;
      setLoading(true);
      setError(undefined);
      try {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(activeFilters))
          if (value !== "") query.set(key, value);
        if (activeCursor) query.set("cursor", activeCursor);
        const value = parseBarcodeLabelListResult(
          await json(
            fetch(`/api/catalog/barcode-labels?${query}`, {
              credentials: "same-origin",
              cache: "no-store",
            }),
          ),
        );
        const preselected = [...value.items];
        setDisplayStoreName(value.storeName);
        let preselectionCursor = value.nextCursor;
        while (
          activeFilters.productId &&
          !activeCursor &&
          preselectionCursor &&
          preselected.length < 500
        ) {
          query.set("cursor", preselectionCursor);
          const page = parseBarcodeLabelListResult(
            await json(
              fetch(`/api/catalog/barcode-labels?${query}`, {
                credentials: "same-origin",
                cache: "no-store",
              }),
            ),
          );
          if (requestId !== loadRequest.current) return;
          preselected.push(...page.items);
          preselectionCursor = page.nextCursor;
        }
        if (requestId !== loadRequest.current) return;
        setRows(value.items);
        setTotal(value.catalogTotal);
        setNextCursor(value.nextCursor);
        setSnapshots((current) => {
          const next = new Map(current);
          for (const row of preselected) next.set(row.variantId, row);
          return next;
        });
        if (activeFilters.productId && !preselectionApplied.current) {
          preselectionApplied.current = true;
          setSelection((current) => {
            let next = current;
            for (const row of preselected)
              next = upsertSelection(next, row, current.get(row.variantId)?.quantity ?? 1);
            return next;
          });
          setNotice(
            preselectionCursor
              ? `İlk ${preselected.length} varyant seçildi; ürün seçim sınırını aşıyor.`
              : `${preselected.length} varyant ürün ekranından seçildi.`,
          );
        }
      } catch (caught) {
        if (requestId !== loadRequest.current) return;
        setError(caught instanceof Error ? caught.message : "unavailable");
      } finally {
        if (requestId === loadRequest.current) setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    setFilters(initialFilters());
    setCursor(initialCursor());
  }, []);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(
      () => void load(filters, cursor),
      filters.q ? 250 : 0,
    );
    return () => clearTimeout(searchTimer.current);
  }, [filters, cursor, load]);
  useEffect(() => {
    const restore = () => {
      preselectionApplied.current = false;
      setFilters(initialFilters());
      setCursor(initialCursor());
      setCursorHistory([]);
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    void refreshOptions();
    void refreshLibrary();
  }, []);
  async function refreshOptions() {
    setOptionsLoading(true);
    setOptionsError(undefined);
    try {
      const value = parseCatalogOnboardingOptions(
        await json(
          fetch("/api/catalog/onboarding/options", {
            credentials: "same-origin",
            cache: "no-store",
          }),
        ),
      );
      setOptions({
        categories: [...value.categories],
        brands: value.resources
          .filter((item) => item.kind === "brand")
          .map(({ id, name }) => ({ id, name })),
      });
    } catch (caught) {
      setOptionsError(caught instanceof Error ? caught.message : "unavailable");
    } finally {
      setOptionsLoading(false);
    }
  }
  async function refreshLibrary() {
    setLibraryLoading(true);
    setLibraryError(undefined);
    try {
      const [templatePayload, jobPayload] = await Promise.all([
        json(
          fetch("/api/catalog/barcode-label-templates", {
            credentials: "same-origin",
            cache: "no-store",
          }),
        ),
        json(
          fetch("/api/catalog/barcode-print-jobs", {
            credentials: "same-origin",
            cache: "no-store",
          }),
        ),
      ]);
      const parsedTemplates = Object.freeze(
        (templatePayload.items ?? []).map(parseBarcodeLabelTemplate),
      );
      setTemplates(parsedTemplates);
      if (!defaultTemplateApplied.current) {
        defaultTemplateApplied.current = true;
        const defaultTemplate = parsedTemplates.find(
          (template: BarcodeLabelTemplate) =>
            template.status === "active" && template.isDefault,
        );
        const untouchedDefault = getSystemBarcodeLabelTemplate("retail-50x30");
        if (
          defaultTemplate &&
          !activeCustomTemplate &&
          templateKey === "retail-50x30" &&
          config === untouchedDefault?.config
        ) {
          setConfig(defaultTemplate.config);
          setTemplateName(defaultTemplate.name);
          setActiveCustomTemplate(defaultTemplate);
          setDetachedHistoryTemplate(false);
        }
      }
      setJobs(parseBarcodePrintJobList(jobPayload.items ?? []));
    } catch (caught) {
      setLibraryError(
        caught instanceof Error ? caught.message : "unavailable",
      );
    } finally {
      setLibraryLoading(false);
    }
  }
  function updateFilter(key: keyof Filters, value: string) {
    setShowSelectedOnly(false);
    setCursor(undefined);
    setCursorHistory([]);
    setFilters((current) => {
      const next = {
        ...current,
        ...(key === "productId" ? {} : { productId: "" }),
        [key]: value,
      };
      writeUrlState(next, undefined, key === "q" ? "replace" : "push");
      return next;
    });
  }
  function selected(row: BarcodeLabelVariantRow, checked: boolean) {
    try {
      setSelection(
        checked
          ? upsertSelection(
              selection,
              row,
              selection.get(row.variantId)?.quantity ?? 1,
            )
          : new Map([...selection].filter(([id]) => id !== row.variantId)),
      );
    } catch {
      setNotice("En fazla 500 varyant ve toplam 5.000 etiket seçilebilir.");
      return;
    }
    setSnapshots((current) => new Map(current).set(row.variantId, row));
  }
  function selectPage(checked: boolean) {
    try {
      setSelection(togglePageSelection(selection, displayedRows, checked));
      setSnapshots((current) => {
        const next = new Map(current);
        for (const row of displayedRows) next.set(row.variantId, row);
        return next;
      });
    } catch {
      setNotice("En fazla 500 varyant ve toplam 5.000 etiket seçilebilir.");
    }
  }
  function setQuantity(row: BarcodeLabelVariantRow, value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
      setNotice("Etiket adedi 0 ile 10.000 arasında tam sayı olmalıdır.");
      return;
    }
    if (
      selectedQuantity - (selection.get(row.variantId)?.quantity ?? 0) + value >
      5_000
    ) {
      setNotice("Bir baskı işi en fazla 5.000 etiket içerebilir.");
      return;
    }
    setSelection((current) => upsertSelection(current, row, value));
  }
  function chooseTemplate(key: string) {
    const selected = getSystemBarcodeLabelTemplate(key);
    if (selected) {
      setTemplateKey(key);
      setActiveCustomTemplate(undefined);
      setDetachedHistoryTemplate(false);
      setConfig(selected.config);
      setStartCell(0);
    }
  }
  function applyMode(kind: "one" | "stock" | "all", quantity = 1) {
    try {
      const result = applyQuantityMode(
        selection,
        [...snapshots.values()],
        kind === "all" ? { kind, quantity } : { kind },
      );
      if (
        [...result.selection.values()].reduce(
          (total, item) => total + item.quantity,
          0,
        ) > 5_000
      ) {
        setNotice("Bir baskı işi en fazla 5.000 etiket içerebilir.");
        return;
      }
      setSelection(result.selection);
      setNotice(
        result.untracked.length
          ? `${result.untracked.length} varyantta stok takibi kapalı; miktar 0 yapıldı.`
          : undefined,
      );
    } catch {
      setNotice("Toplu miktar 0 ile 10.000 arasında tam sayı olmalıdır.");
    }
  }
  async function createJob(
    outputType: "browser" | "pdf" | "zpl",
    profile: "a4" | "thermal" | "zebra-203" | "zebra-300",
    startCell = 0,
  ) {
    if (detachedHistoryTemplate) {
      setNotice(
        "Arşivli geçmiş düzenini yeniden kullanmak için önce yeni bir mağaza şablonu olarak kaydedin.",
      );
      return;
    }
    let targetDocument;
    try {
      targetDocument = buildSelectedDocument(profile, startCell);
    } catch {
      setNotice("Şablon ölçüleri veya alan ayarları geçersiz.");
      return;
    }
    if (targetDocument.errors.length || selectedQuantity === 0) {
      setNotice(
        targetDocument.errors[0]?.message ??
          "Önce en az bir etiket seçin.",
      );
      return;
    }
    if (
      selectedQuantity > 1000 &&
      !confirm(`${selectedQuantity} etiket hazırlanacak. Devam edilsin mi?`)
    )
      return;
    const printWindow =
      outputType === "browser" ? reservePrintWindow() : null;
    setBusy(outputType);
    try {
      const job = await mutation("/api/catalog/barcode-print-jobs", "POST", {
        template: activeCustomTemplate
          ? {
              kind: "custom",
              templateId: activeCustomTemplate.id,
              expectedVersion: activeCustomTemplate.version,
            }
          : { kind: "system", key: templateKey },
        templateConfig: config,
        targets: [...selection.values()]
          .filter((item) => item.quantity > 0)
          .map(({ variantId, variantVersion, quantity }) => ({
            variantId,
            expectedVersion: variantVersion,
            quantity,
          })),
        outputType,
        printerProfile: profile,
        startCell,
      }, parseBarcodePrintJob);
      if (outputType === "browser")
        completePrintWindow(
          printWindow,
          `/products/barcode-labels/print?jobId=${job.id}`,
        );
      else
        location.assign(
          `/api/catalog/barcode-print-jobs/${job.id}/${outputType}`,
        );
      await refreshLibrary();
    } catch (caught) {
      if (outputType === "browser") cancelPrintWindow(printWindow);
      setNotice(
        caught instanceof Error ? caught.message : "Çıktı hazırlanamadı.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  async function generateInternal() {
    const targets = selectedRows
      .filter((row) => row.barcode === undefined)
      .map((row) => ({
        variantId: row.variantId,
        expectedVersion: row.variantVersion,
      }));
    if (!targets.length) {
      setNotice("Seçimde barkodsuz varyant yok.");
      return;
    }
    if (targets.length > 200) {
      setNotice("Dahili barkod tek işlemde en fazla 200 varyant için oluşturulabilir.");
      return;
    }
    if (
      !confirm(
        `${targets.length} barkodsuz varyant için CXI dahili Code 128 kimliği oluşturulsun mu?`,
      )
    )
      return;
    setBusy("internal");
    try {
      const result = await mutation(
        "/api/catalog/barcodes/internal",
        "POST",
        { targets },
        parseBarcodeInternalCreateResult,
      );
      const succeeded = new Map<
        string,
        { variantId: string; barcode: string; version: number }
      >(
        result.succeeded.map((item: { variantId: string; barcode: string; version: number }) => [item.variantId, item]),
      );
      setSelection((current) =>
        new Map(
          [...current].map(([id, item]) => {
            const generated = succeeded.get(id);
            return [
              id,
              generated
                ? { ...item, variantVersion: generated.version }
                : item,
            ];
          }),
        ),
      );
      setSnapshots((current) =>
        new Map(
          [...current].map(([id, item]) => {
            const generated = succeeded.get(id);
            return [
              id,
              generated
                ? {
                    ...item,
                    barcode: generated.barcode,
                    variantVersion: generated.version,
                  }
                : item,
            ];
          }),
        ),
      );
      setInternalReport({
        succeeded: result.succeeded.map(
          (item: { variantId: string; barcode: string }) =>
            `${snapshots.get(item.variantId)?.productTitle ?? item.variantId}: ${item.barcode} oluşturuldu`,
        ),
        failed: result.failed.map(
          (item: { variantId: string; code: string }) =>
            `${snapshots.get(item.variantId)?.productTitle ?? item.variantId}: ${INTERNAL_FAILURE_LABELS[item.code] ?? "İşlem tamamlanamadı"}`,
        ),
      });
      setNotice(
        `${result.succeeded.length} barkod oluşturuldu, ${result.failed.length} satır değişmedi.`,
      );
      await load(filters, cursor);
    } catch (caught) {
      setNotice(
        caught instanceof Error ? caught.message : "Barkod oluşturulamadı.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  async function saveTemplate() {
    setBusy("template");
    try {
      const saved = await mutation(
        activeCustomTemplate
          ? `/api/catalog/barcode-label-templates/${activeCustomTemplate.id}`
          : "/api/catalog/barcode-label-templates",
        activeCustomTemplate ? "PATCH" : "POST",
        {
          ...(activeCustomTemplate
            ? { expectedVersion: activeCustomTemplate.version }
            : {}),
          name: templateName,
          config,
          makeDefault: activeCustomTemplate?.isDefault ?? false,
        },
        parseBarcodeLabelTemplate,
      );
      setActiveCustomTemplate(parseBarcodeLabelTemplate(saved));
      setDetachedHistoryTemplate(false);
      setNotice(
        activeCustomTemplate
          ? "Mağaza şablonu güncellendi."
          : "Mağaza şablonu kaydedildi.",
      );
      await refreshLibrary();
    } catch (caught) {
      setNotice(
        caught instanceof Error ? caught.message : "Şablon kaydedilemedi.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  async function manageTemplate(
    template: BarcodeLabelTemplate,
    action: "rename" | "duplicate" | "default" | "archive",
  ) {
    if (!canManage) return;
    setBusy(`template-${template.id}`);
    try {
      let changed: BarcodeLabelTemplate;
      if (action === "archive")
        changed = await mutation(
          `/api/catalog/barcode-label-templates/${template.id}/archive`,
          "POST",
          { expectedVersion: template.version },
          parseBarcodeLabelTemplate,
        );
      else if (action === "duplicate")
        changed = await mutation(
          "/api/catalog/barcode-label-templates",
          "POST",
          {
            name: `${template.name} Kopya`,
            config: template.config,
            makeDefault: false,
          },
          parseBarcodeLabelTemplate,
        );
      else {
        const name =
          action === "rename"
            ? window.prompt("Yeni şablon adı", template.name)
            : template.name;
        if (!name) return;
        changed = await mutation(
          `/api/catalog/barcode-label-templates/${template.id}`,
          "PATCH",
          {
            expectedVersion: template.version,
            name,
            config:
              activeCustomTemplate?.id === template.id
                ? config
                : template.config,
            makeDefault: action === "default",
          },
          parseBarcodeLabelTemplate,
        );
      }
      const next = reconcileActiveTemplateMutation(
        {
          active: activeCustomTemplate,
          detached: detachedHistoryTemplate,
          name: templateName,
          config,
        },
        template.id,
        action,
        changed,
      );
      setActiveCustomTemplate(next.active);
      setDetachedHistoryTemplate(next.detached);
      setTemplateName(next.name);
      setConfig(next.config);
      setNotice(
        next.detached
          ? "Aktif şablon arşivlendi. Düzen korundu; çıktıdan önce yeni mağaza şablonu olarak kaydedin."
          : "Şablon işlemi tamamlandı.",
      );
      await refreshLibrary();
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Şablon işlemi tamamlanamadı.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  function changeConfig<K extends keyof BarcodeLabelTemplateConfig>(
    key: K,
    value: BarcodeLabelTemplateConfig[K],
  ) {
    if (key === "rows" || key === "columns") {
      const rows = key === "rows" ? Number(value) : config.rows;
      const columns = key === "columns" ? Number(value) : config.columns;
      setStartCell((current) =>
        Math.max(0, Math.min(current, rows * columns - 1)),
      );
    }
    setConfig((current) => ({ ...current, [key]: value }));
  }
  function toggleField(index: number) {
    setConfig((current) => ({
      ...current,
      fields: current.fields.map((field, i) =>
        i === index ? { ...field, visible: !field.visible } : field,
      ),
    }));
  }
  function updateField(
    index: number,
    patch: Partial<BarcodeLabelTemplateConfig["fields"][number]>,
  ) {
    setConfig((current) => ({
      ...current,
      fields: current.fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    }));
  }
  function moveField(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= config.fields.length) return;
    setConfig((current) => {
      const fields = current.fields.map((field) => ({ ...field }));
      [fields[index], fields[target]] = [fields[target]!, fields[index]!];
      return {
        ...current,
        fields: fields.map((field, order) => ({ ...field, order })),
      };
    });
  }
  async function prepareHistory(summary: BarcodePrintJobSummary) {
    setBusy(`history-${summary.id}`);
    try {
      const job: BarcodePrintJob = parseBarcodePrintJob(
        await json(
          fetch(`/api/catalog/barcode-print-jobs/${summary.id}`, {
            credentials: "same-origin",
            cache: "no-store",
          }),
        ),
      );
      setSelection(
        new Map(
          job.items.map((item) => [
            item.variantId,
            {
              variantId: item.variantId,
              variantVersion: item.snapshot.variantVersion,
              quantity: item.quantity,
            },
          ]),
        ),
      );
      setSnapshots(
        (current) =>
          new Map([
            ...current,
            ...job.items.map(
              (item) => [item.variantId, item.snapshot] as const,
            ),
          ]),
      );
      setConfig(job.templateConfig);
      setStartCell(
        job.templateConfig.paperType === "a4" ? job.startCell : 0,
      );
      const currentCustom = job.templateId
        ? templates.find(
            (template) =>
              template.id === job.templateId && template.status === "active",
          )
        : undefined;
      setActiveCustomTemplate(currentCustom);
      setTemplateName(job.templateName);
      const detachedCustom = Boolean(job.templateId && !currentCustom);
      setDetachedHistoryTemplate(detachedCustom);
      if (!job.templateId) {
        const matchingSystem =
          SYSTEM_BARCODE_LABEL_TEMPLATES.find(
            (template) => template.name === job.templateName,
          );
        if (matchingSystem) setTemplateKey(matchingSystem.key);
      }
      setNotice(
        currentCustom
          ? "Geçmiş seçim ve şablon snapshot’ı hazırlandı."
          : detachedCustom
            ? "Geçmiş custom şablon artık aktif değil. Düzen snapshot’ı korundu; çıktıdan önce yeni mağaza şablonu olarak kaydedin."
            : "Geçmiş seçim ve sistem şablonu hazırlandı.",
      );
    } catch (caught) {
      setNotice(
        caught instanceof Error
          ? caught.message
          : "Baskı işi ayrıntısı yüklenemedi.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <section className="barcode-studio" aria-labelledby="barcode-studio-title">
      <header className="barcode-studio-header">
        <div>
          <span className="eyebrow">KATALOG OPERASYONLARI</span>
          <h1 id="barcode-studio-title">Barkod ve Etiket Merkezi</h1>
          <p>Ürünlerinizi seçin, etiket düzeninizi hazırlayın ve yazdırın.</p>
        </div>
        <div className="barcode-header-meta">
          <Tag size={18} />
          <span>{total.toLocaleString("tr-TR")} varyant</span>
        </div>
      </header>
      <nav className="barcode-steps" aria-label="Etiket hazırlama adımları">
        {(
          [
            [1, "Ürünleri seç"],
            [2, "Etiketi düzenle"],
            [3, "Önizle ve yazdır"],
          ] as const
        ).map(([number, label]) => (
          <button
            key={number}
            type="button"
            className={step === number ? "active" : ""}
            onClick={() => setStep(number)}
          >
            <span>{step > number ? <Check size={14} /> : number}</span>
            {label}
          </button>
        ))}
      </nav>
      {notice ? (
        <div className="barcode-notice" role="status">
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Bildirimi kapat"
            onClick={() => setNotice(undefined)}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      <div className="barcode-workspace">
        <main className="barcode-main">
          <section
            className={`barcode-step-panel ${step === 1 ? "visible" : ""}`}
            aria-label="Ürün seçimi"
          >
            <div className="barcode-toolbar">
              <label className="barcode-search">
                <Search size={17} />
                <input
                  type="search"
                  value={filters.q}
                  onChange={(event) =>
                    updateFilter("q", event.currentTarget.value)
                  }
                  placeholder="Ürün, varyant, SKU veya barkod ara"
                  aria-label="Katalogda global ara"
                />
              </label>
              <select
                value={filters.hasBarcode}
                onChange={(e) =>
                  updateFilter("hasBarcode", e.currentTarget.value)
                }
                aria-label="Barkod filtresi"
              >
                <option value="">Tüm barkodlar</option>
                <option value="true">Barkodu olanlar</option>
                <option value="false">Barkodu olmayanlar</option>
              </select>
              <select
                value={filters.status}
                onChange={(e) => updateFilter("status", e.currentTarget.value)}
                aria-label="Ürün durumu"
              >
                <option value="">Aktif ve taslak</option>
                <option value="active">Aktif ürünler</option>
                <option value="draft">Taslak ürünler</option>
              </select>
              <select
                value={filters.stockState}
                onChange={(e) =>
                  updateFilter("stockState", e.currentTarget.value)
                }
                aria-label="Stok filtresi"
              >
                <option value="">Tüm stoklar</option>
                <option value="in_stock">Stokta</option>
                <option value="out_of_stock">Stoksuz</option>
                <option value="not_tracked">Takip edilmiyor</option>
              </select>
              <select
                value={filters.categoryId}
                disabled={optionsLoading || optionsError !== undefined}
                onChange={(e) =>
                  updateFilter("categoryId", e.currentTarget.value)
                }
                aria-label="Kategori"
              >
                <option value="">
                  {optionsLoading ? "Kategoriler yükleniyor…" : "Tüm kategoriler"}
                </option>
                {options.categories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={filters.brandId}
                disabled={optionsLoading || optionsError !== undefined}
                onChange={(e) => updateFilter("brandId", e.currentTarget.value)}
                aria-label="Marka"
              >
                <option value="">
                  {optionsLoading ? "Markalar yükleniyor…" : "Tüm markalar"}
                </option>
                {options.brands.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                value={filters.sort}
                onChange={(e) => updateFilter("sort", e.currentTarget.value)}
                aria-label="Sıralama"
              >
                <option value="updated-desc">En son güncellenen</option>
                <option value="name-asc">Ürün adı A–Z</option>
                <option value="name-desc">Ürün adı Z–A</option>
                <option value="sku-asc">SKU</option>
                <option value="barcode-asc">Barkod</option>
                <option value="stock-desc">Stok</option>
              </select>
            </div>
            {optionsError ? (
              <div className="barcode-notice" role="alert">
                <span>Filtre seçenekleri yüklenemedi: {optionsError}</span>
                <button type="button" onClick={() => void refreshOptions()}>
                  Yeniden dene
                </button>
              </div>
            ) : null}
            {hidden > 0 ? (
              <div className="hidden-selection">
                <strong>
                  {selection.size} seçili varyantın {hidden} tanesi mevcut
                  filtre dışında
                </strong>
                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSelectedOnly(true);
                    }}
                  >
                    Tüm seçilenleri göster
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSelection(
                        new Map(
                          [...selection].filter(([id]) =>
                            matchingSelectedIds.has(id),
                          ),
                        ),
                      )
                    }
                  >
                    Görünmeyenleri çıkar
                  </button>
                  <button type="button" onClick={() => setSelection(new Map())}>
                    Seçimi temizle
                  </button>
                </div>
              </div>
            ) : null}
            <div className="barcode-table-shell" aria-busy={loading}>
              {loading ? (
                <div className="barcode-skeleton">Katalog yükleniyor…</div>
              ) : error ? (
                <div className="barcode-empty">
                  <h2>Katalog yüklenemedi</h2>
                  <p>{error}</p>
                  <button
                    className="button"
                    onClick={() => void load(filters, cursor)}
                  >
                    <RefreshCw size={15} /> Tekrar dene
                  </button>
                </div>
              ) : displayedRows.length === 0 ? (
                <div className="barcode-empty">
                  <h2>
                    {filters.hasBarcode === "false"
                      ? "Barkodsuz varyant bulunamadı"
                      : "Aramanızla eşleşen varyant yok"}
                  </h2>
                  <p>Filtreleri temizleyip tekrar deneyin.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          aria-label="Sayfadaki tüm varyantları seç"
                          checked={displayedRows.every((row) =>
                            selection.has(row.variantId),
                          )}
                          onChange={(event) =>
                            selectPage(event.currentTarget.checked)
                          }
                        />
                      </th>
                      <th>Ürün</th>
                      <th>Varyant</th>
                      <th>SKU</th>
                      <th>Barkod</th>
                      <th>Fiyat</th>
                      <th>Stok</th>
                      <th>Etiket adedi</th>
                      <th>Hızlı işlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedRows.map((row) => (
                      <tr
                        key={row.variantId}
                        className={
                          selection.has(row.variantId) ? "selected" : ""
                        }
                      >
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`${row.productTitle} ${row.variantTitle} seç`}
                            checked={selection.has(row.variantId)}
                            onChange={(event) =>
                              selected(row, event.currentTarget.checked)
                            }
                          />
                        </td>
                        <td>
                          <strong>{row.productTitle}</strong>
                          <small>
                            {row.status === "active" ? "Aktif" : "Taslak"}
                          </small>
                        </td>
                        <td>{row.variantTitle}</td>
                        <td>
                          <code>{row.sku ?? "—"}</code>
                        </td>
                        <td>
                          <BarcodeCell row={row} config={config} />
                        </td>
                        <td>{money(row.priceCents, row.currency)}</td>
                        <td>{row.trackInventory ? row.stock : "Takip dışı"}</td>
                        <td>
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            max="10000"
                            step="1"
                            value={selection.get(row.variantId)?.quantity ?? 0}
                            aria-label={`${row.productTitle} etiket adedi`}
                            onFocus={() => {
                              if (!selection.has(row.variantId))
                                selected(row, true);
                            }}
                            onChange={(event) =>
                              setQuantity(
                                row,
                                Number(event.currentTarget.value),
                              )
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="icon-action"
                            type="button"
                            title="Bir etiket hazırla"
                            aria-label={`${row.productTitle} için bir etiket hazırla`}
                            onClick={() => {
                              selected(row, true);
                              setQuantity(row, 1);
                              setStep(2);
                            }}
                          >
                            <Tag size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="barcode-pagination">
              <select
                value={filters.pageSize}
                onChange={(e) =>
                  updateFilter("pageSize", e.currentTarget.value)
                }
                aria-label="Sayfa boyutu"
              >
                <option value="20">20 / sayfa</option>
                <option value="50">50 / sayfa</option>
                <option value="100">100 / sayfa</option>
              </select>
              <span>
                {displayedRows.length} gösteriliyor · {" "}
                {showSelectedOnly
                  ? `${selection.size} seçili`
                  : `${total.toLocaleString("tr-TR")} toplam`}
              </span>
              <div>
                <button
                  type="button"
                  disabled={!cursorHistory.length}
                  onClick={() => {
                    setShowSelectedOnly(false);
                    const history = [...cursorHistory];
                    const previous = history.pop();
                    setCursorHistory(history);
                    setCursor(previous);
                    writeUrlState(filters, previous, "push");
                  }}
                >
                  <ChevronLeft size={16} /> Önceki
                </button>
                <button
                  type="button"
                  disabled={!nextCursor}
                  onClick={() => {
                    setShowSelectedOnly(false);
                    setCursorHistory((history) => [...history, cursor ?? ""]);
                    setCursor(nextCursor);
                    writeUrlState(filters, nextCursor, "push");
                  }}
                >
                  Sonraki <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </section>
          <section
            className={`barcode-step-panel ${step === 2 ? "visible" : ""}`}
            aria-label="Etiket düzenleyici"
          >
            <div className="editor-grid">
              <div className="editor-card">
                <h2>Hazır şablon</h2>
                <label>
                  Şablon
                  <select
                    value={templateKey}
                    onChange={(e) => chooseTemplate(e.currentTarget.value)}
                  >
                    {SYSTEM_BARCODE_LABEL_TEMPLATES.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="dimension-grid">
                  <label>
                    Kağıt tipi
                    <select
                      value={config.paperType}
                      onChange={(event) => {
                        const paperType = event.currentTarget
                          .value as BarcodeLabelTemplateConfig["paperType"];
                        setConfig((current) =>
                          normalizePaperTypeChange(current, paperType),
                        );
                        if (paperType !== "a4") setStartCell(0);
                      }}
                    >
                      <option value="a4">A4 tabaka</option>
                      <option value="thermal-roll">Termal rulo</option>
                      <option value="custom">Özel ölçü</option>
                    </select>
                  </label>
                  <label>
                    Sektör profili
                    <select
                      value={config.sectorProfile}
                      onChange={(event) =>
                        changeConfig(
                          "sectorProfile",
                          event.currentTarget.value as BarcodeLabelTemplateConfig["sectorProfile"],
                        )
                      }
                    >
                      <option value="jewelry">Kuyumcu</option>
                      <option value="apparel">Giyim</option>
                      <option value="retail">Genel perakende</option>
                      <option value="warehouse">Depo / raf</option>
                      <option value="custom">Özel</option>
                    </select>
                  </label>
                  <label>
                    Para biçimi
                    <select
                      value={config.currencyDisplay}
                      onChange={(event) =>
                        changeConfig(
                          "currencyDisplay",
                          event.currentTarget.value as BarcodeLabelTemplateConfig["currencyDisplay"],
                        )
                      }
                    >
                      <option value="symbol">Sembol</option>
                      <option value="code">Para birimi kodu</option>
                      <option value="none">Yalnız tutar</option>
                    </select>
                  </label>
                  <label>
                    Genişlik (mm)
                    <input
                      type="number"
                      min="5"
                      max="300"
                      step="0.1"
                      value={config.widthMm}
                      onChange={(e) =>
                        changeConfig("widthMm", Number(e.currentTarget.value))
                      }
                    />
                  </label>
                  <label>
                    Yükseklik (mm)
                    <input
                      type="number"
                      min="5"
                      max="300"
                      step="0.1"
                      value={config.heightMm}
                      onChange={(e) =>
                        changeConfig("heightMm", Number(e.currentTarget.value))
                      }
                    />
                  </label>
                  <label>
                    Barkod formatı
                    <select
                      value={config.barcodeFormat}
                      onChange={(e) =>
                        changeConfig(
                          "barcodeFormat",
                          e.currentTarget.value as "code128" | "ean13",
                        )
                      }
                    >
                      <option value="code128">Code 128</option>
                      <option value="ean13">EAN-13</option>
                    </select>
                  </label>
                  <label>
                    Barkod kaynağı
                    <select
                      value={config.barcodeSource}
                      onChange={(e) =>
                        changeConfig(
                          "barcodeSource",
                          e.currentTarget.value as "barcode" | "sku",
                        )
                      }
                    >
                      <option value="barcode">Kayıtlı barkod</option>
                      <option value="sku">SKU</option>
                    </select>
                  </label>
                  <label>
                    Barkod yüksekliği
                    <input
                      type="number"
                      min="3"
                      max="100"
                      step="0.5"
                      value={config.barcodeHeightMm}
                      onChange={(e) =>
                        changeConfig(
                          "barcodeHeightMm",
                          Number(e.currentTarget.value),
                        )
                      }
                    />
                  </label>
                  <label>
                    Yön
                    <select
                      value={config.orientation}
                      disabled={config.paperType !== "a4"}
                      onChange={(e) =>
                        changeConfig(
                          "orientation",
                          e.currentTarget.value as "portrait" | "landscape",
                        )
                      }
                    >
                      <option value="portrait">Dikey</option>
                      <option value="landscape">Yatay</option>
                    </select>
                    {config.paperType !== "a4" ? (
                      <small>Rulo ve özel ölçüde yön, genişlik/yükseklik ile belirlenir.</small>
                    ) : null}
                  </label>
                  <label>
                    Satır
                    <input disabled={config.paperType !== "a4"} type="number" min="1" max="100" value={config.rows} onChange={(event) => changeConfig("rows", Number(event.currentTarget.value))} />
                  </label>
                  <label>
                    Sütun
                    <input disabled={config.paperType !== "a4"} type="number" min="1" max="20" value={config.columns} onChange={(event) => changeConfig("columns", Number(event.currentTarget.value))} />
                  </label>
                  {(["top", "right", "bottom", "left"] as const).map((edge) => (
                    <label key={edge}>
                      {({ top: "Üst", right: "Sağ", bottom: "Alt", left: "Sol" } as const)[edge]} boşluk (mm)
                      <input type="number" min="0" max="50" step="0.1" value={config.marginsMm[edge]} onChange={(event) => setConfig((current) => ({ ...current, marginsMm: { ...current.marginsMm, [edge]: Number(event.currentTarget.value) } }))} />
                    </label>
                  ))}
                  {(["horizontal", "vertical"] as const).map((axis) => (
                    <label key={axis}>
                      {axis === "horizontal" ? "Yatay" : "Dikey"} etiket aralığı (mm)
                      <input type="number" min="0" max="50" step="0.1" value={config.gapMm[axis]} onChange={(event) => setConfig((current) => ({ ...current, gapMm: { ...current.gapMm, [axis]: Number(event.currentTarget.value) } }))} />
                    </label>
                  ))}
                </div>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={config.showHumanReadable}
                    onChange={(e) =>
                      changeConfig("showHumanReadable", e.currentTarget.checked)
                    }
                  />{" "}
                  Barkod değerini de göster
                </label>
              </div>
              <div className="editor-card">
                <h2>Alanlar ve sıra</h2>
                <div className="field-list">
                  {config.fields.map((field, index) => (
                    <div key={field.key} className="field-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={field.visible}
                          onChange={() => toggleField(index)}
                        />
                        <span>{FIELD_LABELS[field.key]}</span>
                      </label>
                      <div>
                        <select
                          aria-label={`${FIELD_LABELS[field.key]} hizası`}
                          value={field.align}
                          onChange={(event) => updateField(index, { align: event.currentTarget.value as "left" | "center" | "right" })}
                        >
                          <option value="left">Sol</option>
                          <option value="center">Orta</option>
                          <option value="right">Sağ</option>
                        </select>
                        <input aria-label={`${FIELD_LABELS[field.key]} yazı boyutu`} title="Yazı boyutu" type="number" min="5" max="36" value={field.fontSizePt} onChange={(event) => updateField(index, { fontSizePt: Number(event.currentTarget.value) })} />
                        <input aria-label={`${FIELD_LABELS[field.key]} satır sınırı`} title="Satır sınırı" type="number" min="1" max="4" value={field.maxLines} onChange={(event) => updateField(index, { maxLines: Number(event.currentTarget.value) })} />
                        <label className="auto-shrink">
                          <input type="checkbox" checked={field.autoShrink} onChange={(event) => updateField(index, { autoShrink: event.currentTarget.checked })} />
                          Küçült
                        </label>
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={`${FIELD_LABELS[field.key]} yukarı taşı`}
                          onClick={() => moveField(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === config.fields.length - 1}
                          aria-label={`${FIELD_LABELS[field.key]} aşağı taşı`}
                          onClick={() => moveField(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="editor-card">
                <h2>Mağaza şablonu</h2>
                <p>Bu düzeni yalnız bu mağaza için kaydedin.</p>
                <label>
                  Şablon adı
                  <input
                    value={templateName}
                    maxLength={120}
                    onChange={(e) => setTemplateName(e.currentTarget.value)}
                  />
                </label>
                <button
                  className="button button-primary"
                  type="button"
                  disabled={!canManage || busy === "template"}
                  onClick={() => void saveTemplate()}
                >
                  {activeCustomTemplate ? "Değişiklikleri kaydet" : "Kaydet"}
                </button>
                {libraryError ? (
                  <div className="blocking-errors" role="alert">
                    <span>Şablonlar yüklenemedi: {libraryError}</span>
                    <button type="button" onClick={() => void refreshLibrary()}>
                      Yeniden dene
                    </button>
                  </div>
                ) : libraryLoading ? (
                  <small>Mağaza şablonları yükleniyor…</small>
                ) : templates.length ? (
                  <div className="saved-list">
                    {templates.map((template) => (
                      <div className="saved-template-row" key={template.id}>
                        <button
                          type="button"
                          disabled={template.status === "archived"}
                          onClick={() => {
                            if (template.status !== "active") return;
                            setConfig(template.config);
                            setStartCell(0);
                            setTemplateName(template.name);
                            setActiveCustomTemplate(template);
                            setDetachedHistoryTemplate(false);
                          }}
                        >
                          <span>{template.name}</span>
                          <small>
                            {template.isDefault ? "Varsayılan · " : ""}
                            {template.status === "archived"
                              ? "Arşivli"
                              : "Aktif"}
                          </small>
                        </button>
                        {canManage && template.status === "active" ? (
                          <div>
                            <button
                              type="button"
                              onClick={() =>
                                void manageTemplate(template, "rename")
                              }
                            >
                              Yeniden adlandır
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void manageTemplate(template, "duplicate")
                              }
                            >
                              Çoğalt
                            </button>
                            <button
                              type="button"
                              disabled={template.isDefault}
                              onClick={() =>
                                void manageTemplate(template, "default")
                              }
                            >
                              Varsayılan
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void manageTemplate(template, "archive")
                              }
                            >
                              Arşivle
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <small>Henüz mağaza şablonu yok.</small>
                )}
              </div>
            </div>
          </section>
          <section
            className={`barcode-step-panel ${step === 3 ? "visible" : ""}`}
            aria-label="Önizleme ve çıktı"
          >
            <div className="output-panel">
              <div>
                <h2>Çıktı ayarları</h2>
                <div className="quantity-modes">
                  <button type="button" onClick={() => applyMode("one")}>
                    Her varyanttan 1
                  </button>
                  <button type="button" onClick={() => applyMode("stock")}>
                    Stok kadar
                  </button>
                  <label>
                    Toplu miktar
                    <input
                      type="number"
                      min="0"
                      max="10000"
                      defaultValue="1"
                      onBlur={(e) =>
                        applyMode("all", Number(e.currentTarget.value))
                      }
                    />
                  </label>
                  {config.paperType === "a4" ? (
                    <label>
                      İlk hücreyi atla
                      <input
                        type="number"
                        min="0"
                        max={config.rows * config.columns - 1}
                        value={startCell}
                        onChange={(event) =>
                          setStartCell(
                            Math.max(
                              0,
                              Math.min(
                                config.rows * config.columns - 1,
                                Number(event.currentTarget.value),
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                  ) : null}
                </div>
                {canManage ? (
                  <button
                    className="button"
                    type="button"
                    disabled={busy === "internal"}
                    onClick={() => void generateInternal()}
                  >
                    Dahili barkod oluştur
                  </button>
                ) : null}
                {internalReport.succeeded.length || internalReport.failed.length ? (
                  <div className="internal-report" role="status">
                    {internalReport.succeeded.length ? (
                      <><strong>Başarılı</strong>{internalReport.succeeded.map((line) => <span key={line}>{line}</span>)}</>
                    ) : null}
                    {internalReport.failed.length ? (
                      <><strong>Değiştirilmeyenler</strong>{internalReport.failed.map((line) => <span key={line}>{line}</span>)}</>
                    ) : null}
                  </div>
                ) : null}
                <div className="output-actions">
                  <button
                    className="button button-primary"
                    disabled={
                      !canManage ||
                      !!busy ||
                      detachedHistoryTemplate ||
                      !document ||
                      documentErrors.length > 0 ||
                      selectedQuantity === 0
                    }
                    onClick={() =>
                      void createJob(
                        "browser",
                        config.paperType === "a4" ? "a4" : "thermal",
                        config.paperType === "a4" ? startCell : 0,
                      )
                    }
                  >
                    <Printer size={16} /> Yazdır
                  </button>
                  <button
                    className="button"
                    disabled={
                      !canManage ||
                      !!busy ||
                      detachedHistoryTemplate ||
                      !document ||
                      documentErrors.length > 0 ||
                      selectedQuantity === 0
                    }
                    onClick={() =>
                      void createJob(
                        "pdf",
                        config.paperType === "a4" ? "a4" : "thermal",
                        config.paperType === "a4" ? startCell : 0,
                      )
                    }
                  >
                    <FileText size={16} /> PDF indir
                  </button>
                  <button
                    className="button"
                    disabled={
                      !canManage ||
                      !!busy ||
                      detachedHistoryTemplate ||
                      config.paperType === "a4" ||
                      zebra203Errors.length > 0 ||
                      !document ||
                      documentErrors.length > 0 ||
                      selectedQuantity === 0
                    }
                    onClick={() => void createJob("zpl", "zebra-203")}
                  >
                    <Download size={16} /> ZPL 203
                  </button>
                  <button
                    className="button"
                    disabled={
                      !canManage ||
                      !!busy ||
                      detachedHistoryTemplate ||
                      config.paperType === "a4" ||
                      zebra300Errors.length > 0 ||
                      !document ||
                      documentErrors.length > 0 ||
                      selectedQuantity === 0
                    }
                    onClick={() => void createJob("zpl", "zebra-300")}
                  >
                    <Download size={16} /> ZPL 300
                  </button>
                </div>
                {config.paperType !== "a4" ? (
                  <div className="zpl-disclosure">
                    <small>
                      Türkçe karakterler Zebra uyumluluğu için ASCII’ye
                      dönüştürülür; fiziksel cihaz uyumu doğrulanmadı.
                    </small>
                    {zebra203Errors.length ? (
                      <span>
                        ZPL 203 engeli: {"message" in zebra203Errors[0]!
                          ? zebra203Errors[0]!.message
                          : "Şablon veya barkod bu profile uygun değil."}
                      </span>
                    ) : null}
                    {zebra300Errors.length ? (
                      <span>
                        ZPL 300 engeli: {"message" in zebra300Errors[0]!
                          ? zebra300Errors[0]!.message
                          : "Şablon veya barkod bu profile uygun değil."}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {documentState.error || documentErrors.length ? (
                  <div className="blocking-errors">
                    <strong>Çıktı engellendi</strong>
                    {documentState.error ? (
                      <span>{documentState.error}</span>
                    ) : null}
                    {documentErrors.slice(0, 5).map((error) => (
                      <span key={`${error.variantId}-${error.code}`}>
                        {snapshots.get(error.variantId)?.productTitle}:{" "}
                        {error.message}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div>
                <h2>
                  <History size={18} /> Son baskı işleri
                </h2>
                <div className="job-list">
                  {libraryError ? (
                    <button type="button" onClick={() => void refreshLibrary()}>
                      Baskı geçmişini yeniden yükle
                    </button>
                  ) : libraryLoading ? (
                    <p>Baskı geçmişi yükleniyor…</p>
                  ) : jobs.length ? (
                    jobs.slice(0, 8).map((job) => (
                      <button
                        type="button"
                        key={job.id}
                        disabled={!canManage || busy === `history-${job.id}`}
                        onClick={() => void prepareHistory(job)}
                      >
                        <span>{job.templateName}</span>
                        <small>
                          {job.labelCount} etiket ·{" "}
                          {job.outputType.toUpperCase()} ·{" "}
                          {new Date(job.createdAt).toLocaleString("tr-TR")}
                        </small>
                      </button>
                    ))
                  ) : (
                    <p>Henüz baskı işi yok.</p>
                  )}
                </div>
                <small>
                  Tekrar hazırlama baskı anındaki güvenli snapshot&apos;ı kullanır;
                  ürün daha sonra değiştiyse sürüm kontrolü çıktıyı engeller.
                </small>
              </div>
            </div>
          </section>
        </main>
        <aside className={`barcode-summary ${summaryOpen ? "open" : ""}`}>
          <div className="summary-heading">
            <span>CANLI ÖZET</span>
            <button
              type="button"
              aria-label="Özeti aç veya kapat"
              aria-expanded={summaryOpen}
              onClick={() => setSummaryOpen((open) => !open)}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <dl>
            <div>
              <dt>Seçili varyant</dt>
              <dd>{selection.size}</dd>
            </div>
            <div>
              <dt>Toplam etiket</dt>
              <dd>{selectedQuantity}</dd>
            </div>
            <div>
              <dt>Şablon</dt>
              <dd>{activeTemplateName}</dd>
            </div>
            <div>
              <dt>Ölçü</dt>
              <dd>
                {config.widthMm} × {config.heightMm} mm
              </dd>
            </div>
            <div>
              <dt>Profil</dt>
              <dd>
                {config.paperType === "a4"
                  ? `A4 · ${config.columns} × ${config.rows}`
                  : "Termal rulo"}
              </dd>
            </div>
            <div>
              <dt>Tahmini kullanım</dt>
              <dd>
                {config.paperType === "a4"
                  ? `${Math.ceil((startCell + selectedQuantity) / (config.columns * config.rows))} sayfa`
                  : `${selectedQuantity} etiket`}
              </dd>
            </div>
          </dl>
          <div className="preview-stage">
            {document?.items[0] &&
            !documentErrors.some(
              (error) => error.variantId === document.items[0]!.variantId,
            ) ? (
              <BarcodePreview
                item={document.items[0]}
                template={document.template}
              />
            ) : (
              <div className="preview-placeholder">
                <Tag size={24} />
                <span>Önizleme için geçerli barkodlu bir varyant seçin</span>
              </div>
            )}
          </div>
          <button
            className="button button-primary summary-next"
            type="button"
            disabled={selection.size === 0}
            onClick={() => setStep(step === 1 ? 2 : 3)}
          >
            {step === 1 ? "Etiketi düzenle" : "Önizle ve yazdır"}
            <ChevronRight size={16} />
          </button>
          <button
            className="clear-selection"
            type="button"
            disabled={!selection.size}
            onClick={() => setSelection(new Map())}
          >
            Bütün seçimi temizle
          </button>
        </aside>
      </div>
    </section>
  );
}
