"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { OrderListItem, OrderStatus } from "@celebix/saas-contracts";

import { PanelEmptyState, PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import styles from "./order-console.module.css";

type Sort = "newest" | "oldest" | "highest" | "lowest";
type ListState = "loading" | "loaded" | "error";

const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  pending: "Oluşturuldu",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  shipped: "Kargolandı",
  delivered: "Teslim edildi",
  cancelled: "İptal",
  refunded: "İade",
});
const PAYMENT_LABELS = Object.freeze({
  pending: "Ödeme bekleniyor",
  processing: "İşleniyor",
  completed: "Başarılı",
  failed: "Başarısız",
  refunded: "İade edildi",
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

export interface OrderListPresentationProps {
  readonly state: ListState;
  readonly items: readonly OrderListItem[];
  readonly error: string;
  readonly search: string;
  readonly status: OrderStatus | "all";
  readonly sort: Sort;
  readonly nextCursor?: string;
  readonly loadingMore: boolean;
  readonly onRetry: () => void;
  readonly onSearchChange: (value: string) => void;
  readonly onStatusChange: (value: OrderStatus | "all") => void;
  readonly onSortChange: (value: Sort) => void;
  readonly onLoadMore: () => void;
  readonly onSearchSubmit?: () => void;
}

function OrderCard({ order }: { order: OrderListItem }) {
  return (
    <article className={styles.orderCard}>
      <div className={styles.cardHeading}>
        <Link href={`/orders/${order.id}`}>{order.orderNumber}</Link>
        <PanelStatusBadge tone={tone(order.status)}>{STATUS_LABELS[order.status]}</PanelStatusBadge>
      </div>
      <dl className={styles.cardFacts}>
        <div><dt>Müşteri</dt><dd>{order.customerName}<small>{order.customerEmail}</small></dd></div>
        <div><dt>Ödeme</dt><dd>{PAYMENT_LABELS[order.paymentStatus]}</dd></div>
        <div><dt>Toplam</dt><dd>{money(order.totalCents, order.currency)}</dd></div>
        <div><dt>Tarih</dt><dd>{date(order.createdAt)}</dd></div>
      </dl>
      <Link className={styles.detailLink} href={`/orders/${order.id}`}>Sipariş ayrıntısını aç</Link>
    </article>
  );
}

export function OrderListPresentation(props: OrderListPresentationProps) {
  const content = props.state === "loading" ? (
    <div className={styles.loading} role="status" aria-live="polite">Siparişler yükleniyor…</div>
  ) : props.state === "error" ? (
    <div className={styles.errorState} role="alert">
      <div><h2>Siparişler yüklenemedi</h2><p>{props.error}</p></div>
      <button type="button" onClick={props.onRetry}>Tekrar dene</button>
    </div>
  ) : props.items.length === 0 ? (
    <PanelEmptyState title="Henüz sipariş bulunmuyor" description="İlk gerçek sipariş oluştuğunda bu listede görünecek." />
  ) : (
    <>
      <div className={styles.desktopTable}>
        <table aria-label="Sipariş listesi">
          <thead><tr><th>Sipariş</th><th>Tarih</th><th>Müşteri</th><th>Durum</th><th>Ödeme</th><th>Ürün</th><th>Toplam</th></tr></thead>
          <tbody>{props.items.map((order) => (
            <tr key={order.id}>
              <td><Link className={styles.orderNumber} href={`/orders/${order.id}`}>{order.orderNumber}</Link></td>
              <td>{date(order.createdAt)}</td>
              <td><strong>{order.customerName}</strong><small>{order.customerEmail}</small></td>
              <td><PanelStatusBadge tone={tone(order.status)}>{STATUS_LABELS[order.status]}</PanelStatusBadge></td>
              <td>{PAYMENT_LABELS[order.paymentStatus]}</td>
              <td>{order.itemCount.toLocaleString("tr-TR")}</td>
              <td><strong>{money(order.totalCents, order.currency)}</strong></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className={styles.mobileCards}>{props.items.map((order) => <OrderCard key={order.id} order={order} />)}</div>
      {props.nextCursor ? <button className={styles.loadMore} type="button" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? "Yükleniyor…" : "Daha fazla sipariş yükle"}</button> : null}
    </>
  );

  return (
    <PanelPageShell>
      <PanelPageHeader title="Siparişler" description="Sipariş, ödeme ve teslimat akışını gerçek mağaza verileriyle yönetin." />
      <section className={styles.listSurface} aria-labelledby="orders-list-title">
        <div className={styles.surfaceHeading}><div><h2 id="orders-list-title">Tüm Siparişler</h2><p>En güncel siparişler önce gösterilir.</p></div></div>
        <form className={styles.toolbar} role="search" onSubmit={(event) => { event.preventDefault(); props.onSearchSubmit?.(); }}>
          <label className={styles.searchField}><span className="sr-only">Sipariş ara</span><input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="Sipariş ara" maxLength={200} /><button type="submit">Ara</button></label>
          <label><span className="sr-only">Sipariş durumu</span><select value={props.status} onChange={(event) => props.onStatusChange(event.target.value as OrderStatus | "all")}><option value="all">Tüm durumlar</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span className="sr-only">Sıralama</span><select value={props.sort} onChange={(event) => props.onSortChange(event.target.value as Sort)}><option value="newest">En yeni</option><option value="oldest">En eski</option><option value="highest">Tutar: yüksekten düşüğe</option><option value="lowest">Tutar: düşükten yükseğe</option></select></label>
        </form>
        {content}
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
  const [sort, setSort] = useState<Sort>("newest");
  const sequence = useRef(0);

  const load = useCallback(async (cursor?: string) => {
    const request = ++sequence.current;
    cursor ? setLoadingMore(true) : setState("loading");
    setError("");
    try {
      const result = await orderApi.listOrders({ pageSize: 20, ...(cursor ? { cursor } : {}), ...(status === "all" ? {} : { status }), ...(search ? { search } : {}) });
      if (request !== sequence.current) return;
      setItems((current) => cursor ? Object.freeze([...current, ...result.items]) : result.items);
      setNextCursor(result.nextCursor);
      setState("loaded");
    } catch (failure) {
      if (request !== sequence.current) return;
      setError(message(failure));
      setState("error");
    } finally {
      if (request === sequence.current) setLoadingMore(false);
    }
  }, [search, status]);

  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);

  const sortedItems = useMemo(() => Object.freeze([...items].sort((left, right) => {
    if (sort === "oldest") return left.createdAt.localeCompare(right.createdAt);
    if (sort === "highest") return right.totalCents - left.totalCents;
    if (sort === "lowest") return left.totalCents - right.totalCents;
    return right.createdAt.localeCompare(left.createdAt);
  })), [items, sort]);

  function submitSearch(event?: FormEvent) {
    event?.preventDefault();
    const normalized = searchInput.trim();
    if (normalized.length === 0 || normalized.length <= 200) setSearch(normalized);
  }

  return <OrderListPresentation state={state} items={sortedItems} error={error} search={searchInput} status={status} sort={sort} nextCursor={nextCursor} loadingMore={loadingMore} onRetry={() => { void load(); }} onSearchChange={setSearchInput} onSearchSubmit={() => submitSearch()} onStatusChange={setStatus} onSortChange={setSort} onLoadMore={() => { if (nextCursor) void load(nextCursor); }} />;
}
