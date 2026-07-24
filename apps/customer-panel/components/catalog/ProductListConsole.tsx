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
import type { Product, ProductVariant } from "@celebix/saas-contracts";

import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import {
  CatalogApiError,
  catalogApi,
  type CatalogDashboardSummary,
} from "@/lib/catalog-ui/client";

type Filter = "all" | "draft" | "active";
type Sort = "updated-desc" | "title-asc" | "title-desc";
type BulkAction = "" | "active" | "draft" | "archive";
type ProductRow = Readonly<{ product: Product; variant?: ProductVariant }>;
type BulkCatalogApi = Pick<typeof catalogApi, "archiveProduct" | "updateProduct">;
type LoadOptions = Readonly<{ cursor?: string; mutationToken?: number }>;

const STATUS_LABELS = Object.freeze({ draft: "Taslak", active: "Aktif", archived: "Arşivlendi" });

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

export function productCountLabels(displayed: number, loaded: number, storeTotal?: number): readonly string[] {
  return Object.freeze([
    `${displayed} görüntüleniyor`,
    `${loaded} yüklendi`,
    storeTotal === undefined ? "Mağaza toplamı yükleniyor" : `${storeTotal} mağazada`,
  ]);
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

async function hydrateRows(products: readonly Product[]): Promise<readonly ProductRow[]> {
  const details = await Promise.all(products.map(async (product) => {
    try {
      const detail = await catalogApi.getProduct(product.id);
      return Object.freeze({ product, variant: detail.variants.find((variant) => variant.status === "active") ?? detail.variants[0] });
    } catch {
      return Object.freeze({ product });
    }
  }));
  return Object.freeze(details);
}

export function ProductListConsole() {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated-desc");
  const [search, setSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [rows, setRows] = useState<readonly ProductRow[]>([]);
  const [summary, setSummary] = useState<CatalogDashboardSummary>();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [bulkAction, setBulkAction] = useState<BulkAction>("");
  const [nextCursor, setNextCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bulkOutcome, setBulkOutcome] = useState<Readonly<{ completed: number; failed: number }>>();
  const [archiveCandidate, setArchiveCandidate] = useState<Product>();
  const [bulkArchiveConfirmation, setBulkArchiveConfirmation] = useState(false);
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const operationCoordinator = useRef(createProductOperationCoordinator());
  const archiveDialogRef = useRef<HTMLDivElement>(null);
  const archiveCancelButtonRef = useRef<HTMLButtonElement>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement>(null);
  const refreshListButtonRef = useRef<HTMLButtonElement>(null);
  const wasArchiveDialogOpen = useRef(false);

  const load = useCallback(async (options: LoadOptions = {}) => {
    const sequence = options.mutationToken === undefined
      ? operationCoordinator.current.beginRead()
      : operationCoordinator.current.beginCanonicalRead(options.mutationToken);
    if (sequence === null) return;
    const cursor = options.cursor;
    cursor === undefined ? setLoading(true) : setLoadingMore(true);
    if (options.mutationToken === undefined) setError("");
    try {
      const input = Object.freeze({
        ...(filterRef.current === "all" ? {} : { status: filterRef.current }),
        ...(cursor === undefined ? {} : { cursor }),
      });
      const [result, nextSummary] = await Promise.all([
        catalogApi.listProducts(input),
        cursor === undefined ? catalogApi.getDashboardSummary() : Promise.resolve(undefined),
      ]);
      const hydrated = await hydrateRows(result.items);
      if (!operationCoordinator.current.isCurrentRead(sequence)) return;
      setRows((current) => cursor === undefined ? hydrated : Object.freeze([...current, ...hydrated]));
      if (nextSummary !== undefined) setSummary(nextSummary);
      setNextCursor(result.nextCursor);
      if (cursor === undefined) setSelected(Object.freeze([]));
    } catch (failure) {
      if (!operationCoordinator.current.isCurrentRead(sequence)) return;
      setError(safeMessage(failure));
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

  const visibleIds = visibleRows.map(({ product }) => product.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const countLabels = productCountLabels(visibleRows.length, rows.length, summary?.totalProducts);

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
    if (archiveCandidate === undefined) return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    try {
      await catalogApi.archiveProduct(archiveCandidate.id, archiveCandidate.version);
      setRows((current) => Object.freeze(current.filter((item) => item.product.id !== archiveCandidate.id)));
      setArchiveCandidate(undefined);
    } catch (failure) {
      setError(safeMessage(failure));
      setArchiveCandidate(undefined);
    } finally {
      await load({ mutationToken });
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function setProductStatus(product: Product, status: "draft" | "active") {
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    try {
      const result = await catalogApi.updateProduct(product.id, {
        expectedVersion: product.version,
        product: productFields(product, status),
      });
      setRows((current) => Object.freeze(current.map((row) => (
        row.product.id === product.id ? Object.freeze({ ...row, product: result.product }) : row
      ))));
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      await load({ mutationToken });
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  async function executeConfirmedBulkAction() {
    if (bulkAction === "" || selected.length === 0) return;
    const mutationToken = operationCoordinator.current.beginMutation();
    if (mutationToken === null) return;
    setBusy(true);
    setError("");
    setBulkOutcome(undefined);
    try {
      const targets = rows.filter(({ product }) => selected.includes(product.id));
      const outcome = await executeBulkProductAction(targets, bulkAction, catalogApi);
      setBulkOutcome(outcome);
      setSelected(Object.freeze([]));
      setBulkArchiveConfirmation(false);
    } catch (failure) {
      setError(safeMessage(failure));
    } finally {
      await load({ mutationToken });
      operationCoordinator.current.endMutation(mutationToken);
      setBusy(false);
    }
  }

  function applyBulkAction() {
    if (bulkAction === "" || selected.length === 0 || busy) return;
    if (requiresBulkConfirmation(bulkAction)) {
      setBulkArchiveConfirmation(true);
      return;
    }
    void executeConfirmedBulkAction();
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
    <div className="hemenaku-product-commandbar" aria-label="Ürün sayfası işlemleri">
      <label className="command-select"><GripVertical aria-hidden="true" /><span className="sr-only">Sırala</span><select value={sort} disabled={busy || loading || loadingMore} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Ürünleri sırala"><option value="updated-desc">Sırala</option><option value="title-asc">İsim A-Z</option><option value="title-desc">İsim Z-A</option></select></label>
      <Link className="command-button" href="/products/bulk-upload"><FileUp aria-hidden="true" />İçe Aktar</Link>
      <button className="command-button" type="button" disabled={visibleRows.length === 0 || busy || loading || loadingMore} onClick={exportVisibleRows}><Download aria-hidden="true" />Dışa Aktar</button>
      <Link className="command-button command-button-primary" href="/products/new"><Plus aria-hidden="true" />Ürün Ekle</Link>
    </div>
    );
  }

  const topbarActions = productCommands();

  return (
    <section className="catalog-page donor-product-page" aria-labelledby="products-title" data-presentation="hemenaku-product-list">
      <PanelTopbarBridge title="Ürünler" actions={topbarActions} />
      <h1 id="products-title" className="sr-only">Ürünler</h1>
      <div className="product-mobile-commandbar">{productCommands()}</div>

      <div className="hemenaku-product-filters">
        <div className="product-stat-chips" aria-label="Ürün özeti">
          {countLabels.map((label) => <span key={label}>{label}</span>)}
          <span>{summary?.activeProducts ?? rows.filter(({ product }) => product.status === "active").length} mağazada aktif</span>
          <span>{summary?.draftProducts ?? rows.filter(({ product }) => product.status === "draft").length} mağazada taslak</span>
          <span>{summary?.outOfStockVariants ?? 0} mağazada stoksuz varyant</span>
        </div>
        <label className="product-search"><Search aria-hidden="true" /><span className="sr-only">Tabloda arama yapın</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tabloda arama yapın" aria-label="Ürün tablosunda ara" /></label>
        <button className={`command-button ${filterOpen ? "is-active" : ""}`} type="button" aria-expanded={filterOpen} disabled={busy || loading || loadingMore} onClick={() => setFilterOpen((current) => !current)}><FilterIcon aria-hidden="true" />Filtre</button>
        <button ref={refreshListButtonRef} className="command-button command-icon-button" type="button" disabled={busy || loading || loadingMore} onClick={() => void load()} aria-label="Ürün listesini yenile"><RefreshCw aria-hidden="true" /></button>
      </div>

      {filterOpen ? (
        <div className="product-filter-panel" aria-label="Ürün durumu filtresi">
          {(["all", "active", "draft"] as const).map((status) => <button key={status} type="button" disabled={busy || loading || loadingMore} className={filter === status ? "is-active" : ""} onClick={() => setFilter(status)}>{status === "all" ? "Tümü" : STATUS_LABELS[status]}</button>)}
        </div>
      ) : null}

      <div className="product-bulkbar">
        <label className="select-all-control"><input type="checkbox" disabled={busy} checked={allVisibleSelected} onChange={(event) => setSelected(event.target.checked ? Object.freeze(visibleIds) : Object.freeze([]))} aria-label="Görüntülenen tüm ürünleri seç" /><span>Tümünü seç</span></label>
        <select value={bulkAction} disabled={busy} onChange={(event) => setBulkAction(event.target.value as BulkAction)} aria-label="Toplu İşlemler"><option value="">Toplu İşlemler</option><option value="active">Aktif yap</option><option value="draft">Taslağa al</option><option value="archive">Arşivle</option></select>
        <button type="button" disabled={selected.length === 0 || bulkAction === "" || busy || loading || loadingMore} onClick={applyBulkAction}>Uygula</button>
        <span>{selected.length} ürün seçildi</span>
        <span className="product-range">{visibleRows.length === 0 ? 0 : 1} - {visibleRows.length} / {rows.length} yüklendi · {summary?.totalProducts ?? "—"} mağazada</span>
        <label className="row-count-control"><span>Satır sayısı</span><select aria-label="Satır sayısı" value="20" disabled><option>20</option></select></label>
      </div>

      {error ? <div className="feedback feedback-error" role="alert"><div><strong>Bir sorun oluştu</strong><p>{error}</p></div><button className="button button-secondary" type="button" onClick={() => void load()}>Tekrar dene</button></div> : null}
      {bulkOutcome ? <div className={`feedback ${bulkOutcome.failed > 0 ? "feedback-error" : "feedback-success"}`} role={bulkOutcome.failed > 0 ? "alert" : "status"}><div><strong>Toplu işlem sonucu</strong><p>{bulkOutcome.completed} tamamlandı, {bulkOutcome.failed} başarısız. Liste kalıcı mağaza durumuyla uzlaştırıldı.</p></div></div> : null}

      {loading ? (
        <div className="catalog-loading" role="status" aria-live="polite"><span className="spinner" aria-hidden="true" /> Ürünler güvenli mağaza bağlamından yükleniyor…</div>
      ) : visibleRows.length === 0 ? (
        <div className="empty-state"><span className="empty-state-mark" aria-hidden="true"><Package /></span><h2>Henüz ürün yok</h2><p>Filtrelerle eşleşen gerçek bir ürün bulunamadı.</p><Link className="button button-primary" href="/products/new">İlk ürünü oluştur</Link></div>
      ) : (
        <div className="catalog-table-shell">
          <table className="catalog-table">
            <thead><tr><th>Seç</th><th>Ürün</th><th>SKU</th><th>Fiyat</th><th>Stok</th><th>Durum</th><th>Yayında</th><th>İşlemler</th></tr></thead>
            <tbody>
              {visibleRows.map(({ product, variant }) => (
                <tr key={product.id}>
                  <td data-label="Seç"><label className="catalog-checkbox-hit"><input type="checkbox" disabled={busy} checked={selected.includes(product.id)} onChange={(event) => setSelected((current) => event.target.checked ? Object.freeze([...current, product.id]) : Object.freeze(current.filter((id) => id !== product.id)))} aria-label={`${product.title} ürününü seç`} /></label></td>
                  <td data-label="Ürün"><Link className="product-link" href={`/products/${product.id}`}><span className="product-placeholder" aria-hidden="true"><Package /></span><span><strong>{product.title}</strong><small>/{product.slug}</small></span></Link></td>
                  <td data-label="SKU"><span className="mono-value">{variant?.sku ?? "—"}</span></td>
                  <td data-label="Fiyat">{variant?.compareAtCents ? <del>{money(variant.compareAtCents, product.currency)}</del> : null}<span className="product-price">{money(variant?.priceCents, product.currency)}</span></td>
                  <td data-label="Stok"><span className={variant?.stockTracking && variant.stockQuantity <= 10 ? "product-stock-low" : "product-stock"}>{variant === undefined ? "—" : variant.stockTracking ? `${variant.stockQuantity} adet` : "Takipsiz"}</span></td>
                  <td data-label="Durum"><span className={`product-status-text status-${product.status}`}>{STATUS_LABELS[product.status]}</span>{product.status === "draft" ? <small>Henüz yayına hazır değil</small> : null}</td>
                  <td data-label="Yayında"><button className={`publish-switch ${product.status === "active" ? "is-active" : ""}`} type="button" role="switch" aria-checked={product.status === "active"} disabled={busy} onClick={() => void setProductStatus(product, product.status === "active" ? "draft" : "active")} aria-label={`${product.title} yayın durumunu değiştir`}><span /></button></td>
                  <td className="row-actions" data-label="İşlemler"><Link className="icon-button" href={`/products/${product.id}`} aria-label={`${product.title} ürününü görüntüle`}><Eye /></Link><Link className="icon-button" href={`/products/${product.id}`} aria-label={`${product.title} ürününü düzenle`}><Pencil /></Link><button ref={archiveCandidate?.id === product.id ? archiveTriggerRef : undefined} className="icon-button danger" type="button" disabled={busy} onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setArchiveCandidate(product); }} aria-label={`${product.title} ürününü arşivle`}><Trash2 /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor ? <button className="button button-secondary load-more" type="button" onClick={() => void load({ cursor: nextCursor })} disabled={loadingMore || loading || busy}>{loadingMore ? "Yükleniyor…" : "Daha fazla yükle"}</button> : null}

      {archiveCandidate ? (
        <div className="archive-dialog-layer">
          <div ref={archiveDialogRef} className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="archive-title" aria-describedby="archive-description" tabIndex={-1} onKeyDown={handleArchiveDialogKeyDown}>
            <div><strong id="archive-title">Arşivlemeyi onayla</strong><p id="archive-description"><b>{archiveCandidate.title}</b> varsayılan ürün listesinden kaldırılacak.</p></div>
            <div className="confirmation-actions"><button ref={archiveCancelButtonRef} className="button button-secondary" type="button" onClick={closeArchiveDialog} disabled={busy}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void archive()} disabled={busy}>{busy ? "Arşivleniyor…" : "Ürünü arşivle"}</button></div>
          </div>
        </div>
      ) : null}

      {bulkArchiveConfirmation ? (
        <div className="archive-dialog-layer">
          <div className="archive-dialog" role="alertdialog" aria-modal="true" aria-labelledby="bulk-archive-title" aria-describedby="bulk-archive-description">
            <div><strong id="bulk-archive-title">Toplu arşivlemeyi onayla</strong><p id="bulk-archive-description">{bulkArchiveConfirmationMessage(selected.length)} Bu işlem yalnız onaydan sonra başlayacak.</p></div>
            <div className="confirmation-actions"><button className="button button-secondary" type="button" onClick={() => setBulkArchiveConfirmation(false)} disabled={busy}>Vazgeç</button><button className="button button-danger" type="button" onClick={() => void executeConfirmedBulkAction()} disabled={busy}>{busy ? "Arşivleniyor…" : `${selected.length} ürünü arşivle`}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
