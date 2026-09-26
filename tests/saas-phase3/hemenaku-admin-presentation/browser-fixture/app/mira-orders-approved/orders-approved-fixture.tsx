"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import type { OrderDetail, OrderPaymentStatus, OrderSort, OrderStatus, PermanentDeletionImpact } from "@celebix/saas-contracts";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { OrderListPresentation, filterOrderListItems, serializeOrderListCsv, type OrderColumnVisibility, type OrderDateRange, type OrderFulfillment } from "@/components/orders/OrderListConsole";
import { OrderDetailPresentation, buildOrderShippingUpdate, type OrderUiCapabilities } from "@/components/orders/OrderDetailConsole";
import { createFixtureNotifications, createFixtureOrders, FIXTURE_NOW } from "./orders-approved-data";

const MODEL = { analyticsAvailable: false, storeSlug: "guzide-tasarim", membershipLabel: "Mağaza sahibi", planCode: "growth", planVersion: 3, entitlementStatus: "active" as const, storefrontHostname: "guzide.example.test", locale: "tr-TR" };
const COLUMNS: OrderColumnVisibility = { date: true, customer: true, status: true, payment: true, items: true, source: true, total: true };

/** Local browser acceptance harness. All records/handlers are synthetic and in memory. */
export function OrdersApprovedFixture({ initialView, role, scenario, mutationMode, moreMode, initialId, initialStatus }: { initialView: string; role: string; scenario: string; mutationMode: string; moreMode: string; initialId: string; initialStatus: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [orders, setOrders] = useState(() => createFixtureOrders());
  const [view, setView] = useState(initialView === "pos" ? "detail" : initialView);
  const [selected, setSelected] = useState(initialView === "pos" ? createFixtureOrders()[4].id : initialId || createFixtureOrders()[0].id);
  const [state, setState] = useState<"loading" | "loaded" | "error">(scenario === "loading" || scenario === "error" ? scenario : "loaded");
  const [loaded, setLoaded] = useState(12);
  const [searchInput, setSearchInput] = useState(""); const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">("all"); const [sort, setSort] = useState<OrderSort>("newest");
  const [dateRange, setDateRange] = useState<OrderDateRange>("all"); const [payment, setPayment] = useState<OrderPaymentStatus | "all">("all"); const [fulfillment, setFulfillment] = useState<OrderFulfillment>("all");
  const [columns, setColumns] = useState(COLUMNS); const [moreError, setMoreError] = useState(""); const moreAttempts = useRef(0);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [successId, setSuccessId] = useState(0);
  const [notifications, setNotifications] = useState(createFixtureNotifications);
  const [impact, setImpact] = useState<PermanentDeletionImpact>();
  const [deletedIds, setDeletedIds] = useState<readonly string[]>([]);
  const capabilities: OrderUiCapabilities = { fulfill: role !== "analyst", manage: role === "owner", payment: role === "owner", shipping: false, note: role !== "analyst", delete: role === "owner" };
  const order = orders.find(order => order.id === selected) ?? orders[0];
  const detail = initialStatus && ["pending", "confirmed", "preparing", "shipped", "delivered", "cancelled", "refunded"].includes(initialStatus) && successId === 0 ? { ...order, status: initialStatus as OrderStatus } : order;
  const visible = useMemo(() => {
    if (scenario === "empty") return [];
    const q = search.toLocaleLowerCase("tr-TR");
    const server = orders.filter(order => !deletedIds.includes(order.id) && (status === "all" || order.status === status) && (!q || [order.orderNumber, order.customerName ?? "", order.customerEmail ?? ""].some(value => value.toLocaleLowerCase("tr-TR").includes(q)))).sort((a, b) => sort === "highest" ? b.totalCents - a.totalCents : sort === "lowest" ? a.totalCents - b.totalCents : sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)).slice(0, loaded);
    return filterOrderListItems(server, { dateRange, payment, fulfillment }, new Date(FIXTURE_NOW));
  }, [orders, deletedIds, status, search, sort, loaded, dateRange, payment, fulfillment, scenario]);
  const loadedCount = scenario === "empty" ? 0 : orders.filter(order => !deletedIds.includes(order.id) && (status === "all" || order.status === status) && (!search || [order.orderNumber, order.customerName ?? "", order.customerEmail ?? ""].some(value => value.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR"))))).slice(0, loaded).length;
  const change = (patch: Partial<OrderDetail>, message: string) => {
    if (mutationMode === "error") { setError("İşlem tamamlanamadı. Değerler korundu; yeniden deneyebilirsiniz."); return; }
    if (mutationMode === "conflict") { setNotice("Sipariş güncellenmiş; güncel kaydı inceleyin."); setOrders(current => current.map(record => record.id === selected ? { ...record, version: record.version + 1 } : record)); return; }
    setOrders(current => current.map(record => record.id === selected ? { ...record, status: detail.status, ...patch, version: record.version + 1, updatedAt: FIXTURE_NOW, events: [...record.events, { id: "fixture-event-" + (successId + 1), type: "updated", message, createdAt: FIXTURE_NOW }] } : record));
    setError(""); setNotice(message); setSuccessId(value => value + 1);
  };
  const formData = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); return new FormData(event.currentTarget); };
  const captureNavigation = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest("a"); if (!anchor) return;
    const path = new URL(anchor.href, window.location.href).pathname;
    if (path === "/orders") { event.preventDefault(); setView("list"); setError(""); setNotice(""); }
    else if (path.startsWith("/orders/")) {
      event.preventDefault(); const id = path.split("/")[2]; if (orders.some(order => order.id === id)) { setSelected(id); setView("detail"); setError(""); setNotice(""); setImpact(undefined); window.scrollTo(0, 0); }
    }
  };
  const position = orders.findIndex(record => record.id === selected);
  return <PanelLayoutClient model={{ ...MODEL, membershipLabel: role === "analyst" ? "Analist" : role === "editor" ? "Editör" : "Mağaza sahibi" }}><PanelTopbarBridge title="" hideHeading /><div data-evidence="orders-approved-local-fixture" data-qa-ready={ready} data-role={role} onClickCapture={captureNavigation}>
    {view === "detail" ? <OrderDetailPresentation state={state} detail={state === "error" && !successId ? undefined : detail} error={error || (state === "error" ? "Sipariş açılamadı. Yeniden deneyin." : "")} notice={notice} busy="" successId={successId} capabilities={capabilities} notifications={detail.source === "in_store" ? [] : notifications.map(notification => ({ ...notification, canRetry: notification.canRetry && role !== "analyst" }))} neighbors={{ previous: position > 0 ? { id: orders[position - 1].id, orderNumber: orders[position - 1].orderNumber } : undefined, next: position < orders.length - 1 ? { id: orders[position + 1].id, orderNumber: orders[position + 1].orderNumber } : undefined }} deletionImpact={impact} onRetry={() => { setState("loaded"); setError(""); setSuccessId(value => value + 1); }} onStatusChange={next => change({ status: next }, "Sipariş durumu güncellendi.")} onPaymentChange={next => change({ paymentStatus: next }, "Ödeme kaydı güncellendi.")} onShippingSubmit={event => { const data = formData(event); const update = buildOrderShippingUpdate(detail, data); change({ shippingAddress: update.shippingAddress, tracking: update.tracking }, "Adres ve takip güncellendi."); }} onNoteSubmit={event => { const data = formData(event); const body = String(data.get("body") ?? "").trim(); if (!body) return; const form = event.currentTarget; change({ notes: [...detail.notes, { id: "fixture-note-" + successId, body, createdAt: FIXTURE_NOW, updatedAt: FIXTURE_NOW }] }, "Not eklendi."); if (!mutationMode) form.reset(); }} onNoteArchive={id => change({ notes: detail.notes.filter(note => note.id !== id) }, "Not arşivlendi.")} onNotificationRetry={id => { setNotifications(current => current.map(notification => notification.id === id ? { ...notification, status: "delivered", canRetry: false } : notification)); setNotice("Örnek bildirim güncellendi; e-posta gönderilmedi."); }} onArchiveSubmit={event => { formData(event); change({ archive: { archived: true, changedAt: FIXTURE_NOW } }, "Sipariş arşivlendi."); }} onRestoreSubmit={event => { formData(event); change({ archive: { archived: false, changedAt: FIXTURE_NOW } }, "Sipariş arşivden çıkarıldı."); }} onDeletionImpactRequest={() => setImpact({ resourceKind: "order", resourceId: detail.id, expectedVersion: detail.version, confirmationLabel: detail.orderNumber, effects: [{ kind: "order_items", count: detail.items.length, disposition: "delete" }, { kind: "order_notes", count: detail.notes.length, disposition: "delete" }, { kind: "order_events", count: detail.events.length, disposition: "delete" }] })} onDeleteSubmit={event => { const data = formData(event); if (data.get("confirmation") !== detail.orderNumber) { setError("Sipariş kodu eşleşmiyor."); return; } setDeletedIds(current => [...current, detail.id]); setView("list"); }} /> : <OrderListPresentation state={state} items={visible} loadedCount={loadedCount} error={state === "error" ? "Siparişler yüklenemedi. Yeniden deneyin." : ""} loadMoreError={moreError} search={searchInput} status={status} sort={sort} dateRange={dateRange} payment={payment} fulfillment={fulfillment} visibleColumns={columns} nextCursor={loadedCount >= loaded && loaded < orders.length ? "fixture-next" : undefined} loadingMore={false} onRetry={() => setState("loaded")} onSearchChange={setSearchInput} onSearchSubmit={() => { setSearch(searchInput.trim()); setMoreError(""); }} onClearSearch={() => { setSearchInput(""); setSearch(""); }} onReset={() => { setStatus("all"); setDateRange("all"); setPayment("all"); setFulfillment("all"); }} onStatusChange={value => { setStatus(value); setLoaded(12); }} onSortChange={setSort} onDateRangeChange={setDateRange} onPaymentChange={setPayment} onFulfillmentChange={setFulfillment} onColumnVisibilityChange={(column, value) => setColumns(current => ({ ...current, [column]: value }))} onExport={() => { const url = URL.createObjectURL(new Blob([serializeOrderListCsv(visible)], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "ornek-siparisler.csv"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }} onLoadMore={() => { moreAttempts.current++; if (moreMode === "error" && moreAttempts.current === 1) { setMoreError("Ek siparişler yüklenemedi. Mevcut liste korundu."); return; } setMoreError(""); setLoaded(current => Math.min(orders.length, current + 8)); }} />}
  </div></PanelLayoutClient>;
}
