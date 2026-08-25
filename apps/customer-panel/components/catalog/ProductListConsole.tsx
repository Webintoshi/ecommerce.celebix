"use client";

import Link from "next/link";
import {
  Download,
  Eye,
  FileUp,
  Filter as FilterIcon,
  GripVertical,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { CatalogOnboardingOptions, Product, ProductVariant } from "@celebix/saas-contracts";

import { ProductQuickCreateDialog } from "@/components/catalog-onboarding/ProductQuickCreateDialog";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { catalogOnboardingClient } from "@/lib/catalog-onboarding-ui/client";
import {
  CatalogApiError,
  catalogApi,
  type CatalogDashboardSummary,
  type ProductFeaturedImage,
} from "@/lib/catalog-ui/client";

type Filter = "all" | "draft" | "active" | "archived";
type Sort = "updated-desc" | "title-asc" | "title-desc";
type BulkAction = "" | "active" | "draft" | "archive";
type ProductRow = Readonly<{ product: Product; variant?: ProductVariant; featuredImage?: ProductFeaturedImage }>;
type BulkCatalogApi = Pick<typeof catalogApi, "archiveProduct" | "updateProduct">;
type LoadOptions = Readonly<{ cursor?: string; mutationToken?: number }>;
type LoadResult = "applied" | "blocked" | "failed" | "stale";
type SummaryState = "loading" | "ready" | "unavailable";
type BulkOutcome = Readonly<{
  completed: number;
  failed: number;
  reconciliation: "succeeded" | "failed";
}>;

const STATUS_LABELS = Object.freeze({ draft: "Taslak", active: "Aktif", archived: "Arşivlenmiş" });

function safeMessage(error: unknown) {
  return error instanceof CatalogApiError ? error.message : "Ürünler yüklenemedi. Lütfen yeniden deneyin.";
}

function money(cents: number | undefined, currency: string) {
  if (cents === undefined) return "—";
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function productStockClass(variant: ProductVariant | undefined) {
  if (!variant?.stockTracking) return "product-stock";
  if (variant.stockQuantity === 0) return "product-stock-out";
  return variant.stockQuantity <= 10 ? "product-stock-low" : "product-stock";
}

export function resolveProductActionPlacement(viewportWidth: number): "inline" | "topbar" {
  return viewportWidth <= 1024 ? "inline" : "topbar";
}

export function csvCell(value: string | number) {
  const text = String(value);
  const neutralized = /^(?:[\u0000-\u0020\u007f]|[\u0000-\u0020\u007f]*[=+\-@])/.test(text)
    ? `'${text}`
    : text;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export type ProductSummaryMetric = Readonly<{
  key: "total" | "active" | "draft" | "out-of-stock";
  label: "Toplam" | "Aktif" | "Taslak" | "Stoksuz";
  value: string;
  accessibleValue: string;
}>;

const PRODUCT_SUMMARY_DEFINITIONS = Object.freeze([
  Object.freeze({ key: "total", label: "Toplam", field: "totalProducts" }),
  Object.freeze({ key: "active", label: "Aktif", field: "activeProducts" }),
  Object.freeze({ key: "draft", label: "Taslak", field: "draftProducts" }),
  Object.freeze({ key: "out-of-stock", label: "Stoksuz", field: "outOfStockVariants" }),
] as const);

export function productSummaryMetrics(
  summaryState: SummaryState,
  summary?: Pick<CatalogDashboardSummary, "totalProducts" | "activeProducts" | "draftProducts" | "outOfStockVariants">,
): readonly ProductSummaryMetric[] {
  return Object.freeze(PRODUCT_SUMMARY_DEFINITIONS.map(({ key, label, field }) => {
    const metricValue = summary?.[field];
    if (summaryState !== "ready" || metricValue === undefined) {
      const stateLabel = summaryState === "loading" ? "yükleniyor" : "kullanılamıyor";
      return Object.freeze({ key, label, value: "—", accessibleValue: `${label} mağaza toplamı ${stateLabel}` });
    }
    const value = String(metricValue);
    return Object.freeze({ key, label, value, accessibleValue: `${label} ${value}` });
  }));
}

export function requiresBulkConfirmation(action: string): boolean {
  return action === "archive";
}

export function bulkArchiveConfirmationMessage(count: number): string {
  return `${count} ürün arşivlenecek.`;
}

export function createProductOperationCoordinator() {
  let generation = 0;
  let activeMutation: number | null = null;
  return Object.freeze({
    beginRead(): number | null {
      if (activeMutation !== null) return null;
      generation += 1;
      return generation;
    },
    beginMutation(): number | null {
      if (activeMutation !== null) return null;
      generation += 1;
      activeMutation = generation;
      return activeMutation;
    },
    beginCanonicalRead(mutationToken: number): number | null {
      if (activeMutation !== mutationToken) return null;
      generation += 1;
      return generation;
    },
    endMutation(mutationToken: number) {
      if (activeMutation === mutationToken) activeMutation = null;
    },
    isCurrentRead(readToken: number): boolean {
      return readToken === generation;
    },
  });
}

function productFields(product: Product, status: "draft" | "active") {
  return Object.freeze({
    title: product.title,
    slug: product.slug,
    ...(product.description === undefined ? {} : { description: product.description }),
    status,
    currency: product.currency,
  });
}

export async function executeBulkProductAction(
  targets: readonly ProductRow[],
  action: Exclude<BulkAction, "">,
  api: BulkCatalogApi,
): Promise<Readonly<{ completed: number; failed: number }>> {
  let completed = 0;
  let failed = 0;
  for (const { product } of targets) {
    try {
      if (action === "archive") await api.archiveProduct(product.id, product.version);
      else await api.updateProduct(product.id, {
        expectedVersion: product.version,
        product: productFields(product, action),
      });
      completed += 1;
    } catch {
      failed += 1;
    }
  }
  return Object.freeze({ completed, failed });
}

async function hydrateRows(
  products: readonly Product[],
  featuredImages: Readonly<Record<string, ProductFeaturedImage>> = Object.freeze({}),
): Promise<readonly ProductRow[]> {
  const details = await Promise.all(products.map(async (product) => {
    try {
      const detail = await catalogApi.getProduct(product.id);
      return Object.freeze({
        product,
        variant: detail.variants.find((variant) => variant.status === "active") ?? detail.variants[0],
        ...(featuredImages[product.id] === undefined ? {} : { featuredImage: featuredImages[product.id] }),
      });
    } catch {
      return Object.freeze({
        product,
        ...(featuredImages[product.id] === undefined ? {} : { featuredImage: featuredImages[product.id] }),
      });
    }
  }));
  return Object.freeze(details);
}

function ProductThumbnail({ product, featuredImage }: Readonly<{ product: Product; featuredImage?: ProductFeaturedImage }>) {
  if (featuredImage === undefined) {
    return <span className="product-placeholder" aria-hidden="true"><Package /></span>;
  }
  return (
    <span className="product-thumbnail">
      <span className="product-thumbnail-fallback" aria-hidden="true"><Package /></span>
      <img
        src={featuredImage.publicUrl}
        alt={featuredImage.altText || `${product.title} ürün görseli`}
        loading="lazy"
        decoding="async"
        onError={(event) => { event.currentTarget.hidden = true; }}
      />
    </span>
  );
}

export function ProductListConsole({
  canManage = false,
  canArchive = false,
  canImport = false,
}: Readonly<{ canManage?: boolean; canArchive?: boolean; canImport?: boolean }>) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated-desc");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [rows, setRows] = useState<readonly ProductRow[]>([]);
  const [summary, setSummary] = useState<CatalogDashboardSummary>();
  const [summaryState, setSummaryState] = useState<SummaryState>("loading");
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bulkOutcome, setBulkOutcome] = useState<BulkOutcome>();
  const [rowsStale, setRowsStale] = useState(false);
  const rowsStaleRef = useRef(rowsStale);
  rowsStaleRef.current = rowsStale;
  const [archiveCandidate, setArchiveCandidate] = useState<Product>();
  const [bulkArchiveConfirmation, setBulkArchiveConfirmation] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickOptions, setQuickOptions] = useState<CatalogOnboardingOptions | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const operationCoordinator = useRef(createProductOperationCoordinator());
  const archiveDialogRef = useRef<HTMLDivElement>(null);
  const archiveCancelButtonRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const refreshListButtonRef = useRef<HTMLButtonElement>(null);
  const wasArchiveDialogOpen = useRef(false);

  const load = useCallback(async (options: LoadOptions = {}): Promise<LoadResult> => {
    if (options.cursor !== undefined && rowsStaleRef.current) return "blocked";
    const sequence = options.mutationToken === undefined
      ? operationCoordinator.current.beginRead()
      : operationCoordinator.current.beginCanonicalRead(options.mutationToken);
    if (sequence === null) return "blocked";
    const cursor = options.cursor;
    cursor === undefined ? setLoading(true) : setLoadingMore(true);
    if (cursor === undefined) setSummaryState("loading");
    if (options.mutationToken === undefined) setError("");
    try {
      const input = Object.freeze({
        ...(filterRef.current === "all" ? {} : { status: filterRef.current }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      const [listOutcome, summaryOutcome] = await Promise.allSettled([
        catalogApi.listProducts(input),
        cursor === undefined ? catalogApi.getDashboardSummary() : Promise.resolve(undefined),
      ]);
      if (!operationCoordinator.current.isCurrentRead(sequence)) return "stale";
      if (cursor === undefined) {
        if (summaryOutcome.status === "fulfilled" && summaryOutcome.value !== undefined) {
          setSummary(summaryOutcome.value);
          setSummaryState("ready");
        } else {
          setSummary(undefined);
          setSummaryState("unavailable");
        }
      }
      if (listOutcome.status === "rejected") throw listOutcome.reason;
      const result = listOutcome.value;
      const hydrated = await hydrateRows(result.items, result.featuredImages);
      if (!operationCoordinator.current.isCurrentRead(sequence)) return "stale";
      setRows((current) => cursor === undefined ? hydrated : Object.freeze([...current, ...hydrated]));
      setNextCursor(result.nextCursor);
      if (cursor === undefined) setSelected(Object.freeze([]));
      if (cursor === undefined) setRowsStale(false);
      return "applied";
    } catch (failure) {
      if (!operationCoordinator.current.isCurrentRead(sequence)) return "stale";
      setError(safeMessage(failure));
      return "failed";
    } finally {
      if (operationCoordinator.current.isCurrentRead(sequence)) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => { void load(); }, [filter, load]);

  useEffect(() => {
    if (archiveCandidate !== undefined) {
      wasArchiveDialogOpen.current = true;
      archiveCancelButtonRef.current?.focus();
      return;
    }
    if (!wasArchiveDialogOpen.current) return;
    wasArchiveDialogOpen.current = false;
    if (archiveTriggerRef.current?.isConnected) archiveTriggerRef.current.focus();
    else refreshListButtonRef.current?.focus();
  }, [archiveCandidate]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("tr-TR");
    const matched = query === "" ? rows : rows.filter(({ product, variant }) => (
      product.title.toLocaleLowerCase("tr-TR").includes(query)
      || product.slug.toLocaleLowerCase("tr-TR").includes(query)
      || variant?.sku?.toLocaleLowerCase("tr-TR").includes(query)
    ));
    return [...matched].sort((left, right) => {
      if (sort === "title-asc") return left.product.title.localeCompare(right.product.title, "tr-TR");
      if (sort === "title-desc") return right.product.title.localeCompare(left.product.title, "tr-TR");
      return right.product.updatedAt.localeCompare(left.product.updatedAt);
    });
  }, [rows, search, sort]);

  const visibleIds = visibleRows.filter(({ product }) => product.status !== "archived").map(({ product }) => product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const summaryMetrics = productSummaryMetrics(summaryState, summary);

  function closeArchiveDialog() {
    if (!busy) setArchiveCandidate(undefined);
  }

  function handleArchiveDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      if (!busy) closeArchiveDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(archiveDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (focusable.length === 0) {
      event.preventDefault();
      archiveDialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && (document.activeElement === first || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !archiveDialogRef.current?.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }

  async function archive() {
    if (archiveCandidate === undefined || !canArchive || archiveCandidate.status === "archived") return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    let mutationCompleted = false;
    try {
      await catalogApi.archiveProduct(archiveCandidate.id, archiveCandidate.version);
      mutationCompleted = true;
      setRows((current) => Object.freeze(current.filter((item) => item.product.id !== archiveCandidate.id)));
      setArchiveCandidate(undefined);
    } catch (failure) {
      setError(safeMessage(failure));
      setArchiveCandidate(undefined);
    } finally {
      const reconciliation = await load({ mutationToken });
      if (mutationCompleted && reconciliation !== "applied") setRowsStale(true);
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function restore(product: Product) {
    if (!canArchive || product.status !== "archived") return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    let mutationCompleted = false;
    try {
      const result = await catalogApi.restoreProduct(product.id, product.version);
      mutationCompleted = true;
      setRows((current) => Object.freeze(current.map((row) => (
        row.product.id === product.id ? Object.freeze({ ...row, product: result.product }) : row
      ))));
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      const reconciliation = await load({ mutationToken });
      if (mutationCompleted && reconciliation !== "applied") setRowsStale(true);
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function setProductStatus(product: Product, status: "draft" | "active") {
    if (!canManage || product.status === "archived") return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    let mutationCompleted = false;
    try {
      const result = await catalogApi.updateProduct(product.id, {
        expectedVersion: product.version,
        product: productFields(product, status),
      });
      mutationCompleted = true;
      setRows((current) => Object.freeze(current.map((row) => (
        row.product.id === product.id ? Object.freeze({ ...row, product: result.product }) : row
      ))));
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      const reconciliation = await load({ mutationToken });
      if (mutationCompleted && reconciliation !== "applied") setRowsStale(true);
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function executeConfirmedBulkAction() {
    if (
      bulkAction === "" || selected.length === 0 ||
      (bulkAction === "archive" ? !canArchive : !canManage)
    ) return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    try {
      const targets = rows.filter(({ product }) => selected.includes(product.id));
      const outcome = await executeBulkProductAction(targets, bulkAction, catalogApi);
      setSelected(Object.freeze([]));
      setBulkArchiveConfirmation(false);
      const reconciliation = await load({ mutationToken });
      const reconciliationState = reconciliation === "applied" ? "succeeded" : "failed";
      setBulkOutcome(Object.freeze({ ...outcome, reconciliation: reconciliationState }));
      if (reconciliationState === "failed" && outcome.completed > 0) setRowsStale(true);
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  function applyBulkAction() {
    if (
      bulkAction === "" || selected.length === 0 || busy ||
      (bulkAction === "archive" ? !canArchive : !canManage)
    ) return;
    if (requiresBulkConfirmation(bulkAction)) {
      setBulkArchiveConfirmation(true);
      return;
    }
    void executeConfirmedBulkAction();
  }

  async function retryStaleRows() {
    await load();
  }

  function exportVisibleRows() {
    const output = [
      ["Ürün", "SKU", "Fiyat", "Stok", "Durum"],
      ...visibleRows.map(({ product, variant }) => [
        product.title,
        variant?.sku ?? "",
        variant === undefined ? "" : String(variant.priceCents),
        variant === undefined ? "" : String(variant.stockQuantity),
        STATUS_LABELS[product.status],
      ]),
    ].map((line) => line.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", output], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "celebix-urunler.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function productCommands() {
    return (
    <div className="hemenaku-product-commandbar product-operations-commandbar" aria-label="Ürün sayfası işlemleri">
      <label className="command-select"><GripVertical aria-hidden="true" /><span className="sr-only">Sırala</span><select value={sort} disabled={busy || loading || loadingMore} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Ürünleri sırala"><option value="updated-desc">Sırala</option><option value="title-asc">İsim A-Z</option><option value="title-desc">İsim Z-A</option></select></label>
      {canImport ? <Link className="command-button" href="/products/bulk-upload"><FileUp aria-hidden="true" />İçe Aktar</Link> : null}
      <button className="command-button" type="button" disabled={visibleRows.length === 0 || busy || loading || loadingMore} onClick={exportVisibleRows}><Download aria-hidden="true" />Dışa Aktar</button>
      {canManage ? <button className="command-button command-button-primary" type="button" disabled={busy} onClick={() => void openQuickCreate()}><Plus aria-hidden="true" />Ürün Ekle</button> : null}
    </div>
    );
  }

  async function openQuickCreate() {
    if (!canManage) return;
    setQuickCreateOpen(true);
    if (quickOptions !== null) return;
    try { setQuickOptions(await catalogOnboardingClient.getOptions()); }
    catch (failure) {
      setQuickCreateOpen(false);
      setError(failure instanceof Error ? failure.message : "Ürün seçenekleri yüklenemedi.");
    }
  }

  const topbarActions = productCommands();

  return (
    <section className="catalog-page donor-product-page product-operations-page" aria-labelledby="products-title" data-presentation="hemenaku-product-list" data-workspace="product-operations">
      <PanelTopbarBridge title="Ürünler" actions={topbarActions} />
      <h1 id="products-title" className="sr-only">Ürünler</h1>
      <div className="product-mobile-commandbar">{productCommands()}</div>

      <div className="hemenaku-product-filters product-operations-toolbar">
        <dl className="product-stat-grid" aria-label="Ürün özeti">
          {summaryMetrics.map((metric) => (
            <div key={metric.key} aria-label={metric.accessibleValue}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
            </div>
          ))}
        </dl>
        <label className="product-search"><Search aria-hidden="true" /><span className="sr-only">Tabloda arama yapın</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tabloda arama yapın" aria-label="Ürün tablosunda ara" /></label>
        <button className={`command-button ${filterOpen || filter !== "all" ? "is-active" : ""}`} type="button" aria-expanded={filterOpen} aria-pressed={filter !== "all"} disabled={busy || loading || loadingMore} onClick={() => setFilterOpen((current) => !current)}><FilterIcon aria-hidden="true" />Filtre</button>
        <button ref={refreshListButtonRef} className="command-button command-icon-button" type="button" disabled={busy || loading || loadingMore} onClick={() => void load()} aria-label="Ürün listesini yenile" title="Ürün listesini yenile"><RefreshCw aria-hidden="true" /></button>
      </div>

      {filterOpen ? (
        <div className="product-filter-panel" aria-label="Ürün durumu filtresi">
          {(["all", "active", "draft", "archived"] as const).map((status) => <button key={status} type="button" disabled={busy || loading || loadingMore} className={filter === status ? "is-active" : ""} onClick={() => setFilter(status)}>{status === "all" ? "Tümü" : STATUS_LABELS[status]}</button>)}
        </div>
      ) : null}

      {(canManage || canArchive) && filter !== "archived" ? <div className="product-bulkbar">
        <div className="product-bulk-actions">
          <label className="select-all-control"><input type="checkbox" disabled={busy} checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? Object.freeze(visibleIds) : Object.freeze([]))} aria-label="Görüntülenen tüm ürünleri seç" /><span>Tümünü seç</span></label>
          <select value={bulkAction} disabled={busy} onChange={(event) => setBulkAction(event.target.value as BulkAction)} aria-label="Toplu İşlemler"><option value="">Toplu İşlemler</option>{canManage ? <><option value="active">Aktif yap</option><option value="draft">Taslağa al</option></> : null}{canArchive ? <option value="archive">Arşivle</option> : null}</select>
          <button type="button" disabled={selected.length === 0 || bulkAction === "" || busy || loading || loadingMore} onClick={applyBulkAction}>Uygula</button>
          <span className="product-selected-count">{selected.length} ürün seçildi</span>
        </div>
        <div className="product-list-status">
          <span className="product-range">{visibleRows.length === 0 ? 0 : 1} - {visibleRows.length} / {rows.length} yüklendi · {summary?.totalProducts ?? "—"} mağazada</span>
          <label className="row-count-control"><span>Satır sayısı</span><select aria-label="Satır sayısı" value="20" disabled><option>20</option></select></label>
        </div>
      </div> : null}

      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Bir sorun oluştu</strong><p>{error}</p></div><button className="button button-secondary" type="button" onClick={() => void load()}>Tekrar dene</button></div> : null}
      {bulkOutcome ? <div className={`feedback ${bulkOutcome.failed > 0 || bulkOutcome.reconciliation === "failed" ? "feedback-error" : "feedback-success"}`} role={bulkOutcome.failed > 0 || bulkOutcome.reconciliation === "failed" ? "alert" : "status"}><div><strong>Toplu işlem sonucu</strong><p>{bulkOutcome.completed} tamamlandı, {bulkOutcome.failed} başarısız. {bulkOutcome.reconciliation === "succeeded" ? "Liste kalıcı mağaza durumuyla uzlaştırıldı." : "Kanonik uzlaştırma başarısız; görüntülenen satırlar güncel olmayabilir. Yeniden deneyin."}</p></div></div> : null}
      {rowsStale ? <div id="product-stale-warning" className="feedback feedback-error" role="alert"><div><strong>Ürün satırları doğrulanamadı</strong><p>Uzlaştırma başarısız; görüntülenen satırlar güncel olmayabilir.</p></div><button className="button button-secondary" type="button" onClick={() => void retryStaleRows()} disabled={loading || busy}>Yeniden dene</button></div> : null}

      {loading ? (
        <div className="catalog-loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /> Ürünler güvenli mağaza bağlamından yükleniyor…</div>
      ) : visibleRows.length === 0 ? (
        <div className="empty-state"><span className="empty-state-mark" aria-hidden="true"><Package /></span><h2>Henüz ürün yok</h2><p>Filtrelerle eşleşen gerçek bir ürün bulunamadı.</p>{canManage ? <Link className="button button-primary" href="/products/new">İlk ürünü oluştur</Link> : null}</div>
      ) : (
        <div className="catalog-table-shell" data-stale={rowsStale ? "true" : undefined} aria-describedby={rowsStale ? "product-stale-warning" : undefined}>
          <table className="catalog-table">
            <thead><tr><th>Seç</th><th>Ürün</th><th>SKU</th><th>Fiyat</th><th>Stok</th><th>Durum</th><th>Yayında</th><th>İşlemler</th></tr></thead>
            <tbody>
              {visibleRows.map(({ product, variant, featuredImage }) => (
                <tr key={product.id} className={selected.includes(product.id) ? "is-selected" : undefined}>
                  <td data-label="Seç"><label className="catalog-checkbox-hit"><input type="checkbox" disabled={busy || product.status === "archived"} checked={selected.includes(product.id)} onChange={(event) => setSelected((current) => event.target.checked ? Object.freeze([...current, product.id]) : Object.freeze(current.filter((id) => id !== product.id)))} aria-label={`${product.title} ürününü seç`} /></label></td>
                  <td data-label="Ürün"><Link className="product-link" href={`/products/${product.id}`}><ProductThumbnail product={product} featuredImage={featuredImage} /><span><strong>{product.title}</strong></span></Link></td>
                  <td data-label="SKU"><span className="mono-value">{variant?.sku ?? "—"}</span></td>
                  <td data-label="Fiyat">{variant?.compareAtCents ? <del>{money(variant.compareAtCents, product.currency)}</del> : null}<span className="product-price">{money(variant?.priceCents, product.currency)}</span></td>
                  <td data-label="Stok"><span className={productStockClass(variant)}>{variant === undefined ? "—" : variant.stockTracking ? `${variant.stockQuantity} adet` : "Takipsiz"}</span></td>
                  <td data-label="Durum"><span className={`product-status-text status-${product.status}`}>{STATUS_LABELS[product.status]}</span>{product.status === "draft" ? <small>Henüz yayına hazır değil</small> : null}</td>
                  <td data-label="Yayında">{canManage && product.status !== "archived" ? <button className={`publish-switch ${product.status === "active" ? "is-active" : ""}`} type="button" role="switch" aria-checked={product.status === "active"} disabled={busy} onClick={() => void setProductStatus(product, product.status === "active" ? "draft" : "active")} aria-label={`${product.title} yayın durumunu değiştir`}><span /></button> : <span aria-label="Yayın değişikliği kullanılamıyor">—</span>}</td>
                  <td className="row-actions" data-label="İşlemler"><Link className="icon-button" href={`/products/${product.id}`} aria-label={`${product.title} ürününü görüntüle`} title="Görüntüle"><Eye /></Link>{canManage && product.status !== "archived" ? <Link className="icon-button" href={`/products/${product.id}`} aria-label={`${product.title} ürününü düzenle`} title="Düzenle"><Pencil /></Link> : null}{canArchive && product.status !== "archived" ? <button ref={archiveCandidate?.id === product.id ? archiveTriggerRef : undefined} className="icon-button danger" type="button" disabled={busy} onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveCandidate(product); }} aria-label={`${product.title} ürününü arşivle`} title="Arşivle"><Trash2 /></button> : null}{canArchive && product.status === "archived" ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void restore(product)}><RotateCcw aria-hidden="true" />{"Geri Yükle"}</button> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? <button className="button button-secondary load-more" type="button" onClick={() => void load({ cursor: nextCursor })} disabled={loadingMore || loading || busy || rowsStale}>{loadingMore ? "Yükleniyor…" : "Daha fazla yükle"}</button> : null}

      {archiveCandidate && canArchive ? (
        <div className="archive-dialog-layer">
          <div ref={archiveDialogRef} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-title" aria-describedby="archive-description" tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            <div><strong id="archive-title">Arşivlemeyi onayla</strong><p id="archive-description"><b>{archiveCandidate.title}</b><br />Bu ürün mağazada görünmez olacaktır.<br /><br />Sipariş geçmişi korunacaktır.<br /><br />Bu işlem daha sonra geri alınabilir.</p></div>
            <div className="confirmation-actions"><button ref={archiveCancelButtonRef} className="button button-secondary" type="button" onClick={closeArchiveDialog} disabled={busy}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void archive()} disabled={busy}>{busy ? "Arşivleniyor…" : "Ürünü arşivle"}</button></div>
          </div>
        </div>
      ) : null}

      {bulkArchiveConfirmation && canArchive ? (
        <div className="archive-dialog-layer">
          <div className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bulk-archive-title" aria-describedby="bulk-archive-description">
            <div><strong id="bulk-archive-title">Toplu arşivlemeyi onayla</strong><p id="bulk-archive-description">{bulkArchiveConfirmationMessage(selected.length)}<br />Bu ürün mağazada görünmez olacaktır.<br /><br />Sipariş geçmişi korunacaktır.<br /><br />Bu işlem daha sonra geri alınabilir.</p></div>
            <div className="confirmation-actions"><button className="button button-secondary" type="button" onClick={() => setBulkArchiveConfirmation(false)} disabled={busy}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void executeConfirmedBulkAction()} disabled={busy}>{busy ? "Arşivleniyor…" : `${selected.length} ürünü arşivle`}</button></div>
          </div>
        </div>
      ) : null}

      {canManage ? <ProductQuickCreateDialog
        open={quickCreateOpen}
        options={quickOptions}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={() => { setQuickCreateOpen(false); void load(); }}
        onAdvanced={() => { setQuickCreateOpen(false); location.assign("/products/new?mode=advanced"); }}
      /> : null}
    </section>
  );
}
