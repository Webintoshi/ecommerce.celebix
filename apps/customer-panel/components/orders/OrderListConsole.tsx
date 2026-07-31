"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { OrderListItem, OrderPaymentStatus, OrderSort, OrderStatus } from "@celebix/saas-contracts";

import { PanelEmptyState, PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import styles from "./order-console.module.css";

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

function fulfillmentLabel(status: OrderStatus) {
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
    const fulfillmentMatches = filters.fulfillment === "all" || fulfillment(order.status) === filters.fulfillment;
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
    order.customerName,
    order.customerEmail,
    STATUS_LABELS[order.status],
    PAYMENT_LABELS[order.paymentStatus],
    fulfillmentLabel(order.status),
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
}

function OrderCard({ order, visibleColumns }: { order: OrderListItem; visibleColumns: OrderColumnVisibility }) {
  return (
    <article className={styles.orderCard}>
      <div className={styles.cardHeading}>
        <Link href={`/orders/${order.id}`}>{order.orderNumber}</Link>
        {visibleColumns.status ? <PanelStatusBadge tone={tone(order.status)}>{STATUS_LABELS[order.status]}</PanelStatusBadge> : null}
      </div>
      <dl className={styles.cardFacts}>
        {visibleColumns.customer ? <div><dt>Müşteri</dt><dd>{order.customerName}<small>{order.customerEmail}</small></dd></div> : null}
        {visibleColumns.payment ? <div><dt>Ödeme</dt><dd>{PAYMENT_LABELS[order.paymentStatus]}</dd></div> : null}
        {visibleColumns.total ? <div><dt>Toplam</dt><dd>{money(order.totalCents, order.currency)}</dd></div> : null}
        {visibleColumns.date ? <div><dt>Tarih</dt><dd>{date(order.createdAt)}</dd></div> : null}
        {visibleColumns.items ? <div><dt>Ürün</dt><dd>{order.itemCount.toLocaleString("tr-TR")}</dd></div> : null}
        {visibleColumns.source ? <div><dt>Kanal</dt><dd>{SOURCE_LABELS[order.source]}</dd></div> : null}
      </dl>
      <Link className={styles.detailLink} href={`/orders/${order.id}`}>Sipariş ayrıntısını aç</Link>
    </article>
  );
}

export function OrderListPresentation(props: OrderListPresentationProps) {
  const scope = props.state === "loading"
    ? "Sipariş kapsamı yükleniyor."
    : props.state === "error"
      ? "Sipariş kapsamı şu anda kullanılamıyor."
      : `Filtreler yüklenen ${props.loadedCount.toLocaleString("tr-TR")} sipariş üzerinde uygulanır.${props.nextCursor ? " Daha fazla yükledikçe kapsam genişler." : " Yüklenen sonuçların tamamı kapsamdadır."}`;
  const content = props.state === "loading" ? (
    <div className={styles.loading} role="status" aria-live="polite">Siparişler yükleniyor…</div>
  ) : props.state === "error" ? (
    <div className={styles.errorState} role="alert">
      <div><h2>Siparişler yüklenemedi</h2><p>{props.error}</p></div>
      <button type="button" onClick={props.onRetry}>Tekrar dene</button>
    </div>
  ) : props.items.length === 0 ? (
    props.loadedCount > 0
      ? <PanelEmptyState title="Filtrelerle eşleşen sipariş yok" description="Tarih, ödeme veya teslimat filtresini değiştirin." />
      : <PanelEmptyState title="Henüz sipariş bulunmuyor" description="İlk gerçek sipariş oluştuğunda bu listede görünecek." />
  ) : (
    <>
      <div className={styles.desktopTable}>
        <table aria-label="Sipariş listesi">
          <thead><tr><th>Sipariş</th>{props.visibleColumns.date ? <th>Tarih</th> : null}{props.visibleColumns.customer ? <th>Müşteri</th> : null}{props.visibleColumns.status ? <th>Durum</th> : null}{props.visibleColumns.payment ? <th>Ödeme</th> : null}{props.visibleColumns.items ? <th>Ürün</th> : null}{props.visibleColumns.source ? <th>Kanal</th> : null}{props.visibleColumns.total ? <th>Toplam</th> : null}<th>İşlem</th></tr></thead>
          <tbody>{props.items.map((order) => (
            <tr key={order.id}>
              <td><Link className={styles.orderLink} href={`/orders/${order.id}`}>{order.orderNumber}</Link></td>
              {props.visibleColumns.date ? <td>{date(order.createdAt)}</td> : null}
              {props.visibleColumns.customer ? <td><strong>{order.customerName}</strong><small>{order.customerEmail}</small></td> : null}
              {props.visibleColumns.status ? <td><PanelStatusBadge tone={tone(order.status)}>{STATUS_LABELS[order.status]}</PanelStatusBadge></td> : null}
              {props.visibleColumns.payment ? <td>{PAYMENT_LABELS[order.paymentStatus]}</td> : null}
              {props.visibleColumns.items ? <td>{order.itemCount.toLocaleString("tr-TR")}</td> : null}
              {props.visibleColumns.source ? <td>{SOURCE_LABELS[order.source]}</td> : null}
              {props.visibleColumns.total ? <td><strong>{money(order.totalCents, order.currency)}</strong></td> : null}
              <td><Link className={styles.rowDetailLink} href={`/orders/${order.id}`}>Sipariş detayını aç</Link></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={styles.mobileCards}>{props.items.map((order) => <OrderCard key={order.id} order={order} visibleColumns={props.visibleColumns} />)}</div>
    </>
  );

  return (
    <PanelPageShell>
      <PanelPageHeader title="Siparişler" description="Sipariş, ödeme ve teslimat akışını gerçek mağaza verileriyle yönetin." />
      <section className={styles.listSurface} aria-labelledby="orders-list-title">
        <div className={styles.surfaceHeading}><div><h2 id="orders-list-title">Tüm Siparişler</h2><p>Arama, durum ve sıralama sunucuda; ek filtreler yüklenen siparişlerde uygulanır.</p></div></div>
        <form className={styles.toolbar} role="search" onSubmit={(event) => { event.preventDefault(); props.onSearchSubmit?.(); }}>
          <label className={styles.searchField}><span className="sr-only">Sipariş ara</span><input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Sipariş ara" maxLength={200} /><button type="submit">Ara</button></label>
          <label><span className="sr-only">Sipariş durumu</span><select value={props.status} onChange={(event) => props.onStatusChange(event.target.value as OrderStatus | "all")}><option value="all">Tüm durumlar</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">Sıralama</span><select value={props.sort} onChange={(event) => props.onSortChange(event.target.value as OrderSort)}><option value="newest">En yeni</option><option value="oldest">En eski</option><option value="highest">Tutar: yüksekten düşüğe</option><option value="lowest">Tutar: düşükten yükseğe</option></select></label>
        </form>
        <div className={styles.filterToolbar} aria-label="Yüklenen sipariş filtreleri">
          <label><span>Tarih aralığı</span><select value={props.dateRange} onChange={(event) => props.onDateRangeChange(event.target.value as OrderDateRange)}><option value="all">Tüm tarihler</option><option value="today">Bugün</option><option value="last7">Son 7 gün</option><option value="last30">Son 30 gün</option></select></label>
          <label><span>Ödeme durumu</span><select value={props.payment} onChange={(event) => props.onPaymentChange(event.target.value as OrderPaymentStatus | "all")}><option value="all">Tüm ödemeler</option>{Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Teslimat durumu</span><select value={props.fulfillment} onChange={(event) => props.onFulfillmentChange(event.target.value as OrderFulfillment)}>{Object.entries(FULFILLMENT_FILTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <details className={styles.columnPicker}>
            <summary>Sütunlar</summary>
            <div>{(Object.entries(COLUMN_LABELS) as [OrderColumnKey, string][]).map(([column, label]) => <label key={column}><input type="checkbox" checked={props.visibleColumns[column]} onChange={(event) => props.onColumnVisibilityChange(column, event.target.checked)} aria-label={`${label} sütununu göster`} />{label}</label>)}</div>
          </details>
          <button className={styles.exportButton} type="button" disabled={props.state !== "loaded" || props.items.length === 0} onClick={props.onExport}>CSV Dışa Aktar</button>
        </div>
        <p className={styles.scopeNote}>{scope} Teslimat filtresi sipariş durumundan türetilir.</p>
        {content}
        {props.state === "loaded" && props.nextCursor ? <button className={styles.loadMore} type="button" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? "Yükleniyor…" : "Daha fazla sipariş yükle"}</button> : null}
      </section>
    </PanelPageShell>
  );
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
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [sort, setSort] = useState<OrderSort>("newest");
  const [dateRange, setDateRange] = useState<OrderDateRange>("all");
  const [payment, setPayment] = useState<OrderPaymentStatus | "all">("all");
  const [fulfillmentFilter, setFulfillmentFilter] = useState<OrderFulfillment>("all");
  const [visibleColumns, setVisibleColumns] = useState<OrderColumnVisibility>(DEFAULT_VISIBLE_COLUMNS);
  const sequence = useRef(0);

  const load = useCallback(async (cursor?: string) => {
    const request = ++sequence.current;
    cursor ? setLoadingMore(true) : setState("loading");
    setError("");
    try {
      const result = await requestOrderListPage(orderApi, { ...(cursor ? { cursor } : {}), status, search, sort });
      if (request !== sequence.current) return;
      setItems((current) => mergeOrderListPage(current, result, cursor !== undefined));
      setNextCursor(result.nextCursor);
      setState("loaded");
    } catch (failure) {
      if (request !== sequence.current) return;
      setError(message(failure));
      setState("error");
    } finally {
      if (request === sequence.current) setLoadingMore(false);
    }
  }, [search, sort, status]);

  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);

  function submitSearch(event?: FormEvent) {
    event?.preventDefault();
    const normalized = searchInput.trim();
    if (normalized.length === 0 || normalized.length <= 200) setSearch(normalized);
  }

  const filteredItems = useMemo(
    () => filterOrderListItems(items, { dateRange, payment, fulfillment: fulfillmentFilter }),
    [dateRange, fulfillmentFilter, items, payment],
  );

  function exportCsv() {
    const blob = new Blob([serializeOrderListCsv(filteredItems)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `siparisler-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return <OrderListPresentation state={state} items={filteredItems} loadedCount={items.length} error={error} search={searchInput} status={status} sort={sort} dateRange={dateRange} payment={payment} fulfillment={fulfillmentFilter} visibleColumns={visibleColumns} nextCursor={nextCursor} loadingMore={loadingMore} onRetry={() => { void load(); }} onSearchChange={setSearchInput} onSearchSubmit={() => submitSearch()} onStatusChange={setStatus} onSortChange={setSort} onDateRangeChange={setDateRange} onPaymentChange={setPayment} onFulfillmentChange={setFulfillmentFilter} onColumnVisibilityChange={(column, visible) => setVisibleColumns((current) => Object.freeze({ ...current, [column]: visible }))} onExport={exportCsv} onLoadMore={() => { if (nextCursor) void load(nextCursor); }} />;
}
