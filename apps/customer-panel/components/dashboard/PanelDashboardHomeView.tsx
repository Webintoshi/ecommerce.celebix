"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Activity, ArrowRight, BarChart3, CalendarDays, ChevronRight, CircleDollarSign, Package, PackageCheck, Percent, ShoppingBag, Store, Tag, UserPlus, Users } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  ANALYTICS_PERIODS,
  type AbandonedCartSummary,
  type AnalyticsActiveVisitors,
  type AnalyticsDashboard,
  type AnalyticsPeriod,
  type CustomerSummary,
  type OrderDashboardSummary,
  type OrderListItem,
  type OrderPaymentStatus,
  type OrderStatus,
} from "@celebix/saas-contracts";

import { PanelActionButton, PanelPageShell } from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { catalogApi, type CatalogDashboardSummary } from "@/lib/catalog-ui/client";
import { orderApi } from "@/lib/order-ui/client";
import { abandonedCartApi } from "@/lib/abandoned-cart-ui/client";
import { customerApi } from "@/lib/customer-ui/client";
import { createAnalyticsBrowserApi } from "@/lib/analytics-ui/client";
import { createActiveVisitorPoller } from "@/lib/analytics-ui/active-visitors";
import type { AuthoritySlice } from "@/lib/panel-ui/authority-slice";
import {
  createMerchantDashboardSliceLoader,
  createMerchantDashboardViewModel,
  type MerchantDashboardSlice,
  type MerchantDashboardViewModel,
} from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

const PERIOD_LABELS: Readonly<Record<AnalyticsPeriod, string>> = Object.freeze({
  today: "Bugün",
  week: "Bu hafta",
  month: "Bu ay",
  year: "Bu yıl",
});

const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  pending: "Bekliyor",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  shipped: "Kargoda",
  delivered: "Teslim edildi",
  cancelled: "İptal edildi",
  refunded: "İade edildi",
});

const PAYMENT_STATUS_LABELS: Readonly<Record<OrderPaymentStatus, string>> = Object.freeze({
  pending: "Ödeme bekliyor",
  processing: "İşleniyor",
  completed: "Ödendi",
  failed: "Ödeme başarısız",
  refunded: "İade edildi",
});

type LoadState = "loading" | "loaded" | "error";
type OptionalLoadState = LoadState | "unsupported";

function orderStatusTone(status: OrderStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "delivered" || status === "shipped") return "success";
  if (status === "cancelled" || status === "refunded") return "danger";
  if (status === "pending" || status === "preparing") return "warning";
  return "neutral";
}

const unavailableCatalog = (retryable: boolean): AuthoritySlice<CatalogDashboardSummary> => Object.freeze({ state: "unavailable", retryable });
const readyCatalog = (value: CatalogDashboardSummary): AuthoritySlice<CatalogDashboardSummary> => Object.freeze({ state: "ready", value, asOf: new Date().toISOString() });
const unavailableOrders = (retryable: boolean): AuthoritySlice<OrderDashboardSummary> => Object.freeze({ state: "unavailable", retryable });
const readyOrders = (value: OrderDashboardSummary): AuthoritySlice<OrderDashboardSummary> => Object.freeze({ state: "ready", value, asOf: value.asOf });
const unavailableCarts = (retryable: boolean): AuthoritySlice<AbandonedCartSummary> => Object.freeze({ state: "unavailable", retryable });
const readyCarts = (value: AbandonedCartSummary): AuthoritySlice<AbandonedCartSummary> => Object.freeze({ state: "ready", value, asOf: value.asOf });
const unavailableCustomers = (retryable: boolean): AuthoritySlice<CustomerSummary> => Object.freeze({ state: "unavailable", retryable });
const readyCustomers = (value: CustomerSummary): AuthoritySlice<CustomerSummary> => Object.freeze({ state: "ready", value, asOf: value.asOf });
const unavailableAnalytics = (retryable: boolean): AuthoritySlice<AnalyticsDashboard> => Object.freeze({ state: "unavailable", retryable });
const readyAnalytics = (value: AnalyticsDashboard): AuthoritySlice<AnalyticsDashboard> => Object.freeze({ state: "ready", value, asOf: value.generatedAt });

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 2 }).format(cents / 100);
}

function formatSeriesLabel(startsAt: string): string {
  const date = new Date(startsAt);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", timeZone: "UTC" }).format(date)
    : startsAt;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : value;
}

function formatOrderDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : value;
}

function formatRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return "Seçili dönem";
  const formatter = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(startDate)} – ${formatter.format(endDate)}`;
}

function stateDetail(state: OptionalLoadState): string {
  if (state === "loading") return "Yükleniyor";
  if (state === "loaded") return "Canlı veri";
  return "Kullanılamıyor";
}

function SummaryRetryButton({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return <button type="button" className={styles.retryButton} onClick={onRetry}>Tekrar dene</button>;
}

function DashboardLiveVisitors({ enabled }: Readonly<{ enabled: boolean }>) {
  const [snapshot, setSnapshot] = useState<AnalyticsActiveVisitors | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const api = createAnalyticsBrowserApi();
    const poller = createActiveVisitorPoller({
      visible: () => document.visibilityState === "visible",
      now: () => new Date(),
      load: (signal) => api.active(signal),
      publish: setSnapshot,
      schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
      cancel: (timer) => clearTimeout(timer),
    });
    const visibilityChanged = () => poller.visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    poller.start();
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      poller.dispose();
    };
  }, [enabled]);

  const value = !enabled || snapshot?.status === "unavailable"
    ? "Canlı veri alınamıyor"
    : snapshot === null
      ? "Canlı veri yükleniyor"
      : snapshot.activeVisitors === 1
        ? "1 ziyaretçi"
        : `${snapshot.activeVisitors} ziyaretçi`;
  return (
    <article className={styles.liveVisitors} aria-live="polite">
      <span><Activity aria-hidden="true" />Şu anda</span>
      <strong>{value}</strong>
    </article>
  );
}

interface DashboardPresentationProps {
  readonly dashboard: MerchantDashboardViewModel;
  readonly onRefresh: () => void;
  readonly state: LoadState;
  readonly ordersState?: OptionalLoadState;
  readonly cartsState?: OptionalLoadState;
  readonly customersState?: OptionalLoadState;
  readonly analyticsState?: OptionalLoadState;
  readonly onRefreshAnalytics?: () => void;
  readonly onRefreshOperations?: () => void;
  readonly onRefreshRecentOrders?: () => void;
  readonly period?: AnalyticsPeriod;
  readonly onPeriodChange?: (period: AnalyticsPeriod) => void;
  readonly recentOrders?: readonly OrderListItem[];
  readonly recentOrdersState?: LoadState;
  readonly activeVisitorsEnabled?: boolean;
}

type AnalyticsView = MerchantDashboardViewModel["analytics"] extends AuthoritySlice<infer T> ? T : never;
type DashboardKpi = Readonly<{
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ "aria-hidden"?: boolean }>;
  loading: boolean;
}>;

function DashboardHeader({ analytics, activeVisitorsEnabled, period, onPeriodChange }: Readonly<{
  analytics?: AnalyticsView;
  activeVisitorsEnabled: boolean;
  period: AnalyticsPeriod;
  onPeriodChange?: (period: AnalyticsPeriod) => void;
}>) {
  return (
    <header className={styles.dashboardHeader}>
      <div className={styles.dashboardHeading}>
        <span>Merhaba</span>
        <h1>Mağazanızın genel durumu</h1>
        <p>Mağazanızın güncel durumu ve öne çıkan gelişmeler.</p>
      </div>
      <div className={styles.headerControls}>
        <label className={styles.periodFilter}>
          <CalendarDays aria-hidden="true" />
          <span className={styles.visuallyHidden}>Dönem</span>
          <select aria-label="Dönem" value={period} onChange={(event) => {
            const nextPeriod = event.target.value as AnalyticsPeriod;
            if (ANALYTICS_PERIODS.includes(nextPeriod)) onPeriodChange?.(nextPeriod);
          }}>
            {ANALYTICS_PERIODS.map((value) => <option key={value} value={value}>{PERIOD_LABELS[value]}</option>)}
          </select>
          {analytics ? <small>{formatRange(analytics.rangeStart, analytics.rangeEnd)}</small> : null}
        </label>
        <DashboardLiveVisitors enabled={activeVisitorsEnabled} />
      </div>
    </header>
  );
}

function StoreStatusBar({ dashboard, analytics, analyticsState }: Readonly<{ dashboard: MerchantDashboardViewModel; analytics?: AnalyticsView; analyticsState: OptionalLoadState }>) {
  const storefront = dashboard.chromeCards.find(({ key }) => key === "storefront");
  const plan = dashboard.chromeCards.find(({ key }) => key === "plan");
  const hasStorefront = storefront?.status === "Doğrulandı";
  const hostname = storefront?.value?.trim() || "Mağaza adresi bekleniyor";
  const planVersion = plan?.value?.match(/(?:^|\s)·\s*v([0-9]+)\s*$/)?.[1];
  return (
    <section className={styles.storeStatusBar} aria-label="Mağaza durumu">
      <div className={styles.storeStatusIdentity}>
        <span className={styles.storeStatusIcon} data-ready={hasStorefront} aria-hidden="true"><Store /></span>
        <div><strong>{hasStorefront ? "Mağazanız yayında" : "Mağaza kurulumu bekleniyor"}</strong><small>{hasStorefront ? hostname : "Satış kanalı henüz bağlı değil"}</small></div>
      </div>
      <dl className={styles.storeMeta}>
        <div><dt>Veri durumu</dt><dd>{stateDetail(analyticsState)}</dd></div>
        {analytics ? <div><dt>Güncelleme</dt><dd><time dateTime={analytics.generatedAt}>{formatGeneratedAt(analytics.generatedAt)}</time></dd></div> : null}
        {planVersion ? <div><dt>Plan</dt><dd>v{planVersion}</dd></div> : null}
      </dl>
      <Link className={styles.statusAction} href={hasStorefront ? "/analytics" : "/setup"}>{hasStorefront ? "Analizleri gör" : "Kurulumu tamamla"}<ArrowRight aria-hidden="true" /></Link>
    </section>
  );
}

function DashboardKpiGrid({ metrics }: Readonly<{ metrics: readonly DashboardKpi[] }>) {
  return (
    <section className={styles.kpiGrid} aria-label="Mağaza performans metrikleri">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <article key={metric.key} className={styles.kpiCard}>
            <span className={styles.kpiIcon} aria-hidden="true"><Icon /></span>
            <div><span>{metric.label}</span>{metric.loading ? <span className={styles.metricSkeleton} aria-hidden="true" /> : <strong>{metric.value}</strong>}<small>{metric.detail}</small></div>
          </article>
        );
      })}
    </section>
  );
}

function SalesChartCard({ analytics, state, period, onRetry }: Readonly<{ analytics?: AnalyticsView; state: OptionalLoadState; period: AnalyticsPeriod; onRetry: () => void }>) {
  const hasSales = Boolean(analytics && (analytics.revenueCents > 0 || analytics.series.some((point) => point.revenueCents > 0)));
  return (
    <article className={`${styles.panelCard} ${styles.salesCard}`}>
      <header className={styles.cardHeader}><div><h2>Satış Grafiği</h2><p>{PERIOD_LABELS[period]} ödenmiş sipariş geliri</p></div><strong>{analytics ? formatMoney(analytics.revenueCents, analytics.currency) : "—"}</strong></header>
      <div className={styles.salesChart} role="img" aria-label="Satış grafiği; seçili dönemde ödenmiş sipariş gelirini gösterir">
        {state === "loading" ? <div className={styles.chartSkeleton} role="status"><span />Satış verisi yükleniyor…</div> : null}
        {state === "error" || state === "unsupported" ? <div className={styles.chartError} role="alert"><div><strong>Satış verisi alınamıyor</strong><span>Diğer dashboard bölümleri çalışmaya devam ediyor.</span></div><SummaryRetryButton onRetry={onRetry} /></div> : null}
        {state === "loaded" && analytics ? (
          hasSales && analytics.series.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={analytics.series} accessibilityLayer margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#E4D5C9" vertical={false} />
                  <XAxis dataKey="startsAt" tickFormatter={formatSeriesLabel} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => formatMoney(Number(value), analytics.currency)} axisLine={false} tickLine={false} width={76} />
                  <Tooltip labelFormatter={(value) => typeof value === "string" ? formatSeriesLabel(value) : ""} formatter={(value) => [formatMoney(Number(value), analytics.currency), "Satış"]} />
                  <Line type="monotone" dataKey="revenueCents" stroke="#FE6100" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
              <p className={styles.chartSummary}>{formatRange(analytics.rangeStart, analytics.rangeEnd)} arasında {analytics.orders.paid.toLocaleString("tr-TR")} ödenmiş siparişten {formatMoney(analytics.revenueCents, analytics.currency)} gelir.</p>
            </>
          ) : <div className={styles.emptyState}><BarChart3 aria-hidden="true" /><strong>Bu tarih aralığında satış verisi bulunmuyor.</strong><span>Ödenmiş sipariş oluştuğunda grafik burada görünür.</span></div>
        ) : null}
      </div>
    </article>
  );
}

function OrderStatusCard({ dashboard, state }: Readonly<{ dashboard: MerchantDashboardViewModel; state: OptionalLoadState }>) {
  const orders = dashboard.orders.state === "ready" ? dashboard.orders.value : undefined;
  const total = orders?.totalOrders ?? 0;
  const fulfilled = orders?.fulfilledOrders ?? 0;
  const pending = orders?.pendingOrders ?? 0;
  const other = Math.max(0, total - fulfilled - pending);
  const fulfilledPercent = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
  const pendingPercent = total > 0 ? Math.round((pending / total) * 100) : 0;
  return (
    <article className={`${styles.panelCard} ${styles.orderStatusCard}`}>
      <header className={styles.cardHeader}><div><h2>Sipariş Durumları</h2><p>Güncel sipariş özeti</p></div></header>
      {state === "loading" ? <p className={styles.inlineState} role="status">Sipariş özeti yükleniyor…</p> : null}
      {state === "error" || state === "unsupported" ? <p className={styles.inlineState}>Sipariş özeti kullanılamıyor.</p> : null}
      {state === "loaded" && orders ? (
        <div className={styles.orderStatusBody}>
          <div className={styles.orderRing} role="img" aria-label={`${total} sipariş; ${pending} işlem bekliyor, ${fulfilled} tamamlandı, ${other} diğer`}>
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle className={styles.ringTrack} cx="60" cy="60" r="48" pathLength="100" /><circle className={styles.ringFulfilled} cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${fulfilledPercent} ${100 - fulfilledPercent}`} /><circle className={styles.ringPending} cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${pendingPercent} ${100 - pendingPercent}`} strokeDashoffset={-fulfilledPercent} /></svg>
            <span><strong>{total.toLocaleString("tr-TR")}</strong><small>Toplam</small></span>
          </div>
          <dl className={styles.orderLegend}><div data-tone="pending"><dt>İşlem bekliyor</dt><dd>{pending.toLocaleString("tr-TR")}</dd></div><div data-tone="fulfilled"><dt>Tamamlanan</dt><dd>{fulfilled.toLocaleString("tr-TR")}</dd></div>{other > 0 ? <div data-tone="other"><dt>Diğer</dt><dd>{other.toLocaleString("tr-TR")}</dd></div> : null}</dl>
        </div>
      ) : null}
    </article>
  );
}

type DashboardTask = Readonly<{ key: string; label: string; detail: string; href: string; actionLabel: string }>;
type TaskState = "loading" | "loaded" | "partial-loading" | "partial-error" | "error" | "unsupported";

function ActionItemsCard({ onRetry, state, tasks }: Readonly<{ onRetry: () => void; state: TaskState; tasks: readonly DashboardTask[] }>) {
  const notice = state === "loading"
    ? "Operasyon sinyalleri yükleniyor…"
    : state === "partial-loading"
      ? "Bazı operasyon sinyalleri yükleniyor."
      : state === "partial-error"
      ? "Bazı operasyon sinyalleri kullanılamıyor."
      : state === "error" || state === "unsupported"
        ? "Operasyon sinyalleri şu anda kullanılamıyor."
        : null;
  const isLoading = state === "loading" || state === "partial-loading";
  return (
    <aside className={`${styles.panelCard} ${styles.actionItemsCard}`} aria-labelledby="attention-title">
      <header className={styles.cardHeader}><div><h2 id="attention-title">Yapılacaklar</h2><p>Gerçek operasyon sinyalleri</p></div><span>{tasks.length}</span></header>
      {tasks.length > 0 ? <ul className={styles.attentionList}>{tasks.map((task) => <li key={task.key}><div><strong>{task.label}</strong><small>{task.detail}</small></div><Link href={task.href} aria-label={task.actionLabel}><ChevronRight aria-hidden="true" /></Link></li>)}</ul> : null}
      {notice ? <div className={styles.taskNotice} role={isLoading ? "status" : "alert"}><span>{notice}</span>{isLoading ? null : <SummaryRetryButton onRetry={onRetry} />}</div> : null}
      {tasks.length === 0 && state === "loaded" ? <p className={styles.attentionEmpty}>Şu anda acil işlem görünmüyor.</p> : null}
    </aside>
  );
}

function RecentOrdersCard({ orders, state, onRetry }: Readonly<{ orders: readonly OrderListItem[]; state: LoadState; onRetry: () => void }>) {
  return (
    <section className={`${styles.panelCard} ${styles.recentOrders}`} aria-labelledby="recent-orders-title">
      <header className={styles.cardHeader}><div><h2 id="recent-orders-title">Son Siparişler</h2><p>En yeni beş sipariş</p></div><Link className={styles.textAction} href="/orders">Tüm siparişleri gör<ArrowRight aria-hidden="true" /></Link></header>
      {state === "loading" ? <p className={styles.inlineState} role="status">Son siparişler yükleniyor…</p> : null}
      {state === "error" ? <div className={styles.recentOrdersError} role="alert"><span>Son siparişler şu anda kullanılamıyor.</span><SummaryRetryButton onRetry={onRetry} /></div> : null}
      {state === "loaded" ? (
        orders.length > 0 ? (
          <div className={styles.recentOrdersViewport}><table className={styles.recentOrdersTable}>
            <caption className={styles.visuallyHidden}>En yeni siparişler</caption>
            <thead><tr><th scope="col">Sipariş</th><th scope="col">Müşteri</th><th scope="col">Ürünler</th><th scope="col">Tutar</th><th scope="col">Durum</th><th scope="col">Tarih</th></tr></thead>
            <tbody>{orders.map((order) => <tr key={order.id}>
              <td data-label="Sipariş"><Link className={styles.orderLink} href={`/orders/${order.id}`}>{order.orderNumber}</Link></td>
              <td data-label="Müşteri"><span className={styles.customerCell}><span aria-hidden="true">{order.customerName.charAt(0).toLocaleUpperCase("tr-TR")}</span>{order.customerName}</span></td>
              <td data-label="Ürünler">{order.itemCount.toLocaleString("tr-TR")} ürün</td>
              <td data-label="Tutar">{formatMoney(order.totalCents, order.currency)}</td>
              <td data-label="Durum"><span className={styles.statusStack}><span className={styles.statusPill} data-tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</span><small>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</small></span></td>
              <td data-label="Tarih"><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
            </tr>)}</tbody>
          </table></div>
        ) : <p className={styles.inlineState}>Henüz sipariş bulunmuyor.</p>
      ) : null}
    </section>
  );
}

function TopProductsCard({ analytics, state }: Readonly<{ analytics?: AnalyticsView; state: OptionalLoadState }>) {
  return (
    <section className={`${styles.panelCard} ${styles.topProducts}`} aria-labelledby="best-sellers-title">
      <header className={styles.cardHeader}><div><h2 id="best-sellers-title">En Çok Satan Ürünler</h2><p>Seçili dönem performansı</p></div><Link className={styles.textAction} href="/products">Tümünü gör<ArrowRight aria-hidden="true" /></Link></header>
      {state === "loading" ? <p className={styles.inlineState} role="status">Ürünler yükleniyor…</p> : null}
      {state === "error" || state === "unsupported" ? <p className={styles.inlineState}>En çok satan ürünler şu anda kullanılamıyor.</p> : null}
      {state === "loaded" && analytics ? (
        analytics.topProducts.length > 0 ? <ol className={styles.productList}>{analytics.topProducts.slice(0, 5).map((product, index) => <li key={product.productId}><span className={styles.productRank}>{index + 1}</span><span className={styles.productThumb} aria-hidden="true"><Package /></span><div><strong>{product.title}</strong><small>{product.quantity.toLocaleString("tr-TR")} adet</small></div><span>{formatMoney(product.revenueCents, analytics.currency)}</span></li>)}</ol>
          : <div className={styles.emptyState}><PackageCheck aria-hidden="true" /><strong>Bu tarih aralığında satış verisi bulunmuyor.</strong><span>Ürün satışı oluştuğunda liste burada görünür.</span></div>
      ) : null}
    </section>
  );
}

function DashboardInsights({ analytics, cartsState, customersState, dashboard }: Readonly<{ analytics?: AnalyticsView; cartsState: OptionalLoadState; customersState: OptionalLoadState; dashboard: MerchantDashboardViewModel }>) {
  const customers = dashboard.customers.state === "ready" ? dashboard.customers.value : undefined;
  const carts = dashboard.carts.state === "ready" ? dashboard.carts.value : undefined;
  const empty = "—";
  return (
    <div className={styles.insightGrid}>
      <section className={`${styles.panelCard} ${styles.insightCard}`} aria-labelledby="growth-title"><header className={styles.cardHeader}><div><h2 id="growth-title">Büyüme Özeti</h2><p>Güncel operasyon metrikleri</p></div></header><dl><div><dt>İade edilen sipariş</dt><dd>{analytics ? analytics.growth.refundedOrders.toLocaleString("tr-TR") : empty}</dd></div><div><dt>Ortalama sipariş</dt><dd>{analytics?.growth.averageOrderValueCents == null ? empty : formatMoney(analytics.growth.averageOrderValueCents, analytics.currency)}</dd></div><div><dt>Düşük stok</dt><dd>{analytics ? analytics.growth.lowStockVariants.toLocaleString("tr-TR") : empty}</dd></div><div><dt>Toplam müşteri</dt><dd>{analytics ? analytics.growth.totalCustomers.toLocaleString("tr-TR") : empty}</dd></div></dl></section>
      <section className={`${styles.panelCard} ${styles.insightCard}`} aria-labelledby="customer-view-title"><header className={styles.cardHeader}><div><h2 id="customer-view-title">Müşteri ve Sepet Özeti</h2><p>Gerçek müşteri hareketleri</p></div><Link className={styles.textAction} href="/customers">Müşterileri gör<ArrowRight aria-hidden="true" /></Link></header><dl><div><dt>Aktif müşteri</dt><dd>{customers ? customers.active.toLocaleString("tr-TR") : empty}</dd></div><div><dt>E-posta izni</dt><dd>{customers ? customers.consentedEmail.toLocaleString("tr-TR") : empty}</dd></div><div><dt>Toplam harcama</dt><dd>{customers ? formatMoney(customers.totalSpentCents, customers.currency) : empty}</dd></div><div><dt>Terk edilen sepet</dt><dd>{carts ? carts.abandoned.toLocaleString("tr-TR") : empty}</dd></div></dl>{customersState !== "loaded" || cartsState !== "loaded" ? <p className={styles.sliceNotice} role="status">Müşteri veya sepet verilerinin bir bölümü {customersState === "loading" || cartsState === "loading" ? "yükleniyor" : "kullanılamıyor"}.</p> : null}</section>
    </div>
  );
}

function DashboardQuickActions() {
  const actions = [
    { href: "/products/new", label: "Ürün Ekle", detail: "Yeni ürün oluşturun", icon: Package, primary: true },
    { href: "/customers/new", label: "Müşteri Ekle", detail: "Yeni müşteri kaydı", icon: UserPlus, primary: false },
    { href: "/discounts/new", label: "İndirim Oluştur", detail: "Kampanya tanımlayın", icon: Tag, primary: false },
    { href: "/analytics", label: "Analizleri Gör", detail: "Detaylı verileri inceleyin", icon: BarChart3, primary: false },
  ] as const;
  return <nav className={styles.quickActions} aria-label="Dashboard hızlı işlemleri">{actions.map((action) => { const Icon = action.icon; return <Link key={action.href} className={action.primary ? styles.quickActionPrimary : styles.quickAction} href={action.href}><Icon aria-hidden="true" /><span><strong>{action.label}</strong><small>{action.detail}</small></span><ArrowRight aria-hidden="true" /></Link>; })}</nav>;
}

export function PanelDashboardPresentation(props: DashboardPresentationProps) {
  const analyticsState = props.analyticsState ?? (props.dashboard.analytics.state === "ready" ? "loaded" : "unsupported");
  const rawAnalytics = props.dashboard.analytics.state === "ready" ? props.dashboard.analytics.value : undefined;
  const period = props.period ?? rawAnalytics?.period ?? "month";
  const analytics = analyticsState === "loaded" && rawAnalytics?.period === period ? rawAnalytics : undefined;
  const catalog = props.dashboard.catalog.state === "ready" ? props.dashboard.catalog.value : undefined;
  const carts = props.dashboard.carts.state === "ready" ? props.dashboard.carts.value : undefined;
  const orders = props.dashboard.orders.state === "ready" ? props.dashboard.orders.value : undefined;
  const operationStates: readonly OptionalLoadState[] = [
    props.state,
    props.ordersState ?? (orders ? "loaded" : "unsupported"),
    props.cartsState ?? (carts ? "loaded" : "unsupported"),
  ];
  const availableOperationSlices = operationStates.filter((value) => value === "loaded").length;
  const taskState: TaskState = operationStates.some((value) => value === "loading")
    ? availableOperationSlices > 0 ? "partial-loading" : "loading"
    : operationStates.some((value) => value === "error")
      ? availableOperationSlices > 0 ? "partial-error" : "error"
      : operationStates.some((value) => value === "unsupported")
        ? availableOperationSlices > 0 ? "partial-error" : "unsupported"
        : "loaded";
  const pendingOrders = orders?.pendingOrders ?? 0;
  const outOfStockVariants = catalog?.metrics.find(({ key }) => key === "out-of-stock")?.value ?? 0;
  const tasks: readonly DashboardTask[] = [
    ...(pendingOrders > 0 ? [{ key: "orders", label: `${pendingOrders.toLocaleString("tr-TR")} sipariş işlem bekliyor`, detail: "Sipariş akışını gözden geçirin", href: "/orders", actionLabel: "Siparişleri görüntüle" }] : []),
    ...(outOfStockVariants > 0 ? [{ key: "stock", label: `${outOfStockVariants.toLocaleString("tr-TR")} stok uyarısı`, detail: "Satışa açık varyantları tamamlayın", href: "/products", actionLabel: "Ürünleri görüntüle" }] : []),
    ...((catalog?.productsWithoutMedia ?? 0) > 0 ? [{ key: "media", label: `${catalog?.productsWithoutMedia.toLocaleString("tr-TR")} üründe medya eksik`, detail: "Ürün görsellerini tamamlayın", href: "/products", actionLabel: "Ürünleri görüntüle" }] : []),
    ...((carts?.abandoned ?? 0) > 0 ? [{ key: "carts", label: `${carts?.abandoned.toLocaleString("tr-TR")} terk edilen sepet`, detail: `${formatMoney(carts?.lostValueCents ?? 0, carts?.currency ?? "TRY")} bekleyen değer`, href: "/orders/abandoned-carts", actionLabel: "Sepetleri görüntüle" }] : []),
  ];
  const metrics: readonly DashboardKpi[] = [
    { key: "sales", label: "Toplam satış", value: analytics ? formatMoney(analytics.revenueCents, analytics.currency) : "—", detail: analytics ? "Seçili dönemde" : stateDetail(analyticsState), icon: CircleDollarSign, loading: analyticsState === "loading" },
    { key: "orders", label: "Toplam sipariş", value: analytics ? analytics.orders.total.toLocaleString("tr-TR") : orders ? orders.totalOrders.toLocaleString("tr-TR") : "—", detail: analytics ? `${analytics.orders.paid.toLocaleString("tr-TR")} ödenmiş` : orders ? "Güncel sipariş özeti" : stateDetail(props.ordersState ?? "unsupported"), icon: ShoppingBag, loading: analyticsState === "loading" && !orders },
    { key: "customers", label: "Yeni müşteri", value: analytics ? analytics.customers.newInPeriod.toLocaleString("tr-TR") : "—", detail: analytics ? "Seçili dönemde" : stateDetail(analyticsState), icon: Users, loading: analyticsState === "loading" },
    { key: "conversion", label: "Dönüşüm oranı", value: "—", detail: "Canlı veri alınamıyor", icon: Percent, loading: false },
  ];

  return (
    <PanelPageShell>
      <PanelTopbarBridge title={props.dashboard.title} subtitle={props.dashboard.description} context={<span className={styles.topbarStatus} data-state={analyticsState}>{stateDetail(analyticsState)}</span>} actions={<div className={styles.dashboardTopbarActions}><PanelActionButton href="/orders/quick-links">Hızlı sipariş</PanelActionButton></div>} />
      <DashboardHeader analytics={analytics} activeVisitorsEnabled={props.activeVisitorsEnabled ?? true} period={period} onPeriodChange={props.onPeriodChange} />
      <StoreStatusBar dashboard={props.dashboard} analytics={analytics} analyticsState={analyticsState} />
      <DashboardKpiGrid metrics={metrics} />
      <div className={styles.primaryGrid}><SalesChartCard analytics={analytics} state={analyticsState} period={period} onRetry={props.onRefreshAnalytics ?? props.onRefresh} /><OrderStatusCard dashboard={props.dashboard} state={props.ordersState ?? (orders ? "loaded" : "unsupported")} /><ActionItemsCard tasks={tasks} state={taskState} onRetry={props.onRefreshOperations ?? props.onRefresh} /></div>
      <div className={styles.operationsGrid}><RecentOrdersCard orders={props.recentOrders ?? Object.freeze([])} state={props.recentOrdersState ?? "loading"} onRetry={props.onRefreshRecentOrders ?? props.onRefresh} /><TopProductsCard analytics={analytics} state={analyticsState} /></div>
      <DashboardInsights dashboard={props.dashboard} analytics={analytics} customersState={props.customersState ?? (props.dashboard.customers.state === "ready" ? "loaded" : "unsupported")} cartsState={props.cartsState ?? (carts ? "loaded" : "unsupported")} />
      <DashboardQuickActions />
    </PanelPageShell>
  );
}

export function PanelDashboardHomeView() {
  const chrome = usePanelChromeModel();
  const [catalog, setCatalog] = useState<AuthoritySlice<CatalogDashboardSummary>>(() => unavailableCatalog(false));
  const [state, setState] = useState<LoadState>("loading");
  const [orders, setOrders] = useState<AuthoritySlice<OrderDashboardSummary>>(() => unavailableOrders(false));
  const [ordersState, setOrdersState] = useState<LoadState>("loading");
  const [recentOrders, setRecentOrders] = useState<readonly OrderListItem[]>(() => Object.freeze([]));
  const [recentOrdersState, setRecentOrdersState] = useState<LoadState>("loading");
  const [carts, setCarts] = useState<AuthoritySlice<AbandonedCartSummary>>(() => unavailableCarts(false));
  const [cartsState, setCartsState] = useState<LoadState>("loading");
  const [customers, setCustomers] = useState<AuthoritySlice<CustomerSummary>>(() => unavailableCustomers(false));
  const [customersState, setCustomersState] = useState<LoadState>("loading");
  const [analytics, setAnalytics] = useState<AuthoritySlice<AnalyticsDashboard>>(() => unavailableAnalytics(false));
  const [analyticsState, setAnalyticsState] = useState<LoadState>("loading");
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const analyticsPeriod = useRef<AnalyticsPeriod>("month");
  const loader = useRef<ReturnType<typeof createMerchantDashboardSliceLoader> | null>(null);
  const recentOrdersReload = useRef<(() => void) | null>(null);
  const reload = useCallback((slice: MerchantDashboardSlice) => loader.current?.reload(slice), []);
  const reloadAll = useCallback(() => loader.current?.reloadAll(), []);

  useEffect(() => {
    const next = createMerchantDashboardSliceLoader(
      {
        catalog: () => catalogApi.getDashboardSummary(),
        orders: () => orderApi.getDashboardSummary(),
        carts: () => abandonedCartApi.getSummary(),
        customers: () => customerApi.summary(),
        analytics: async () => {
          const { analyticsApi } = await import("@/lib/analytics-ui/client");
          return analyticsApi.dashboard(analyticsPeriod.current);
        },
      },
      {
        loading(slice) {
          if (slice === "catalog") setState("loading");
          if (slice === "orders") setOrdersState("loading");
          if (slice === "carts") setCartsState("loading");
          if (slice === "customers") setCustomersState("loading");
          if (slice === "analytics") setAnalyticsState("loading");
        },
        ready(slice, value) {
          if (slice === "catalog") { setCatalog(readyCatalog(value as CatalogDashboardSummary)); setState("loaded"); }
          if (slice === "orders") { setOrders(readyOrders(value as OrderDashboardSummary)); setOrdersState("loaded"); }
          if (slice === "carts") { setCarts(readyCarts(value as AbandonedCartSummary)); setCartsState("loaded"); }
          if (slice === "customers") { setCustomers(readyCustomers(value as CustomerSummary)); setCustomersState("loaded"); }
          if (slice === "analytics") { setAnalytics(readyAnalytics(value as AnalyticsDashboard)); setAnalyticsState("loaded"); }
        },
        unavailable(slice) {
          if (slice === "catalog") { setCatalog(unavailableCatalog(true)); setState("error"); }
          if (slice === "orders") { setOrders(unavailableOrders(true)); setOrdersState("error"); }
          if (slice === "carts") { setCarts(unavailableCarts(true)); setCartsState("error"); }
          if (slice === "customers") { setCustomers(unavailableCustomers(true)); setCustomersState("error"); }
          if (slice === "analytics") { setAnalytics(unavailableAnalytics(true)); setAnalyticsState("error"); }
        },
      },
    );
    loader.current = next;
    next.reloadAll();
    return () => { next.dispose(); if (loader.current === next) loader.current = null; };
  }, []);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const load = () => {
      const request = ++generation;
      setRecentOrdersState("loading");
      void orderApi.listOrders({ pageSize: 5, sort: "newest" }).then(
        (result) => { if (disposed || request !== generation) return; setRecentOrders(result.items); setRecentOrdersState("loaded"); },
        () => { if (disposed || request !== generation) return; setRecentOrders(Object.freeze([])); setRecentOrdersState("error"); },
      );
    };
    recentOrdersReload.current = load;
    load();
    return () => { disposed = true; generation += 1; if (recentOrdersReload.current === load) recentOrdersReload.current = null; };
  }, []);

  const changePeriod = useCallback((nextPeriod: AnalyticsPeriod) => {
    if (analyticsPeriod.current === nextPeriod) return;
    analyticsPeriod.current = nextPeriod;
    setPeriod(nextPeriod);
    loader.current?.reload("analytics");
  }, []);

  const dashboard = createMerchantDashboardViewModel(chrome, catalog, orders, carts, customers, analytics);
  return <PanelDashboardPresentation dashboard={dashboard} onRefresh={reloadAll} onRefreshAnalytics={() => reload("analytics")} onRefreshOperations={reloadAll} onRefreshRecentOrders={() => recentOrdersReload.current?.()} onPeriodChange={changePeriod} period={period} recentOrders={recentOrders} recentOrdersState={recentOrdersState} state={state} ordersState={ordersState} cartsState={cartsState} customersState={customersState} analyticsState={analyticsState} activeVisitorsEnabled={chrome.analyticsAvailable} />;
}
