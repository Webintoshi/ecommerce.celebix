"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { OrderListItem, OrderPaymentStatus, OrderSort, OrderStatus } from "@celebix/saas-contracts";

import { PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import { ArrowDownUp, ArrowRight, Check, ChevronDown, ChevronRight, Clock3, Columns3, Download, Package, Plus, RefreshCw, Search, ShoppingBag, SlidersHorizontal, Store, X } from "lucide-react";
import { OrderActionDialog } from "./OrderActionDialog";
import styles from "./order-list.module.css";

type ListState = "loading" | "loaded" | "error";
type OrderListPage = Awaited<ReturnType<typeof orderApi.listOrders>>;
export type OrderDateRange = "all" | "today" | "last7" | "last30";
export type OrderFulfillment = "all" | "unfulfilled" | "preparing" | "shipped" | "delivered" | "not_applicable";
export type OrderColumnKey = "date" | "customer" | "status" | "payment" | "items" | "source" | "total";
export type OrderColumnVisibility = Readonly<Record<OrderColumnKey, boolean>>;

const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  pending: "Oluşturuldu",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal",
  refunded: "İade",
});
const PAYMENT_LABELS: Readonly<Record<OrderPaymentStatus, string>> = Object.freeze({
  pending: "Ödeme bekleniyor",
  processing: "İşleniyor",
  completed: "Başarılı",
  failed: "Başarısız",
  refunded: "İade edildi",
});
const SOURCE_LABELS: Readonly<Record<OrderListItem["source"], string>> = Object.freeze({
  storefront: "Online mağaza",
  quick_link: "Hızlı sipariş",
  marketplace: "Pazar yeri",
  manual_import: "Manuel aktarım",
  manual: "Manuel sipariş",
  in_store: "Mağaza satışı",
});
const FULFILLMENT_FILTER_LABELS: Readonly<Record<OrderFulfillment, string>> = Object.freeze({
  all: "Tüm teslimatlar",
  unfulfilled: "Hazırlama bekliyor",
  preparing: "Hazırlanıyor",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  not_applicable: "Teslimat dışı",
});
const COLUMN_LABELS: Readonly<Record<OrderColumnKey, string>> = Object.freeze({
  date: "Tarih",
  customer: "Müşteri",
  status: "Durum",
  payment: "Ödeme",
  items: "Ürün",
  source: "Kanal",
  total: "Toplam",
});
const DEFAULT_VISIBLE_COLUMNS: OrderColumnVisibility = Object.freeze({
  date: true,
  customer: true,
  status: true,
  payment: true,
  items: true,
  source: true,
  total: true,
});

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function tone(status: OrderStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "delivered") return "success";
  if (status === "cancelled" || status === "refunded") return "danger";
  if (status === "pending" || status === "preparing") return "warning";
  return "neutral";
}

function fulfillment(status: OrderStatus): Exclude<OrderFulfillment, "all"> {
  if (status === "pending" || status === "confirmed") return "unfulfilled";
  if (status === "preparing") return "preparing";
  if (status === "shipped") return "shipped";
  if (status === "delivered") return "delivered";
  return "not_applicable";
}

function fulfillmentLabel(status: OrderStatus, source?: OrderListItem["source"]) {
  if (source === "in_store") return "Mağazadan teslim";
  if (status === "pending") return "Onay bekliyor";
  if (status === "confirmed") return "Hazırlama bekliyor";
  return FULFILLMENT_FILTER_LABELS[fulfillment(status)];
}

export function filterOrderListItems(
  items: readonly OrderListItem[],
  filters: Readonly<{
    dateRange: OrderDateRange;
    payment: OrderPaymentStatus | "all";
    fulfillment: OrderFulfillment;
  }>,
  now = new Date(),
): readonly OrderListItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const threshold = new Date(today);
  if (filters.dateRange === "last7") threshold.setDate(threshold.getDate() - 6);
  if (filters.dateRange === "last30") threshold.setDate(threshold.getDate() - 29);
  const filtered = items.filter((order) => {
    const createdAt = new Date(order.createdAt);
    const dateMatches = filters.dateRange === "all" || (
      Number.isFinite(createdAt.getTime()) && createdAt >= threshold && (
        filters.dateRange !== "today" || createdAt < new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      )
    );
    const paymentMatches = filters.payment === "all" || order.paymentStatus === filters.payment;
    const fulfillmentMatches = filters.fulfillment === "all" || (order.source === "in_store" ? "not_applicable" : fulfillment(order.status)) === filters.fulfillment;
    return dateMatches && paymentMatches && fulfillmentMatches;
  });
  return Object.freeze(filtered);
}

function csvCell(value: string | number) {
  const raw = String(value);
  const text = typeof value === "string" && /^[\t ]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function serializeOrderListCsv(items: readonly OrderListItem[]) {
  const header = ["Sipariş No", "Tarih", "Müşteri", "E-posta", "Durum", "Ödeme", "Teslimat", "Kanal", "Ürün Adedi", "Toplam", "Para Birimi"];
  const rows = items.map((order) => [
    order.orderNumber,
    order.createdAt,
    order.customerName ?? "Mağaza müşterisi",
    order.customerEmail ?? "",
    STATUS_LABELS[order.status],
    PAYMENT_LABELS[order.paymentStatus],
    fulfillmentLabel(order.status, order.source),
    SOURCE_LABELS[order.source],
    order.itemCount,
    (order.totalCents / 100).toFixed(2),
    order.currency,
  ].map(csvCell).join(","));
  return `\uFEFF${header.join(",")}\r\n${rows.join("\r\n")}${rows.length ? "\r\n" : ""}`;
}

export async function requestOrderListPage(
  api: Pick<typeof orderApi, "listOrders">,
  input: Readonly<{ cursor?: string; status: OrderStatus | "all"; search: string; sort: OrderSort }>,
): Promise<OrderListPage> {
  return api.listOrders({
    pageSize: 20,
    ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
    ...(input.status === "all" ? {} : { status: input.status }),
    ...(input.search === "" ? {} : { search: input.search }),
    sort: input.sort,
  });
}

export function mergeOrderListPage(
  current: readonly OrderListItem[],
  result: Pick<OrderListPage, "items">,
  append: boolean,
): readonly OrderListItem[] {
  return append ? Object.freeze([...current, ...result.items]) : result.items;
}

export interface OrderListPresentationProps {
  readonly state: ListState;
  readonly items: readonly OrderListItem[];
  readonly error: string;
  readonly search: string;
  readonly status: OrderStatus | "all";
  readonly sort: OrderSort;
  readonly dateRange: OrderDateRange;
  readonly payment: OrderPaymentStatus | "all";
  readonly fulfillment: OrderFulfillment;
  readonly loadedCount: number;
  readonly visibleColumns: OrderColumnVisibility;
  readonly nextCursor?: string;
  readonly loadingMore: boolean;
  readonly loadMoreError?: string;
  readonly onRetry: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onStatusChange: (value: OrderStatus | "all") => void;
  readonly onSortChange: (value: OrderSort) => void;
  readonly onDateRangeChange: (value: OrderDateRange) => void;
  readonly onPaymentChange: (value: OrderPaymentStatus | "all") => void;
  readonly onFulfillmentChange: (value: OrderFulfillment) => void;
  readonly onColumnVisibilityChange: (column: OrderColumnKey, visible: boolean) => void;
  readonly onExport: () => void;
  readonly onLoadMore: () => void;
  readonly onSearchSubmit?: () => void;
  readonly onClearSearch?: () => void;
  readonly onReset?: () => void;
}

function OrderStateBadge({ order }: { order: OrderListItem }) {
  return <span className={styles.statusBadge}><PanelStatusBadge tone={tone(order.status)}>{order.status === "delivered" ? <Check aria-hidden="true" /> : order.status === "pending" ? <Clock3 aria-hidden="true" /> : <span className={styles.statusDot} aria-hidden="true" />}{STATUS_LABELS[order.status]}</PanelStatusBadge></span>;
}

function PaymentStatus({ status }: { status: OrderPaymentStatus }) {
  return <span className={styles.paymentBadge} data-state={status}><span className={styles.statusDot} aria-hidden="true" />{PAYMENT_LABELS[status]}</span>;
}

function OrderCard({ order, visibleColumns }: { order: OrderListItem; visibleColumns: OrderColumnVisibility }) {
  return (
    <article className={styles.orderCard}>
      <div className={styles.cardHeading}>
        <div className={styles.cardOrderIdentity}><Link className={styles.orderLink} href={`/orders/${order.id}`}>{order.orderNumber}</Link>{visibleColumns.date ? <small>{date(order.createdAt)}</small> : null}</div>
        {visibleColumns.total ? <strong className={styles.cardTotal}>{money(order.totalCents, order.currency)}</strong> : null}
      </div>
      {visibleColumns.customer ? <div className={styles.cardCustomer}><strong>{order.customerName ?? "Mağaza müşterisi"}</strong>{order.customerEmail ? <small>{order.customerEmail}</small> : null}</div> : null}
      <div className={styles.cardStatuses}>{visibleColumns.status ? <OrderStateBadge order={order} /> : null}{visibleColumns.payment ? <PaymentStatus status={order.paymentStatus} /> : null}</div>
      <div className={styles.cardFooter}><div className={styles.cardMeta}>{visibleColumns.items ? <span><Package aria-hidden="true" />{order.itemCount.toLocaleString("tr-TR")} ürün</span> : null}{visibleColumns.source ? <span>{order.source === "in_store" ? <Store aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}{SOURCE_LABELS[order.source]}</span> : null}</div><Link className={styles.detailLink} href={`/orders/${order.id}`} aria-label={`${order.orderNumber} — Sipariş detayını aç`}>Detay <ArrowRight aria-hidden="true" /></Link></div>
    </article>
  );
}

export function OrderListPresentation(props: OrderListPresentationProps) {
  const [dialog, setDialog] = useState<"filters" | "columns" | "export" | null>(null);
  const [draft, setDraft] = useState({ status: props.status, dateRange: props.dateRange, payment: props.payment, fulfillment: props.fulfillment });
  const searchRef = useRef<HTMLInputElement>(null);
  const activeFilters = Number(props.status !== "all") + Number(props.dateRange !== "all") + Number(props.payment !== "all") + Number(props.fulfillment !== "all");
  const hasLocalFilter = props.dateRange !== "all" || props.payment !== "all" || props.fulfillment !== "all";

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !document.querySelector("dialog[open]")) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function resetFilters() {
    if (props.onReset) props.onReset();
    else {
      props.onStatusChange("all"); props.onDateRangeChange("all"); props.onPaymentChange("all"); props.onFulfillmentChange("all");
    }
  }
  function openFilters() {
    setDraft({ status: props.status, dateRange: props.dateRange, payment: props.payment, fulfillment: props.fulfillment });
    setDialog("filters");
  }
  function clearSearch() {
    if (props.onClearSearch) props.onClearSearch();
    else props.onSearchChange("");
    searchRef.current?.focus();
  }
  function applyFilters(event: FormEvent) {
    event.preventDefault();
    props.onStatusChange(draft.status); props.onDateRangeChange(draft.dateRange); props.onPaymentChange(draft.payment); props.onFulfillmentChange(draft.fulfillment);
    setDialog(null);
  }

  const content = props.state === "loading" ? (
    <div className={styles.loading} role="status" aria-live="polite"><span className="sr-only">Siparişler yükleniyor…</span><div className={styles.skeletonRows} aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <div key={i}><span /><span /><span /><span /></div>)}</div></div>
  ) : props.state === "error" ? (
    <div className={styles.errorState} role="alert"><div><h2>Siparişler yüklenemedi</h2><p>{props.error}</p></div><button className={styles.button} type="button" onClick={props.onRetry}><RefreshCw aria-hidden="true" />Tekrar dene</button></div>
  ) : props.items.length === 0 ? (
    <div className={styles.emptyState}><Search aria-hidden="true" /><h2>{props.loadedCount > 0 || activeFilters > 0 || props.search ? "Filtrelerle eşleşen sipariş yok" : "Henüz sipariş bulunmuyor"}</h2>{props.loadedCount > 0 || activeFilters > 0 ? <button className={styles.quietButton} type="button" onClick={() => { resetFilters(); if (props.search) clearSearch(); }}>{props.search ? "Arama ve filtreleri temizle" : "Filtreleri temizle"} <X aria-hidden="true" /></button> : props.search ? <button className={styles.quietButton} type="button" onClick={clearSearch}>Aramayı temizle <X aria-hidden="true" /></button> : null}</div>
  ) : (
    <>
      <div className={styles.desktopTable} role="region" aria-label="Sipariş tablosu" tabIndex={0}>
        <table aria-label="Sipariş listesi"><thead><tr><th scope="col">Sipariş</th>{props.visibleColumns.date ? <th scope="col">Tarih</th> : null}{props.visibleColumns.customer ? <th scope="col">Müşteri</th> : null}{props.visibleColumns.status ? <th scope="col">Durum</th> : null}{props.visibleColumns.payment ? <th scope="col">Ödeme</th> : null}{props.visibleColumns.items ? <th scope="col" className={styles.itemsCell}>Ürün</th> : null}{props.visibleColumns.source ? <th scope="col">Kanal</th> : null}{props.visibleColumns.total ? <th scope="col" className={styles.totalCell}>Toplam</th> : null}<th scope="col"><span className="sr-only">Detay</span></th></tr></thead>
        <tbody>{props.items.map((order) => <tr key={order.id}>
          <td className={styles.orderCell}><Link className={styles.orderLink} href={`/orders/${order.id}`}>{order.orderNumber}</Link><small>{fulfillmentLabel(order.status, order.source)}</small></td>
          {props.visibleColumns.date ? <td className={styles.dateCell}><time dateTime={order.createdAt}>{new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(order.createdAt))}<small>{new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(new Date(order.createdAt))}</small></time></td> : null}
          {props.visibleColumns.customer ? <td className={styles.customerCell}><strong>{order.customerName ?? "Mağaza müşterisi"}</strong>{order.customerEmail ? <small title={order.customerEmail}>{order.customerEmail}</small> : null}</td> : null}
          {props.visibleColumns.status ? <td><OrderStateBadge order={order} /></td> : null}{props.visibleColumns.payment ? <td><PaymentStatus status={order.paymentStatus} /></td> : null}
          {props.visibleColumns.items ? <td className={styles.itemsCell}>{order.itemCount.toLocaleString("tr-TR")}</td> : null}
          {props.visibleColumns.source ? <td><span className={styles.channelBadge}>{order.source === "in_store" ? <Store aria-hidden="true" /> : <ShoppingBag aria-hidden="true" />}{SOURCE_LABELS[order.source]}</span></td> : null}
          {props.visibleColumns.total ? <td className={styles.totalCell}><strong>{money(order.totalCents, order.currency)}</strong></td> : null}
          <td className={styles.actionCell}><Link className={styles.rowDetailLink} href={`/orders/${order.id}`} aria-label={`${order.orderNumber} — Sipariş detayını aç`}><ChevronRight aria-hidden="true" /></Link></td>
        </tr>)}</tbody></table>
      </div>
      <div className={styles.mobileCards}>{props.items.map((order) => <OrderCard key={order.id} order={order} visibleColumns={props.visibleColumns} />)}</div>
    </>
  );

  return <PanelPageShell>
    <h1 className="sr-only">Tüm siparişler</h1>
    <section className={styles.listSurface} aria-label="Sipariş çalışma alanı" data-panel-surface="open">
      <div className={styles.toolbar}>
        <form className={styles.searchField} role="search" onSubmit={(event) => { event.preventDefault(); props.onSearchSubmit?.(); }}><Search aria-hidden="true" /><label className="sr-only" htmlFor="order-search">Sipariş ara</label><input ref={searchRef} id="order-search" type="search" value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Sipariş, müşteri, e-posta veya telefon ara" maxLength={200} />{props.search ? <button className={styles.iconButton} type="button" aria-label="Aramayı temizle" onClick={clearSearch}><X aria-hidden="true" /></button> : null}<button className={styles.iconButton} type="submit" aria-label="Ara"><ArrowRight aria-hidden="true" /></button></form>
        <div className={styles.toolbarActions}><button className={styles.iconButton} type="button" disabled={props.state === "loading" || props.loadingMore} onClick={props.onRetry} aria-label="Siparişleri yenile"><RefreshCw aria-hidden="true" /></button><button className={styles.iconButton} type="button" onClick={() => setDialog("columns")} aria-label="Sütunlar" aria-haspopup="dialog"><Columns3 aria-hidden="true" /></button><button className={styles.exportButton} type="button" disabled={props.state !== "loaded" || props.items.length === 0} onClick={() => setDialog("export")} aria-label="CSV Dışa Aktar" aria-haspopup="dialog"><Download aria-hidden="true" /><span>CSV</span></button><Link className={styles.primaryAction} href="/orders/drafts/new"><Plus aria-hidden="true" /><span>Manuel sipariş</span></Link></div>
      </div>
      <div className={styles.viewbar}><div className={styles.statusShortcuts} aria-label="Sipariş durumu">{([ ["all", "Tümü"], ["pending", "Onay bekleyen"], ["preparing", "Hazırlanıyor"], ["shipped", "Kargolandı"], ["delivered", "Teslim edildi"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={props.status === value} className={props.status === value ? styles.activeShortcut : styles.shortcut} onClick={() => props.onStatusChange(value)}>{label}</button>)}</div><div className={styles.viewTools}><button className={styles.quietButton} type="button" onClick={openFilters} aria-haspopup="dialog"><SlidersHorizontal aria-hidden="true" />Filtreler{activeFilters ? <span className={styles.filterCount}>{activeFilters}</span> : null}</button><label className={styles.sortControl}><ArrowDownUp aria-hidden="true" /><span className="sr-only">Sıralama</span><select value={props.sort} onChange={(event) => props.onSortChange(event.target.value as OrderSort)}><option value="newest">En yeni</option><option value="oldest">En eski</option><option value="highest">Tutar: yüksekten</option><option value="lowest">Tutar: düşükten</option></select></label></div></div>
      {activeFilters > 0 ? <div className={styles.appliedFilters}><span>{props.state === "loaded" ? `${props.items.length} gösteriliyor` : "Filtreler uygulanıyor"}{hasLocalFilter ? " · Yüklenen siparişlerde" : ""}</span><button className={styles.quietButton} type="button" onClick={resetFilters}>Filtreleri temizle <X aria-hidden="true" /></button></div> : null}
      <div className={styles.dataSurface} aria-busy={props.state === "loading"}>{content}</div>
      {props.state === "loaded" ? <footer className={styles.listFooter}><span>{props.items.length} gösteriliyor · {props.loadedCount} sipariş yüklendi</span><div>{props.loadMoreError ? <div className={styles.loadMoreError} role="alert"><span>{props.loadMoreError}</span></div> : null}{props.nextCursor ? <button className={styles.loadMore} type="button" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? "Yükleniyor…" : props.loadMoreError ? "Tekrar dene" : "Daha fazla sipariş yükle"}<ChevronDown aria-hidden="true" /></button> : null}</div></footer> : null}
    </section>
    <OrderActionDialog open={dialog === "filters"} title="Filtreler" onClose={() => setDialog(null)} footer={<><button className={styles.quietButton} type="button" onClick={() => setDraft({ status: "all", dateRange: "all", payment: "all", fulfillment: "all" })}>Temizle</button><button className={styles.primaryAction} type="submit" form="order-filter-form">Uygula</button></>}><form id="order-filter-form" onSubmit={applyFilters} className={styles.filterForm}><label>Sipariş durumu<select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as OrderStatus | "all" }))}><option value="all">Tüm durumlar</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><div className={styles.loadedScope}>Tarih, ödeme ve teslimat: yüklenen siparişlerde.</div><div className={styles.localFilters}><label>Tarih aralığı<select value={draft.dateRange} onChange={(event) => setDraft((current) => ({ ...current, dateRange: event.target.value as OrderDateRange }))}><option value="all">Tüm tarihler</option><option value="today">Bugün</option><option value="last7">Son 7 gün</option><option value="last30">Son 30 gün</option></select></label><label>Ödeme durumu<select value={draft.payment} onChange={(event) => setDraft((current) => ({ ...current, payment: event.target.value as OrderPaymentStatus | "all" }))}><option value="all">Tüm ödemeler</option>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Teslimat durumu<select value={draft.fulfillment} onChange={(event) => setDraft((current) => ({ ...current, fulfillment: event.target.value as OrderFulfillment }))}>{Object.entries(FULFILLMENT_FILTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></form></OrderActionDialog>
    <OrderActionDialog open={dialog === "columns"} title="Sütunlar" onClose={() => setDialog(null)} footer={<button className={styles.button} type="button" onClick={() => setDialog(null)}>Tamam</button>}><div className={styles.columnPicker}>{(Object.entries(COLUMN_LABELS) as [OrderColumnKey, string][]).map(([column, label]) => <label key={column}><input type="checkbox" checked={props.visibleColumns[column]} onChange={(event) => props.onColumnVisibilityChange(column, event.target.checked)} aria-label={`${label} sütununu göster`} />{label}</label>)}</div></OrderActionDialog>
    <OrderActionDialog open={dialog === "export"} title="CSV dışa aktar" onClose={() => setDialog(null)} footer={<><button className={styles.quietButton} type="button" onClick={() => setDialog(null)}>Vazgeç</button><button className={styles.primaryAction} type="button" disabled={props.state !== "loaded" || !props.items.length} onClick={() => { props.onExport(); setDialog(null); }}><Download aria-hidden="true" />CSV indir</button></>}><p className={styles.exportScope}>Mevcut filtrelerle görüntülenen <strong>{props.items.length} sipariş</strong> dışa aktarılacak.</p><p className={styles.loadedScope}>Yalnızca yüklenen siparişler dahil.</p></OrderActionDialog>
  </PanelPageShell>;
}

function message(error: unknown) {
  return error instanceof OrderApiError ? error.message : "Siparişler yüklenemedi. Lütfen yeniden deneyin.";
}

export function OrderListConsole() {
  const [state, setState] = useState<ListState>("loading");
  const [items, setItems] = useState<readonly OrderListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [loadMoreError, setLoadMoreError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<OrderSort>("newest");
  const [dateRange, setDateRange] = useState<OrderDateRange>("all");
  const [payment, setPayment] = useState<OrderPaymentStatus | "all">("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<OrderFulfillment>("all");
  const [visibleColumns, setVisibleColumns] = useState<OrderColumnVisibility>(DEFAULT_VISIBLE_COLUMNS);
  const sequence = useRef(0);
  const appendRequest = useRef(false);

  const load = useCallback(async (cursor?: string) => {
    if (cursor && appendRequest.current) return;
    const request = ++sequence.current;
    appendRequest.current = cursor !== undefined;
    setLoadingMore(cursor !== undefined);
    if (!cursor) setState("loading");
    setError(""); setLoadMoreError("");
    try {
      const result = await requestOrderListPage(orderApi, { ...(cursor ? { cursor } : {}), status, search, sort });
      if (request !== sequence.current) return;
      setItems((current) => mergeOrderListPage(current, result, cursor !== undefined));
      setNextCursor(result.nextCursor);
      setState("loaded");
    } catch (failure) {
      if (request !== sequence.current) return;
      if (cursor) setLoadMoreError(message(failure));
      else { setError(message(failure)); setState("error"); }
    } finally {
      if (request === sequence.current) { appendRequest.current = false; setLoadingMore(false); }
    }
  }, [search, sort, status]);

  useEffect(() => { void load(); return () => { sequence.current += 1; appendRequest.current = false; }; }, [load]);

  function submitSearch(event?: FormEvent) {
    event?.preventDefault();
    const normalized = searchInput.trim();
    if (normalized.length <= 200) {
      if (normalized === search) void load();
      else setSearch(normalized);
    }
  }

  const filteredItems = useMemo(() => filterOrderListItems(items, { dateRange, payment, fulfillment: fulfillmentFilter }), [dateRange, fulfillmentFilter, items, payment]);

  function exportCsv() {
    const blob = new Blob([serializeOrderListCsv(filteredItems)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `siparisler-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function clearSearch() { setSearchInput(""); setSearch(""); }
  function resetFilters() { setStatus("all"); setDateRange("all"); setPayment("all"); setFulfillmentFilter("all"); }

  return <OrderListPresentation state={state} items={filteredItems} loadedCount={items.length} error={error} loadMoreError={loadMoreError} search={searchInput} status={status} sort={sort} dateRange={dateRange} payment={payment} fulfillment={fulfillmentFilter} visibleColumns={visibleColumns} nextCursor={nextCursor} loadingMore={loadingMore} onRetry={() => { void load(); }} onSearchChange={setSearchInput} onSearchSubmit={() => submitSearch()} onClearSearch={clearSearch} onReset={resetFilters} onStatusChange={setStatus} onSortChange={setSort} onDateRangeChange={setDateRange} onPaymentChange={setPayment} onFulfillmentChange={setFulfillmentFilter} onColumnVisibilityChange={(column, visible) => setVisibleColumns((current) => Object.freeze({ ...current, [column]: visible }))} onExport={exportCsv} onLoadMore={() => { if (nextCursor) void load(nextCursor); }} />;
}
