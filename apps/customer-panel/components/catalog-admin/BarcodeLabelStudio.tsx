"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import {
  Barcode,
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
import {
  assertLabelPricesMatchPreview,
  buildLabelDocument,
} from "@/lib/barcode-labels/document.ts";
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
  const selectedValue = config.barcodeSource === "sku" ? row.sku : row.barcode;
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
      {selectedValue ? <code>{selectedValue}</code> : null}
      {label ? (
        <small className="invalid-barcode-badge" role="status">
          {label}
        </small>
      ) : null}
    </>
  );
}

function startingCellLimit(
  config: Pick<BarcodeLabelTemplateConfig, "rows" | "columns">,
) {
  if (
    !Number.isSafeInteger(config.rows) ||
    !Number.isSafeInteger(config.columns) ||
    config.rows < 1 ||
    config.columns < 1
  )
    return 0;
  return Math.min(47, config.rows * config.columns - 1);
}
function clampStartCell(
  value: number,
  config: Pick<BarcodeLabelTemplateConfig, "rows" | "columns">,
) {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(startingCellLimit(config), Math.floor(value)))
    : 0;
}
function StudioDialog({
  open,
  onClose,
  title,
  className,
  children,
}: {
  open: boolean;
  onClose(): void;
  title: string;
  className: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={dialogRef}
      className={className}
      aria-label={title}
      onClose={onClose}
    >
      <header>
        <h2>{title}</h2>
        <button type="button" aria-label={`${title} kapat`} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function PaperArtwork({
  type,
}: {
  type: BarcodeLabelTemplateConfig["paperType"];
}) {
  return (
    <svg
      className="barcode-paper-art"
      viewBox="0 0 120 78"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "thermal-roll" ? (
        <>
          <path fill="#e9e3dc" d="M24 20h52a16 16 0 0 1 0 32H38" />
          <ellipse cx="24" cy="36" rx="16" ry="20" fill="#f8f7f5" />
          <ellipse cx="24" cy="36" rx="5" ry="7" />
          <path fill="white" d="M40 36h60v28H40z" />
          <path d="M52 43v14m4-14v14m5-14v14m3-14v14m6-14v14m3-14v14m6-14v14m5-14v14" />
          <path d="M43 69h52" stroke="#cfb89f" />
        </>
      ) : type === "a4" ? (
        <>
          <path fill="white" d="M34 5h43l10 10v57H34z" />
          <path d="M77 5v10h10" />
          <g fill="#ede7df">
            {[0, 1, 2].map((row) =>
              [0, 1].map((col) => (
                <rect
                  key={`${row}-${col}`}
                  x={42 + col * 20}
                  y={23 + row * 14}
                  width="15"
                  height="9"
                  rx="2"
                />
              )),
            )}
          </g>
          <path d="M21 15v46m-3-43 3-3 3 3m-6 40 3 3 3-3" stroke="#cfb89f" />
        </>
      ) : (
        <>
          <rect fill="white" x="24" y="20" width="72" height="39" rx="6" />
          <path d="M40 29v20m4-20v20m6-20v20m4-20v20m7-20v20m3-20v20m7-20v20m5-20v20" />
          <path
            d="M24 10h72m-68-3-4 3 4 3m64-6 4 3-4 3M107 20v39m-3-35 3-4 3 4m-6 31 3 4 3-4"
            stroke="#cfb89f"
          />
          <circle cx="18" cy="64" r="3" fill="#ede7df" />
        </>
      )}
    </svg>
  );
}

export function BarcodeLabelStudio({
  canManage,
  storeName,
}: {
  canManage: boolean;
  storeName: string;
}) {
  const [previewVariantId, setPreviewVariantId] = useState<string>(),
    [bulkQuantity, setBulkQuantity] = useState("1"),
    [historyOpen, setHistoryOpen] = useState(false),
    [templatesOpen, setTemplatesOpen] = useState(false);
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
  const templateEdited = useRef(false);
  const pendingAction = useRef(false);
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
    } catch (caught) {
      return {
        error:
          caught instanceof Error &&
          caught.message === "label_document_price_unavailable"
            ? "Referans fiyatı kullanılamıyor; bu varyant için etiket hazırlanamaz."
            : "Şablon ölçüleri veya alan ayarları geçersiz.",
      };
    }
  }, [
    activeTemplateName,
    config,
    displayStoreName,
    selectedRows,
    selection,
    startCell,
  ]);
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

  const maxStartCell = startingCellLimit(config);
  const paperUsage =
    config.paperType === "a4"
      ? Number.isSafeInteger(config.rows) &&
        Number.isSafeInteger(config.columns) &&
        config.rows > 0 &&
        config.columns > 0
        ? Math.ceil(
            (startCell + selectedQuantity) / (config.rows * config.columns),
          )
        : "—"
      : selectedQuantity;
  const missingBarcodeRows = selectedRows.filter((row) => !row.barcode);
  const previewIndex = Math.max(
    0,
    selectedRows.findIndex((row) => row.variantId === previewVariantId),
  );
  const previewRow = selectedRows[previewIndex];
  const previewItem = document?.items.find(
    (item) => item.variantId === previewRow?.variantId,
  );
  const previewErrors = documentErrors.filter(
    (error) => error.variantId === previewRow?.variantId,
  );
  const outputReady = Boolean(
    document &&
      !documentErrors.length &&
      selectedQuantity > 0 &&
      !detachedHistoryTemplate,
  );
  const correctionStep: 1 | 2 =
    config.barcodeSource === "barcode" &&
    documentErrors.some((error) => error.code === "barcode_missing")
      ? 1
      : 2;
  function guardPendingInteraction(event: SyntheticEvent) {
    if (pendingAction.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  }
  function navigatePreview(direction: -1 | 1) {
    if (pendingAction.current) return;
    const row =
      selectedRows[
        (previewIndex + direction + selectedRows.length) % selectedRows.length
      ];
    if (row) setPreviewVariantId(row.variantId);
  }
  function choosePaper(paperType: BarcodeLabelTemplateConfig["paperType"]) {
    if (pendingAction.current) return;
    if (paperType === config.paperType) return;
    templateEdited.current = true;
    setConfig((current) => normalizePaperTypeChange(current, paperType));
    if (paperType !== "a4") setStartCell(0);
  }

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
            fetch(`/api/catalog/barcode-labels/v2?${query}`, {
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
              fetch(`/api/catalog/barcode-labels/v2?${query}`, {
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
            for (const row of preselected.filter(
              (candidate) => candidate.priceCents !== null,
            ))
              next = upsertSelection(
                next,
                row,
                current.get(row.variantId)?.quantity ?? 1,
              );
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
          !templateEdited.current &&
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
      setLibraryError(caught instanceof Error ? caught.message : "unavailable");
    } finally {
      setLibraryLoading(false);
    }
  }
  function updateFilter(key: keyof Filters, value: string) {
    if (pendingAction.current) return;
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
    if (pendingAction.current) return;
    if (checked && row.priceCents === null) {
      setNotice(
        "Referans fiyatı kullanılamıyor; bu varyant için etiket hazırlanamaz.",
      );
      return;
    }
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
    if (pendingAction.current) return;
    try {
      setSelection(
        togglePageSelection(
          selection,
          displayedRows.filter((row) => row.priceCents !== null),
          checked,
        ),
      );
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
    if (pendingAction.current) return false;
    if (row.priceCents === null) {
      setNotice(
        "Referans fiyatı kullanılamıyor; bu varyant için etiket hazırlanamaz.",
      );
      return false;
    }
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
      setNotice("Etiket adedi 0 ile 10.000 arasında tam sayı olmalıdır.");
      return false;
    }
    if (
      selectedQuantity - (selection.get(row.variantId)?.quantity ?? 0) + value >
      5_000
    ) {
      setNotice("Bir baskı işi en fazla 5.000 etiket içerebilir.");
      return false;
    }
    try {
      const next =
        value === 0
          ? new Map(selection)
          : upsertSelection(selection, row, value);
      if (value === 0) next.delete(row.variantId);
      setSelection(next);
      setSnapshots((current) => new Map(current).set(row.variantId, row));
      return true;
    } catch {
      setNotice("En fazla 500 varyant ve 5.000 etiket seçebilirsiniz.");
      return false;
    }
  }
  function chooseTemplate(key: string) {
    if (pendingAction.current) return;
    templateEdited.current = true;
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
    if (pendingAction.current) return;
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
      setSelection(
        new Map([...result.selection].filter(([, item]) => item.quantity > 0)),
      );
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
    if (!canManage || pendingAction.current) return;
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
        targetDocument.errors[0]?.message ?? "Önce en az bir etiket seçin.",
      );
      return;
    }
    if (
      selectedQuantity > 1000 &&
      !confirm(`${selectedQuantity} etiket hazırlanacak. Devam edilsin mi?`)
    )
      return;
    const printWindow = outputType === "browser" ? reservePrintWindow() : null;
    templateEdited.current = true;
    pendingAction.current = true;
    setBusy(outputType);
    try {
      const job = await mutation(
        "/api/catalog/barcode-print-jobs/v2",
        "POST",
        {
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
        },
        parseBarcodePrintJob,
      );
      try {
        assertLabelPricesMatchPreview(
          targetDocument.items.map((item) => item.source),
          job.items.map((item) => item.snapshot),
        );
      } catch {
        if (outputType === "browser") cancelPrintWindow(printWindow);
        setSnapshots((current) => {
          const next = new Map(current);
          for (const item of job.items) next.set(item.variantId, item.snapshot);
          return next;
        });
        setNotice(
          "Etiket fiyatı değişti. Güncel önizlemeyi kontrol edip yeniden hazırlayın; çıktı açılmadı.",
        );
        await refreshLibrary();
        return;
      }
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
      pendingAction.current = false;
      setBusy(undefined);
    }
  }
  async function generateInternal() {
    if (!canManage || pendingAction.current) return;
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
      setNotice(
        "Dahili barkod tek işlemde en fazla 200 varyant için oluşturulabilir.",
      );
      return;
    }
    if (
      !confirm(
        `${targets.length} barkodsuz varyant için 98 veya 99 ile başlayan 13 haneli dahili barkod oluşturulsun mu?`,
      )
    )
      return;
    pendingAction.current = true;
    setBusy("internal");
    try {
      const result = await idempotentJsonMutation(
        "/api/catalog/barcodes/internal/ean13",
        "POST",
        { targets },
        {
          parse: parseBarcodeInternalCreateResult,
          headers: { "x-celebix-internal-barcode-format": "ean13" },
        },
      );
      const succeeded = new Map<
        string,
        { variantId: string; barcode: string; version: number }
      >(
        result.succeeded.map(
          (item: { variantId: string; barcode: string; version: number }) => [
            item.variantId,
            item,
          ],
        ),
      );
      setSelection(
        (current) =>
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
      setSnapshots(
        (current) =>
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
      pendingAction.current = false;
      setBusy(undefined);
    }
  }
  async function saveTemplate() {
    if (!canManage || pendingAction.current) return;
    templateEdited.current = true;
    pendingAction.current = true;
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
      pendingAction.current = false;
      setBusy(undefined);
    }
  }
  async function manageTemplate(
    template: BarcodeLabelTemplate,
    action: "rename" | "duplicate" | "default" | "archive",
  ) {
    if (!canManage || pendingAction.current) return;
    if (!canManage) return;
    pendingAction.current = true;
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
      pendingAction.current = false;
      setBusy(undefined);
    }
  }
  function changeConfig<K extends keyof BarcodeLabelTemplateConfig>(
    key: K,
    value: BarcodeLabelTemplateConfig[K],
  ) {
    if (pendingAction.current) return;
    templateEdited.current = true;
    if (key === "rows" || key === "columns") {
      const rows = key === "rows" ? Number(value) : config.rows;
      const columns = key === "columns" ? Number(value) : config.columns;
      setStartCell((current) => clampStartCell(current, { rows, columns }));
    }
    setConfig((current) => ({ ...current, [key]: value }));
  }
  function toggleField(index: number) {
    if (pendingAction.current) return;
    templateEdited.current = true;
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
    if (pendingAction.current) return;
    templateEdited.current = true;
    setConfig((current) => ({
      ...current,
      fields: current.fields.map((field, position) =>
        position === index ? { ...field, ...patch } : field,
      ),
    }));
  }
  function moveField(index: number, direction: -1 | 1) {
    if (pendingAction.current) return;
    templateEdited.current = true;
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
    if (!canManage || pendingAction.current) return;
    pendingAction.current = true;
    setBusy(`history-${summary.id}`);
    try {
      const job: BarcodePrintJob = parseBarcodePrintJob(
        await json(
          fetch(`/api/catalog/barcode-print-jobs/v2/${summary.id}`, {
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
      templateEdited.current = true;
      setConfig(job.templateConfig);
      setStartCell(
        job.templateConfig.paperType === "a4"
          ? clampStartCell(job.startCell, job.templateConfig)
          : 0,
      );
      setStep(3);
      setHistoryOpen(false);
      setPreviewVariantId(job.items[0]?.variantId);
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
        const matchingSystem = SYSTEM_BARCODE_LABEL_TEMPLATES.find(
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
      pendingAction.current = false;
      setBusy(undefined);
    }
  }
  return (
    <section className="barcode-studio" aria-labelledby="barcode-studio-title">
      <h1 id="barcode-studio-title" className="barcode-sr-only">
        Barkod etiketleri
      </h1>
      <div className="barcode-flow-head">
        <nav className="barcode-steps" aria-label="Etiket hazırlama adımları">
          {(
            [
              [1, "Ürünleri seç"],
              [2, "Etiketi düzenle"],
              [3, "Baskıyı hazırla"],
            ] as const
          ).map(([number, label]) => (
            <button
              key={number}
              type="button"
              className={step === number ? "active" : ""}
              aria-current={step === number ? "step" : undefined}
              disabled={!!busy}
              onClick={() => setStep(number)}
            >
              <span>
                {(number === 1 && selectedQuantity > 0 && step > 1) ||
                (number === 2 && outputReady && step > 2) ? (
                  <Check size={14} />
                ) : (
                  number
                )}
              </span>
              {label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="barcode-history-button"
          disabled={!!busy}
          onClick={() => setHistoryOpen(true)}
        >
          <History size={16} />
          Baskı geçmişi
        </button>
      </div>
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
      {!canManage ? (
        <div className="barcode-notice" role="status">
          Görüntüleme erişimi · barkod ve baskı işlemleri kapalı.
        </div>
      ) : null}
      <fieldset
        className="barcode-workspace barcode-studio-grid"
        disabled={!!busy}
        aria-label="Etiket çalışma alanı"
        onClickCapture={guardPendingInteraction}
        onChangeCapture={guardPendingInteraction}
      >
        <main className="barcode-main barcode-studio-main">
          <section
            className={`barcode-step-panel ${step === 1 ? "visible" : ""}`}
            hidden={step !== 1}
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
              <label className="barcode-filter">
                <span>Barkod</span>
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
              </label>
              <label className="barcode-filter">
                <span>Durum</span>
                <select
                  value={filters.status}
                  onChange={(e) =>
                    updateFilter("status", e.currentTarget.value)
                  }
                  aria-label="Ürün durumu"
                >
                  <option value="">Aktif ve taslak</option>
                  <option value="active">Aktif ürünler</option>
                  <option value="draft">Taslak ürünler</option>
                </select>
              </label>
              <label className="barcode-filter">
                <span>Stok</span>
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
              </label>
              <label className="barcode-filter">
                <span>Kategori</span>
                <select
                  value={filters.categoryId}
                  disabled={optionsLoading || optionsError !== undefined}
                  onChange={(e) =>
                    updateFilter("categoryId", e.currentTarget.value)
                  }
                  aria-label="Kategori"
                >
                  <option value="">
                    {optionsLoading
                      ? "Kategoriler yükleniyor…"
                      : "Tüm kategoriler"}
                  </option>
                  {options.categories.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="barcode-filter">
                <span>Marka</span>
                <select
                  value={filters.brandId}
                  disabled={optionsLoading || optionsError !== undefined}
                  onChange={(e) =>
                    updateFilter("brandId", e.currentTarget.value)
                  }
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
              </label>
              <label className="barcode-filter">
                <span>Sıralama</span>
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
              </label>
            </div>

            {optionsError ? (
              <div className="barcode-notice" role="alert">
                <span>Filtre seçenekleri yüklenemedi: {optionsError}</span>
                <button type="button" onClick={() => void refreshOptions()}>
                  Yeniden dene
                </button>
              </div>
            ) : null}

            <div className="barcode-selection-tools">
              <div className="barcode-selection-status">
                <strong>{selection.size} varyant</strong>
                <span>{selectedQuantity.toLocaleString("tr-TR")} etiket</span>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={showSelectedOnly}
                    onChange={(e) =>
                      setShowSelectedOnly(e.currentTarget.checked)
                    }
                  />
                  Yalnız seçilenler
                </label>
                <button
                  type="button"
                  disabled={!selection.size || !!busy}
                  onClick={() => setSelection(new Map())}
                >
                  Seçimi temizle
                </button>
              </div>
              {hidden > 0 ? (
                <div className="hidden-selection">
                  <span>{hidden} seçili varyant filtre dışında</span>
                  <button
                    type="button"
                    onClick={() => setShowSelectedOnly(true)}
                  >
                    Seçilenleri göster
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
                    Filtre dışındakileri çıkar
                  </button>
                </div>
              ) : null}
              <div
                className="quantity-modes"
                role="group"
                aria-label="Etiket adetleri"
              >
                <button
                  type="button"
                  disabled={!selection.size || !!busy}
                  onClick={() => applyMode("one")}
                >
                  Her varyanttan 1
                </button>
                <button
                  type="button"
                  disabled={!selection.size || !!busy}
                  onClick={() => applyMode("stock")}
                >
                  Stok kadar
                </button>
                <label>
                  Toplu adet
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    step="1"
                    value={bulkQuantity}
                    onChange={(e) => setBulkQuantity(e.currentTarget.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={
                    !selection.size || !!busy || bulkQuantity.trim() === ""
                  }
                  onClick={() => applyMode("all", Number(bulkQuantity))}
                >
                  Uygula
                </button>
              </div>
              {missingBarcodeRows.length > 0 ? (
                <div className="barcode-missing-action">
                  <span>
                    {missingBarcodeRows.length} seçili varyantta barkod eksik
                  </span>
                  <button
                    type="button"
                    disabled={
                      !canManage || !!busy || missingBarcodeRows.length > 200
                    }
                    onClick={() => void generateInternal()}
                  >
                    <Barcode size={16} />
                    {busy === "internal"
                      ? "Oluşturuluyor…"
                      : "Dahili barkod oluştur"}
                  </button>
                  {missingBarcodeRows.length > 200 ? (
                    <small>
                      Tek işlemde en fazla 200 barkod oluşturulabilir.
                    </small>
                  ) : null}
                </div>
              ) : null}
              {internalReport.succeeded.length ||
              internalReport.failed.length ? (
                <details className="internal-report">
                  <summary>
                    {internalReport.succeeded.length} oluşturuldu ·{" "}
                    {internalReport.failed.length} değiştirilmedi
                  </summary>
                  <div role="status">
                    {internalReport.succeeded.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                    {internalReport.failed.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
            <div
              className="barcode-table-shell barcode-table-wrap"
              aria-busy={loading}
            >
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
                        <label className="barcode-checkbox-control">
                          <input
                            type="checkbox"
                            aria-label="Sayfadaki tüm varyantları seç"
                            checked={
                              displayedRows.some(
                                (row) => row.priceCents !== null,
                              ) &&
                              displayedRows
                                .filter((row) => row.priceCents !== null)
                                .every((row) => selection.has(row.variantId))
                            }
                            onChange={(event) =>
                              selectPage(event.currentTarget.checked)
                            }
                          />
                        </label>
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
                        <td data-label="Seç">
                          <label className="barcode-checkbox-control">
                            <input
                              type="checkbox"
                              aria-label={`${row.productTitle} ${row.variantTitle} seç`}
                              checked={selection.has(row.variantId)}
                              disabled={row.priceCents === null}
                              onChange={(event) =>
                                selected(row, event.currentTarget.checked)
                              }
                            />
                          </label>
                        </td>
                        <td data-label="Ürün">
                          <strong>{row.productTitle}</strong>
                          <small>
                            {row.status === "active" ? "Aktif" : "Taslak"}
                          </small>
                        </td>
                        <td data-label="Varyant">{row.variantTitle}</td>
                        <td data-label="SKU">
                          <code>{row.sku ?? "—"}</code>
                        </td>
                        <td data-label="Barkod">
                          <BarcodeCell row={row} config={config} />
                        </td>
                        <td data-label="Fiyat">
                          {row.priceCents === null ? (
                            <span role="status">Fiyat güncelleniyor</span>
                          ) : (
                            money(row.priceCents, row.currency)
                          )}
                        </td>
                        <td data-label="Stok">
                          {row.trackInventory ? row.stock : "Takip dışı"}
                        </td>
                        <td data-label="Etiket adedi">
                          <input
                            className="quantity-input"
                            type="number"
                            min="0"
                            max="10000"
                            step="1"
                            value={selection.get(row.variantId)?.quantity ?? 0}
                            aria-label={`${row.productTitle} etiket adedi`}
                            disabled={row.priceCents === null}
                            onChange={(event) =>
                              setQuantity(
                                row,
                                Number(event.currentTarget.value),
                              )
                            }
                          />
                        </td>
                        <td data-label="Hızlı işlem">
                          <button
                            className="icon-action"
                            type="button"
                            title="Bir etiket hazırla"
                            aria-label={`${row.productTitle} için bir etiket hazırla`}
                            disabled={row.priceCents === null}
                            onClick={() => {
                              if (setQuantity(row, 1)) setStep(2);
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
                {displayedRows.length} gösteriliyor ·{" "}
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
            hidden={step !== 2}
            aria-label="Etiket düzenleyici"
          >
            <div className="editor-grid">
              <div className="editor-card">
                <h2>Kağıt ve ölçü</h2>
                <div
                  className="barcode-paper-options"
                  role="group"
                  aria-label="Kağıt tipi"
                >
                  {(
                    [
                      ["thermal-roll", "Termal rulo", "Tek tek etiket"],
                      ["a4", "A4 tabaka", "Çoklu etiket"],
                      ["custom", "Özel ölçü", "Kendi ölçünüz"],
                    ] as const
                  ).map(([value, label, hint]) => (
                    <button
                      type="button"
                      key={value}
                      className={`barcode-paper-option ${config.paperType === value ? "active" : ""}`}
                      aria-pressed={config.paperType === value}
                      onClick={() => choosePaper(value)}
                    >
                      <PaperArtwork type={value} />
                      <strong>{label}</strong>
                      <small>{hint}</small>
                    </button>
                  ))}
                </div>
                <div className="barcode-preset-row">
                  <label>
                    Hazır şablon
                    <select
                      value={
                        activeCustomTemplate || detachedHistoryTemplate
                          ? "__custom__"
                          : templateKey
                      }
                      onChange={(e) => chooseTemplate(e.currentTarget.value)}
                    >
                      {activeCustomTemplate || detachedHistoryTemplate ? (
                        <option value="__custom__">{activeTemplateName}</option>
                      ) : null}
                      {SYSTEM_BARCODE_LABEL_TEMPLATES.map((template) => (
                        <option key={template.key} value={template.key}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" onClick={() => setTemplatesOpen(true)}>
                    Mağaza şablonları
                  </button>
                </div>
                <div
                  className="barcode-size-options"
                  aria-label="Ölçü seçenekleri"
                >
                  {SYSTEM_BARCODE_LABEL_TEMPLATES.filter(
                    (template) =>
                      template.config.paperType === config.paperType &&
                      (config.paperType === "a4" ||
                        template.key.startsWith("thermal-")),
                  ).map((template) => (
                    <button
                      type="button"
                      key={template.key}
                      aria-label={template.name}
                      title={template.name}
                      aria-pressed={
                        !activeCustomTemplate && templateKey === template.key
                      }
                      onClick={() => chooseTemplate(template.key)}
                    >
                      {template.config.widthMm} × {template.config.heightMm}
                      <small>
                        {config.paperType === "a4"
                          ? `${template.config.columns} × ${template.config.rows}`
                          : "mm"}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="dimension-grid">
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
                    Sektör profili
                    <select
                      value={config.sectorProfile}
                      onChange={(e) =>
                        changeConfig(
                          "sectorProfile",
                          e.currentTarget
                            .value as BarcodeLabelTemplateConfig["sectorProfile"],
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
                      onChange={(e) =>
                        changeConfig(
                          "currencyDisplay",
                          e.currentTarget
                            .value as BarcodeLabelTemplateConfig["currencyDisplay"],
                        )
                      }
                    >
                      <option value="symbol">Sembol</option>
                      <option value="code">Para birimi kodu</option>
                      <option value="none">Yalnız tutar</option>
                    </select>
                  </label>
                </div>
                <details className="barcode-advanced-settings">
                  <summary>
                    Ölçü ve baskı ayarları <ChevronDown size={16} />
                  </summary>
                  <div className="dimension-grid">
                    {" "}
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
                        <small>
                          Rulo ve özel ölçüde yön, genişlik/yükseklik ile
                          belirlenir.
                        </small>
                      ) : null}
                    </label>
                    <label>
                      Satır
                      <input
                        disabled={config.paperType !== "a4"}
                        type="number"
                        min="1"
                        max="100"
                        value={config.rows}
                        onChange={(event) =>
                          changeConfig(
                            "rows",
                            Number(event.currentTarget.value),
                          )
                        }
                      />
                    </label>
                    <label>
                      Sütun
                      <input
                        disabled={config.paperType !== "a4"}
                        type="number"
                        min="1"
                        max="20"
                        value={config.columns}
                        onChange={(event) =>
                          changeConfig(
                            "columns",
                            Number(event.currentTarget.value),
                          )
                        }
                      />
                    </label>
                    {(["top", "right", "bottom", "left"] as const).map(
                      (edge) => (
                        <label key={edge}>
                          {
                            (
                              {
                                top: "Üst",
                                right: "Sağ",
                                bottom: "Alt",
                                left: "Sol",
                              } as const
                            )[edge]
                          }{" "}
                          boşluk (mm)
                          <input
                            type="number"
                            min="0"
                            max="50"
                            step="0.1"
                            value={config.marginsMm[edge]}
                            onChange={(event) => {
                              templateEdited.current = true;
                              setConfig((current) => ({
                                ...current,
                                marginsMm: {
                                  ...current.marginsMm,
                                  [edge]: Number(event.currentTarget.value),
                                },
                              }));
                            }}
                          />
                        </label>
                      ),
                    )}
                    {(["horizontal", "vertical"] as const).map((axis) => (
                      <label key={axis}>
                        {axis === "horizontal" ? "Yatay" : "Dikey"} etiket
                        aralığı (mm)
                        <input
                          type="number"
                          min="0"
                          max="50"
                          step="0.1"
                          value={config.gapMm[axis]}
                          onChange={(event) => {
                            templateEdited.current = true;
                            setConfig((current) => ({
                              ...current,
                              gapMm: {
                                ...current.gapMm,
                                [axis]: Number(event.currentTarget.value),
                              },
                            }));
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={config.showHumanReadable}
                      onChange={(e) =>
                        changeConfig(
                          "showHumanReadable",
                          e.currentTarget.checked,
                        )
                      }
                    />{" "}
                    Barkod değerini de göster
                  </label>
                </details>
              </div>
              <div className="editor-card">
                <h2>Etikette göster</h2>{" "}
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
                      <div className="field-controls">
                        <details className="barcode-field-settings">
                          <summary>Ayarlar</summary>
                          <div>
                            <label>
                              Hiza
                              <select
                                aria-label={`${FIELD_LABELS[field.key]} hizası`}
                                value={field.align}
                                onChange={(event) =>
                                  updateField(index, {
                                    align: event.currentTarget.value as
                                      | "left"
                                      | "center"
                                      | "right",
                                  })
                                }
                              >
                                <option value="left">Sol</option>
                                <option value="center">Orta</option>
                                <option value="right">Sağ</option>
                              </select>
                            </label>
                            <label>
                              Yazı (pt)
                              <input
                                aria-label={`${FIELD_LABELS[field.key]} yazı boyutu`}
                                title="Yazı boyutu"
                                type="number"
                                min="5"
                                max="36"
                                value={field.fontSizePt}
                                onChange={(event) =>
                                  updateField(index, {
                                    fontSizePt: Number(
                                      event.currentTarget.value,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <label>
                              Satır sınırı
                              <input
                                aria-label={`${FIELD_LABELS[field.key]} satır sınırı`}
                                title="Satır sınırı"
                                type="number"
                                min="1"
                                max="4"
                                value={field.maxLines}
                                onChange={(event) =>
                                  updateField(index, {
                                    maxLines: Number(event.currentTarget.value),
                                  })
                                }
                              />
                            </label>
                            <label className="auto-shrink">
                              <input
                                type="checkbox"
                                checked={field.autoShrink}
                                onChange={(event) =>
                                  updateField(index, {
                                    autoShrink: event.currentTarget.checked,
                                  })
                                }
                              />
                              Küçült
                            </label>
                          </div>
                        </details>
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
                <h2>Şablonu kaydet</h2>
                <div className="barcode-preset-row">
                  <label>
                    Şablon adı
                    <input
                      value={templateName}
                      maxLength={120}
                      onChange={(e) => {
                        templateEdited.current = true;
                        setTemplateName(e.currentTarget.value);
                      }}
                    />
                  </label>
                  <button
                    className="button"
                    type="button"
                    disabled={!canManage || !!busy || !templateName.trim()}
                    onClick={() => void saveTemplate()}
                  >
                    {busy === "template"
                      ? "Kaydediliyor…"
                      : activeCustomTemplate
                        ? "Değişiklikleri kaydet"
                        : "Yeni şablon kaydet"}
                  </button>
                </div>
                {detachedHistoryTemplate ? (
                  <small>
                    Arşivlenen düzeni çıktıdan önce yeni şablon olarak kaydedin.
                  </small>
                ) : null}
              </div>
            </div>
          </section>
          <section
            className={`barcode-step-panel ${step === 3 ? "visible" : ""}`}
            hidden={step !== 3}
            aria-label="Önizleme ve çıktı"
          >
            <div className="output-panel">
              <div>
                <h2>Baskı kontrolü</h2>
                <div className="barcode-summary-numbers">
                  <div>
                    <strong>{selection.size}</strong>
                    <span>varyant</span>
                  </div>
                  <div>
                    <strong>{selectedQuantity.toLocaleString("tr-TR")}</strong>
                    <span>etiket</span>
                  </div>
                  <div>
                    <strong>{paperUsage}</strong>
                    <span>
                      {config.paperType === "a4"
                        ? "A4 sayfa"
                        : "etiket kullanımı"}
                    </span>
                  </div>
                </div>
                {config.paperType === "a4" ? (
                  <div className="barcode-start-options">
                    <h3>Tabakada başlangıç</h3>
                    <label>
                      İlk hücreyi atla
                      <input
                        type="number"
                        min="0"
                        max={maxStartCell}
                        step="1"
                        value={startCell}
                        onChange={(e) =>
                          setStartCell(
                            clampStartCell(
                              Number(e.currentTarget.value),
                              config,
                            ),
                          )
                        }
                      />
                    </label>
                    <div
                      className="barcode-start-grid"
                      role="group"
                      aria-label="A4 başlangıç hücresi"
                      style={{
                        gridTemplateColumns: `repeat(${Math.min(20, Math.max(1, Math.floor(config.columns) || 1))}, minmax(44px, 1fr))`,
                      }}
                    >
                      {Array.from({ length: maxStartCell + 1 }, (_, index) => (
                        <button
                          type="button"
                          key={index}
                          className={`barcode-start-cell ${index < startCell ? "used" : ""} ${index === startCell ? "active" : ""}`}
                          aria-pressed={index === startCell}
                          aria-label={`${index + 1}. hücreden başla`}
                          onClick={() => setStartCell(index)}
                        >
                          {index + 1}
                        </button>
                      ))}
                    </div>
                    {config.rows * config.columns > 48 ? (
                      <small>İlk 48 hücreden başlangıç seçilebilir.</small>
                    ) : null}
                  </div>
                ) : null}
                {outputReady ? (
                  <div className="barcode-ready">
                    <Check size={16} />
                    Baskıya hazır
                  </div>
                ) : (
                  <div className="blocking-errors" role="alert">
                    <strong>
                      {selectedQuantity
                        ? "Baskıdan önce düzeltin"
                        : "Önce ürün seçin"}
                    </strong>
                    {detachedHistoryTemplate ? (
                      <span>Şablonu yeniden kaydedin.</span>
                    ) : null}
                    {documentState.error ? (
                      <span>{documentState.error}</span>
                    ) : null}
                    {documentErrors.slice(0, 5).map((error) => (
                      <span key={`${error.variantId}-${error.code}`}>
                        {snapshots.get(error.variantId)?.productTitle}:{" "}
                        {error.message}
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStep(correctionStep)}
                    >
                      {correctionStep === 1
                        ? "Ürün seçimine dön"
                        : "Etiketi düzenle"}
                    </button>
                  </div>
                )}
                <h3>Dosya olarak indir</h3>
                <div className="output-actions">
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

                {config.paperType === "a4" ? (
                  <small>ZPL çıktısı termal etiketler içindir.</small>
                ) : null}
                {config.paperType !== "a4" ? (
                  <div className="zpl-disclosure">
                    <small>
                      Türkçe karakterler Zebra uyumluluğu için ASCII’ye
                      dönüştürülür; fiziksel cihaz uyumu doğrulanmadı.
                    </small>
                    {zebra203Errors.length ? (
                      <span>
                        ZPL 203 engeli:{" "}
                        {"message" in zebra203Errors[0]!
                          ? zebra203Errors[0]!.message
                          : "Şablon veya barkod bu profile uygun değil."}
                      </span>
                    ) : null}
                    {zebra300Errors.length ? (
                      <span>
                        ZPL 300 engeli:{" "}
                        {"message" in zebra300Errors[0]!
                          ? zebra300Errors[0]!.message
                          : "Şablon veya barkod bu profile uygun değil."}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </main>
        <aside
          className={`barcode-summary ${summaryOpen ? "open" : ""}`}
          aria-label="Canlı etiket önizlemesi"
        >
          <div className="summary-heading">
            <span>ETİKET ÖNİZLEMESİ</span>
            <button
              type="button"
              aria-label="Özeti aç veya kapat"
              aria-expanded={summaryOpen}
              onClick={() => setSummaryOpen((open) => !open)}
            >
              <ChevronDown size={16} />
            </button>
          </div>
          <div className="preview-stage">
            {previewItem && !previewErrors.length && document ? (
              <BarcodePreview item={previewItem} template={document.template} />
            ) : (
              <div className="preview-placeholder">
                <Tag size={28} />
                <span>
                  {previewErrors[0]?.message ??
                    documentState.error ??
                    "Önizleme için ürün seçin"}
                </span>
                {selectedQuantity > 0 ? (
                  <button type="button" onClick={() => setStep(correctionStep)}>
                    Düzelt
                  </button>
                ) : null}
              </div>
            )}
          </div>
          <div className="barcode-label-navigation">
            <button
              type="button"
              aria-label="Önceki etiket"
              disabled={!!busy || selectedRows.length < 2}
              onClick={() => navigatePreview(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>
              {selectedRows.length
                ? `${previewIndex + 1} / ${selectedRows.length}`
                : "0 / 0"}
            </span>
            <button
              type="button"
              aria-label="Sonraki etiket"
              disabled={!!busy || selectedRows.length < 2}
              onClick={() => navigatePreview(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          {previewRow ? (
            <div className="barcode-preview-context">
              <strong>{previewRow.productTitle}</strong>
              <span>
                {previewRow.variantTitle} · {previewRow.sku ?? "SKU yok"}
              </span>
            </div>
          ) : null}
          <dl>
            <div>
              <dt>Varyant / etiket</dt>
              <dd>
                {selection.size} / {selectedQuantity.toLocaleString("tr-TR")}
              </dd>
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
              <dt>Kağıt</dt>
              <dd>
                {config.paperType === "a4"
                  ? `A4 · ${config.columns} × ${config.rows}`
                  : config.paperType === "custom"
                    ? "Özel ölçü"
                    : "Termal rulo"}
              </dd>
            </div>
            <div>
              <dt>Barkod</dt>
              <dd>
                {config.barcodeFormat === "ean13" ? "EAN-13" : "Code 128"} ·{" "}
                {config.barcodeSource === "sku" ? "SKU" : "Kayıtlı barkod"}
              </dd>
            </div>
            <div>
              <dt>Tahmini kullanım</dt>
              <dd>
                {paperUsage} {config.paperType === "a4" ? "sayfa" : "etiket"}
              </dd>
            </div>
          </dl>
          {selectedQuantity > 0 && !outputReady ? (
            <button
              className="barcode-fix-action"
              type="button"
              onClick={() => setStep(correctionStep)}
            >
              {documentErrors.length || documentState.error
                ? "Baskı engellerini düzelt"
                : "Şablonu kaydet"}
            </button>
          ) : null}
        </aside>
      </fieldset>
      <footer className="barcode-actionbar">
        <div>
          <strong>{selectedQuantity.toLocaleString("tr-TR")} etiket</strong>
          <span>{selection.size} varyant seçili</span>
        </div>
        <div>
          {step > 1 ? (
            <button
              type="button"
              disabled={!!busy}
              onClick={() => setStep(step === 3 ? 2 : 1)}
            >
              <ChevronLeft size={16} />
              Geri
            </button>
          ) : null}
          {step < 3 ? (
            <button
              type="button"
              className="button button-primary"
              disabled={!selectedQuantity || !!busy}
              onClick={() => setStep(step === 1 ? 2 : 3)}
            >
              {step === 1 ? "Etiketi düzenle" : "Baskıyı hazırla"}
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="button button-primary"
              disabled={!canManage || !!busy || !outputReady}
              onClick={() =>
                void createJob(
                  "browser",
                  config.paperType === "a4" ? "a4" : "thermal",
                  config.paperType === "a4" ? startCell : 0,
                )
              }
            >
              <Printer size={16} />
              {busy === "browser" ? "Hazırlanıyor…" : "Yazdır"}
            </button>
          )}
        </div>
      </footer>
      <StudioDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Baskı geçmişi"
        className="barcode-history-dialog"
      >
        {" "}
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
                disabled={!canManage || !!busy}
                onClick={() => void prepareHistory(job)}
              >
                <span>{job.templateName}</span>
                <small>
                  {job.labelCount} etiket · {job.outputType.toUpperCase()} ·{" "}
                  {new Date(job.createdAt).toLocaleString("tr-TR")}
                </small>
              </button>
            ))
          ) : (
            <p>Henüz baskı işi yok.</p>
          )}
        </div>
        <small>
          Ürün veya fiyat değişmişse tekrar baskıdan önce seçim yenilenir.
        </small>
      </StudioDialog>
      <StudioDialog
        open={templatesOpen}
        onClose={() => setTemplatesOpen(false)}
        title="Mağaza şablonları"
        className="barcode-history-dialog"
      >
        {" "}
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
                  disabled={!!busy || template.status === "archived"}
                  onClick={() => {
                    if (template.status !== "active") return;
                    templateEdited.current = true;
                    setConfig(template.config);
                    setStartCell(0);
                    setTemplateName(template.name);
                    setActiveCustomTemplate(template);
                    setDetachedHistoryTemplate(false);
                    setTemplatesOpen(false);
                  }}
                >
                  <span>{template.name}</span>
                  <small>
                    {template.isDefault ? "Varsayılan · " : ""}
                    {template.status === "archived" ? "Arşivli" : "Aktif"}
                  </small>
                </button>
                {canManage && template.status === "active" ? (
                  <div>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void manageTemplate(template, "rename")}
                    >
                      Yeniden adlandır
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void manageTemplate(template, "duplicate")}
                    >
                      Çoğalt
                    </button>
                    <button
                      type="button"
                      disabled={!!busy || template.isDefault}
                      onClick={() => void manageTemplate(template, "default")}
                    >
                      Varsayılan
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => void manageTemplate(template, "archive")}
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
      </StudioDialog>
    </section>
  );
}
