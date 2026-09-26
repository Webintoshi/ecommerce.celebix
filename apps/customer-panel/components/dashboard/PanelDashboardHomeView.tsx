"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import { Activity, ArrowRight, BarChart3, CalendarDays, ChevronRight, CircleDollarSign, Package, Percent, ShoppingBag, Store, Tag, UserPlus, Users } from "lucide-react";
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

function formatAxisMoney(cents: number) {
  const amount = Math.max(0, cents / 100);
  if (amount === 0) return "0";
  const magnitude = amount >= 1_000_000_000 ? 1_000_000_000 : amount >= 1_000_000 ? 1_000_000 : amount >= 1_000 ? 1_000 : 1;
  const suffix = magnitude === 1_000_000_000 ? "mr" : magnitude === 1_000_000 ? "mn" : magnitude === 1_000 ? "bin" : "";
  const scaled = amount / magnitude;
  const digits = scaled >= 10 || magnitude === 1 ? 0 : 1;
  return `${scaled.toFixed(digits).replace(".", ",")}${suffix ? ` ${suffix}` : ""}`;
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

function FocusArtwork() {
  return (
    <svg className={styles.focusArtwork} viewBox="0 0 320 166" fill="none" aria-hidden="true">
      <path d="M27 145c23-41 68-48 111-30 48 20 93 21 155-13v55H27v-12Z" fill="#3A3B3E" />
      <g transform="rotate(8 218 79)">
        <rect x="174" y="17" width="118" height="138" rx="11" fill="#EAEAF2" />
        <rect x="185" y="28" width="96" height="113" rx="6" fill="#FCFBFE" />
        <path d="M225 70h25l8 44h-41l8-44Z" fill="#D9A184" />
        <path d="M230 70c0-12 3-19 8-19s8 7 8 19" stroke="#C7896B" strokeWidth="3" strokeLinecap="round" />
      </g>
      <g transform="rotate(-9 103 83)">
        <rect x="40" y="16" width="126" height="142" rx="11" fill="#F0F0F8" />
        <rect x="51" y="27" width="104" height="117" rx="6" fill="white" />
        <rect x="65" y="45" width="76" height="72" rx="5" stroke="#AAB3D0" strokeWidth="1.6" strokeDasharray="5 5" />
        <path d="m79 102 16-16 11 11 7-7 15 12" stroke="#677595" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="118" cy="75" r="5" fill="#ADB8D2" />
      </g>
      <g transform="rotate(9 278 116)">
        <rect x="253" y="73" width="53" height="73" rx="7" fill="white" />
        <path d="m268 116 11-25 11 25h-22Z" fill="#DDA587" />
        <path d="M279 115v17m-10 0h20" stroke="#AE7454" strokeWidth="3" strokeLinecap="round" />
      </g>
      <circle cx="168" cy="113" r="13" fill="#FE6100" />
      <path d="M168 106v14m-7-7h14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SalesEmptyArtwork() {
  return (
    <svg className={styles.salesEmptyArtwork} viewBox="0 0 260 126" fill="none" aria-hidden="true">
      <path d="M23 88c19-16 40-21 63-18 31 3 41-28 80-33 35-4 50 23 72 51 10 13-4 29-25 29H47C22 117 11 101 23 88Z" fill="#FFF0E9" />
      <path d="M54 109c-3-19-12-25-19-28 0 13 5 23 19 28Zm0 0c1-23 9-30 18-35 0 15-5 27-18 35Z" fill="#67988A" />
      <path d="M47 109h17l-3 12H50l-3-12Z" fill="#FE6100" />
      <rect x="76" y="31" width="147" height="89" rx="9" fill="white" stroke="#4B5874" strokeWidth="2" />
      <path d="M77 47h145" stroke="#4B5874" strokeWidth="2" />
      <circle cx="89" cy="39" r="2" fill="#4B5874" /><circle cx="98" cy="39" r="2" fill="#4B5874" /><circle cx="107" cy="39" r="2" fill="#4B5874" />
      <rect x="89" y="64" width="34" height="39" rx="4" fill="#E8EAF0" />
      <rect x="132" y="64" width="34" height="39" rx="4" fill="#E8EAF0" />
      <rect x="175" y="64" width="34" height="39" rx="4" fill="#E8EAF0" />
      <circle cx="240" cy="94" r="2" fill="#5B6B87" /><circle cx="249" cy="84" r="2" fill="#5B6B87" /><circle cx="247" cy="104" r="2" fill="#5B6B87" />
    </svg>
  );
}

function OrdersEmptyArtwork() {
  return (
    <svg className={styles.smallArtwork} viewBox="0 0 150 105" fill="none" aria-hidden="true">
      <ellipse cx="75" cy="88" rx="64" ry="15" fill="#F0F1F5" />
      <path d="m48 45 28-13 28 13-28 12-28-12Z" fill="white" stroke="#303B56" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M48 45v34l28 14V57L48 45Zm56 0v34L76 93V57l28-12Z" fill="white" stroke="#303B56" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="m63 39 28 12M89 51v12" stroke="#303B56" strokeWidth="2.5" />
      <path d="m115 28 8-7m-18 9 2-12m17 25 11-1" stroke="#FE6100" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ProductsEmptyArtwork() {
  return (
    <svg className={styles.smallArtwork} viewBox="0 0 150 105" fill="none" aria-hidden="true">
      <ellipse cx="75" cy="89" rx="64" ry="15" fill="#F0F1F5" />
      <path d="M50 45h50l5 47H45l5-47Z" fill="white" stroke="#303B56" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M62 53V38c0-10 5-16 13-16s13 6 13 16v15" stroke="#303B56" strokeWidth="3" strokeLinecap="round" />
      <path d="m113 35 9-7m-4 18 12-1m-18-22 3-11" stroke="#FE6100" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SalesSeriesChart({ series, currency }: Readonly<{
  series: readonly Readonly<{ startsAt: string; revenueCents: number }>[];
  currency: string;
}>) {
  const width = 700;
  const height = 220;
  const left = 86;
  const right = 18;
  const top = 12;
  const bottom = 30;
  const plotHeight = height - top - bottom;
  const max = Math.max(1, ...series.map((point) => point.revenueCents));
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, series.length - 1);
  const y = (value: number) => top + (1 - value / max) * plotHeight;
  const points = series.map((point, index) => `${x(index)},${y(point.revenueCents)}`).join(" ");
  const ticks = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  return (
    <>
      <svg className={styles.seriesChart} data-dashboard-chart="sales" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Dönemlik satış gelirleri" aria-describedby="dashboard-sales-series-description">
        <desc id="dashboard-sales-series-description">{series.map((point) => `${formatSeriesLabel(point.startsAt)}: ${formatMoney(point.revenueCents, currency)}`).join("; ")}</desc>
        {[0, .5, 1].map((fraction) => <g key={fraction}>
          <line x1={left} x2={width - right} y1={top + fraction * plotHeight} y2={top + fraction * plotHeight} stroke="var(--dash-line)" />
          <text x={left - 9} y={top + fraction * plotHeight + 4} textAnchor="end" className={styles.chartAxisLabel}>{formatAxisMoney(Math.round(max * (1 - fraction)))}</text>
        </g>)}
        <polyline points={points} fill="none" stroke="var(--dash-brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {series.map((point, index) => <circle key={`${point.startsAt}-${index}`} cx={x(index)} cy={y(point.revenueCents)} r={series.length > 22 ? 2 : 3} fill="var(--dash-brand)"><title>{`${formatSeriesLabel(point.startsAt)}: ${formatMoney(point.revenueCents, currency)}`}</title></circle>)}
        {ticks.map((index) => <text key={index} x={x(index)} y={height - 5} textAnchor={index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"} className={styles.chartAxisLabel}>{formatSeriesLabel(series[index].startsAt)}</text>)}
      </svg>
      <ol className={styles.mobileSeriesList} aria-label="Seçili dönemdeki satış gelirleri">
        {series.map((point, index) => <li key={`${point.startsAt}-${index}`}><time dateTime={point.startsAt}>{formatSeriesLabel(point.startsAt)}</time><strong>{formatMoney(point.revenueCents, currency)}</strong></li>)}
      </ol>
    </>
  );
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

function DashboardTopbarContext({ analytics, activeVisitorsEnabled, period, onPeriodChange }: Readonly<{
  analytics?: AnalyticsView;
  activeVisitorsEnabled: boolean;
  period: AnalyticsPeriod;
  onPeriodChange?: (period: AnalyticsPeriod) => void;
}>) {
  return (
    <div className={styles.dashboardTopbarContext}>
      <DashboardLiveVisitors enabled={activeVisitorsEnabled} />
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
    </div>
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
          <article key={metric.key} className={styles.kpiCard} data-metric={metric.key}>
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
      <header className={styles.cardHeader}><span className={styles.sectionIcon} aria-hidden="true"><BarChart3 /></span><div><h2>Satış ritmi</h2><p>{PERIOD_LABELS[period]} ödenmiş sipariş geliri</p></div><strong>{analytics ? formatMoney(analytics.revenueCents, analytics.currency) : "—"}</strong></header>
      <div className={styles.salesChart} role="group" aria-label="Satış grafiği; seçili dönemde ödenmiş sipariş gelirini gösterir">
        {state === "loading" ? <div className={styles.chartSkeleton} role="status"><span />Satış verisi yükleniyor…</div> : null}
        {state === "error" || state === "unsupported" ? <div className={styles.chartError} role="alert"><div><strong>Satış verisi alınamıyor</strong><span>Diğer dashboard bölümleri çalışmaya devam ediyor.</span></div><SummaryRetryButton onRetry={onRetry} /></div> : null}
        {state === "loaded" && analytics ? (
          hasSales && analytics.series.length > 0 ? (
            <>
              <SalesSeriesChart series={analytics.series} currency={analytics.currency} />
              <p className={styles.chartSummary}>{formatRange(analytics.rangeStart, analytics.rangeEnd)} arasında {analytics.orders.paid.toLocaleString("tr-TR")} ödenmiş siparişten {formatMoney(analytics.revenueCents, analytics.currency)} gelir.</p>
            </>
          ) : <div className={styles.emptyState}><SalesEmptyArtwork /><strong>Bu tarih aralığında satış verisi bulunmuyor.</strong><span>Ödenmiş sipariş oluştuğunda grafik burada görünür.</span></div>
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

function FocusBanner({ task, taskState, hasStorefront }: Readonly<{ task?: DashboardTask; taskState: TaskState; hasStorefront: boolean }>) {
  const pendingSetup = !hasStorefront;
  const copy = pendingSetup
    ? { title: "Mağazanızı yayına hazırlayın", detail: "Satış kanalınızı bağlayarak mağazanızı kullanıma açın.", href: "/setup", action: "Kurulumu tamamla" }
    : task?.key === "media"
      ? { title: `Vitrininizde ${task.label.split(" ")[0]} ürün görsel bekliyor`, detail: "Görselleri tamamlayarak ürünlerinizi yayına hazırlayın.", href: task.href, action: "Ürünlere git" }
      : task?.key === "orders"
        ? { title: `İşlem bekleyen ${task.label.split(" ")[0]} siparişiniz var`, detail: "Bekleyen siparişleri gözden geçirerek müşterilerinizi bilgilendirin.", href: task.href, action: "Siparişlere git" }
        : task?.key === "stock"
          ? { title: task.label, detail: task.detail, href: task.href, action: "Ürünlere git" }
          : task?.key === "carts"
            ? { title: task.label, detail: "Sepetleri inceleyerek geri kazanım fırsatlarını görün.", href: task.href, action: "Sepetlere git" }
            : taskState === "loaded"
              ? { title: "Mağazanızın nabzını buradan izleyin", detail: "Yeni siparişler ve satış hareketleri oluştukça burada görünecek.", href: "/analytics", action: "Analizleri gör" }
              : taskState === "loading" || taskState === "partial-loading"
                ? { title: "Mağaza verileri hazırlanıyor", detail: "Güncel işlemler yüklendikçe öncelikli işiniz burada görünecek.", href: "/products", action: "Ürünlere git" }
                : { title: "Mağaza verileri şu anda alınamıyor", detail: "Ürün kataloğunuzdan çalışmaya devam edebilir veya aşağıdan yeniden deneyebilirsiniz.", href: "/products", action: "Ürünlere git" };
  return (
    <section className={styles.focusBanner} aria-label="Öncelikli mağaza işi">
      <div className={styles.focusCopy}>
        <h2>{task?.key === "media" && !pendingSetup ? <>Vitrininizde <em>{task.label.split(" ")[0]} ürün</em> görsel bekliyor</> : copy.title}</h2>
        <p>{copy.detail}</p>
        <Link href={copy.href}>{copy.action}<ArrowRight aria-hidden="true" /></Link>
      </div>
      <FocusArtwork />
    </section>
  );
}

function ActionItemsCard({ analyticsState, onRetry, state, tasks }: Readonly<{ analyticsState: OptionalLoadState; onRetry: () => void; state: TaskState; tasks: readonly DashboardTask[] }>) {
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
      <header className={styles.cardHeader}><div><h2 id="attention-title">Mağaza durumu</h2><p>Yapılacaklar ve canlı veriler</p></div>{tasks.length > 0 ? <span>{tasks.length}</span> : null}</header>
      {tasks.length > 0 ? <ul className={styles.attentionList}>{tasks.map((task) => <li key={task.key}><span className={styles.attentionIcon} aria-hidden="true">{task.key === "media" ? <Package /> : task.key === "orders" ? <ShoppingBag /> : task.key === "stock" ? <Store /> : <Users />}</span><div><strong>{task.label}</strong><small>{task.detail}</small></div><Link href={task.href} aria-label={task.actionLabel}><ChevronRight aria-hidden="true" /></Link></li>)}</ul> : null}
      {analyticsState === "error" || analyticsState === "unsupported" ? <div className={styles.dataNotice}><span className={styles.dataNoticeIcon} aria-hidden="true"><Activity /></span><div><strong>Canlı veri alınamıyor</strong><small>Satış analizleri şu anda gösterilemiyor.</small></div></div> : null}
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
              <td data-label="Müşteri"><span className={styles.customerCell}><span aria-hidden="true">{(order.customerName ?? "Mağaza müşterisi").charAt(0).toLocaleUpperCase("tr-TR")}</span>{order.customerName ?? "Mağaza müşterisi"}</span></td>
              <td data-label="Ürünler">{order.itemCount.toLocaleString("tr-TR")} ürün</td>
              <td data-label="Tutar">{formatMoney(order.totalCents, order.currency)}</td>
              <td data-label="Durum"><span className={styles.statusStack}><span className={styles.statusPill} data-tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</span><small>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</small></span></td>
              <td data-label="Tarih"><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
            </tr>)}</tbody>
          </table></div>
        ) : <div className={styles.emptyState}><OrdersEmptyArtwork /><strong>Henüz sipariş bulunmuyor.</strong><span>Siparişleriniz oluştuğunda burada listelenecek.</span></div>
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
          : <div className={styles.emptyState}><ProductsEmptyArtwork /><strong>Bu tarih aralığında satış verisi bulunmuyor.</strong><span>Ürün satışı oluştuğunda liste burada görünür.</span></div>
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
  const storefront = props.dashboard.chromeCards.find(({ key }) => key === "storefront");
  const focusTask = tasks.find((task) => task.key === "media") ?? tasks[0];

  return (
    <PanelPageShell>
      <PanelTopbarBridge title={props.dashboard.title} subtitle={props.dashboard.description} context={<DashboardTopbarContext analytics={analytics} activeVisitorsEnabled={props.activeVisitorsEnabled ?? true} period={period} onPeriodChange={props.onPeriodChange} />} actions={<div className={styles.dashboardTopbarActions}><PanelActionButton href="/orders/quick-links">Mağaza satışı</PanelActionButton></div>} />
      <div className={styles.dashboardPage}>
        <header className={styles.pageIntro}><h1>Mağazanın nabzı</h1><p>Önce önemli işlere odaklanın.</p></header>
        <FocusBanner task={focusTask} taskState={taskState} hasStorefront={storefront?.status === "Doğrulandı"} />
        <DashboardKpiGrid metrics={metrics} />
        <div className={styles.primaryGrid}><SalesChartCard analytics={analytics} state={analyticsState} period={period} onRetry={props.onRefreshAnalytics ?? props.onRefresh} /><ActionItemsCard tasks={tasks} state={taskState} analyticsState={analyticsState} onRetry={props.onRefreshOperations ?? props.onRefresh} /></div>
        <div className={styles.operationsGrid}><RecentOrdersCard orders={props.recentOrders ?? Object.freeze([])} state={props.recentOrdersState ?? "loading"} onRetry={props.onRefreshRecentOrders ?? props.onRefresh} /><TopProductsCard analytics={analytics} state={analyticsState} /></div>
        <div className={styles.detailGrid}><OrderStatusCard dashboard={props.dashboard} state={props.ordersState ?? (orders ? "loaded" : "unsupported")} /><StoreStatusBar dashboard={props.dashboard} analytics={analytics} analyticsState={analyticsState} /></div>
        <DashboardInsights dashboard={props.dashboard} analytics={analytics} customersState={props.customersState ?? (props.dashboard.customers.state === "ready" ? "loaded" : "unsupported")} cartsState={props.cartsState ?? (carts ? "loaded" : "unsupported")} />
        <DashboardQuickActions />
      </div>
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
