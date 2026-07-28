"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Globe2, PackageCheck, Store } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ANALYTICS_PERIODS,
  type AbandonedCartSummary,
  type AnalyticsDashboard,
  type AnalyticsPeriod,
  type CustomerSummary,
  type OrderDashboardSummary,
  type OrderListItem,
  type OrderPaymentStatus,
  type OrderStatus,
} from "@celebix/saas-contracts";

import {
  PanelActionButton,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import {
  catalogApi,
  type CatalogDashboardSummary,
} from "@/lib/catalog-ui/client";
import { orderApi } from "@/lib/order-ui/client";
import { abandonedCartApi } from "@/lib/abandoned-cart-ui/client";
import { customerApi } from "@/lib/customer-ui/client";
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
  failed: "Başarısız",
  refunded: "İade edildi",
});

type LoadState = "loading" | "loaded" | "error";
type OptionalLoadState = LoadState | "unsupported";

const unavailableCatalog = (
  retryable: boolean,
): AuthoritySlice<CatalogDashboardSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyCatalog = (
  value: CatalogDashboardSummary,
): AuthoritySlice<CatalogDashboardSummary> =>
  Object.freeze({ state: "ready", value, asOf: new Date().toISOString() });

const unavailableOrders = (
  retryable: boolean,
): AuthoritySlice<OrderDashboardSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyOrders = (
  value: OrderDashboardSummary,
): AuthoritySlice<OrderDashboardSummary> =>
  Object.freeze({ state: "ready", value, asOf: value.asOf });

const unavailableCarts = (
  retryable: boolean,
): AuthoritySlice<AbandonedCartSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyCarts = (
  value: AbandonedCartSummary,
): AuthoritySlice<AbandonedCartSummary> =>
  Object.freeze({ state: "ready", value, asOf: value.asOf });

const unavailableCustomers = (
  retryable: boolean,
): AuthoritySlice<CustomerSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyCustomers = (
  value: CustomerSummary,
): AuthoritySlice<CustomerSummary> =>
  Object.freeze({ state: "ready", value, asOf: value.asOf });

const unavailableAnalytics = (
  retryable: boolean,
): AuthoritySlice<AnalyticsDashboard> =>
  Object.freeze({ state: "unavailable", retryable });

const readyAnalytics = (
  value: AnalyticsDashboard,
): AuthoritySlice<AnalyticsDashboard> =>
  Object.freeze({ state: "ready", value, asOf: value.generatedAt });

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatSeriesLabel(startsAt: string): string {
  const date = new Date(startsAt);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("tr-TR", {
        day: "2-digit",
        month: "short",
        timeZone: "UTC",
      }).format(date)
    : startsAt;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : value;
}

function formatOrderDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date)
    : value;
}

function stateDetail(state: OptionalLoadState): string {
  if (state === "loading") return "Yükleniyor";
  if (state === "loaded") return "Kalıcı veriden";
  return "Kullanılamıyor";
}

function SummaryRetryButton({
  onRetry,
}: Readonly<{ onRetry: () => void }>) {
  return (
    <button type="button" className={styles.retryButton} onClick={onRetry}>
      Tekrar dene
    </button>
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
  readonly onRefreshCatalog?: () => void;
  readonly onRefreshOrders?: () => void;
  readonly onRefreshCarts?: () => void;
  readonly onRefreshCustomers?: () => void;
  readonly onRefreshAnalytics?: () => void;
  readonly onRefreshRecentOrders?: () => void;
  readonly period?: AnalyticsPeriod;
  readonly onPeriodChange?: (period: AnalyticsPeriod) => void;
  readonly recentOrders?: readonly OrderListItem[];
  readonly recentOrdersState?: LoadState;
}

export function PanelDashboardPresentation(props: DashboardPresentationProps) {
  const analyticsState =
    props.analyticsState ??
    (props.dashboard.analytics.state === "ready" ? "loaded" : "unsupported");
  const analytics =
    props.dashboard.analytics.state === "ready"
      ? props.dashboard.analytics.value
      : undefined;
  const storefront = props.dashboard.chromeCards.find(
    ({ key }) => key === "storefront",
  );
  const hasStorefront = storefront?.status === "Doğrulandı";
  const period = props.period ?? analytics?.period ?? "month";
  const pendingOrders =
    props.dashboard.orders.state === "ready"
      ? props.dashboard.orders.value.pendingOrders
      : 0;
  const catalog = props.dashboard.catalog.state === "ready"
    ? props.dashboard.catalog.value
    : undefined;
  const carts = props.dashboard.carts.state === "ready"
    ? props.dashboard.carts.value
    : undefined;
  const customers = props.dashboard.customers.state === "ready"
    ? props.dashboard.customers.value
    : undefined;
  const outOfStockVariants = catalog?.metrics.find(
    ({ key }) => key === "out-of-stock",
  )?.value ?? 0;
  const tasks = [
    ...(pendingOrders > 0 ? [{
      key: "orders",
      label: `${pendingOrders.toLocaleString("tr-TR")} sipariş işlem bekliyor`,
      detail: "Sipariş akışını gözden geçirin",
      href: "/orders",
    }] : []),
    ...(outOfStockVariants > 0 ? [{
      key: "stock",
      label: `${outOfStockVariants.toLocaleString("tr-TR")} stok uyarısı`,
      detail: "Satışa açık varyantları tamamlayın",
      href: "/products",
    }] : []),
    ...((catalog?.productsWithoutMedia ?? 0) > 0 ? [{
      key: "media",
      label: `${catalog?.productsWithoutMedia.toLocaleString("tr-TR")} üründe medya eksik`,
      detail: "Ürün görsellerini tamamlayın",
      href: "/products",
    }] : []),
    ...((carts?.abandoned ?? 0) > 0 ? [{
      key: "carts",
      label: `${carts?.abandoned.toLocaleString("tr-TR")} terk edilen sepet`,
      detail: `${formatMoney(carts?.lostValueCents ?? 0, carts?.currency ?? "TRY")} bekleyen değer`,
      href: "/orders/abandoned-carts",
    }] : []),
  ] as const;
  const emptyValue = "—";
  const kpis = [
    {
      key: "sales",
      label: "Toplam satış",
      value: analytics
        ? formatMoney(analytics.revenueCents, analytics.currency)
        : emptyValue,
      detail: analytics ? "Ödenmiş siparişlerden" : stateDetail(analyticsState),
    },
    {
      key: "orders",
      label: "Sipariş sayısı",
      value: analytics
        ? analytics.orders.total.toLocaleString("tr-TR")
        : emptyValue,
      detail: analytics
        ? `${analytics.orders.paid.toLocaleString("tr-TR")} ödenmiş`
        : stateDetail(analyticsState),
    },
    {
      key: "customers",
      label: "Yeni müşteri",
      value: analytics
        ? analytics.customers.newInPeriod.toLocaleString("tr-TR")
        : emptyValue,
      detail: analytics ? "Seçili dönemde" : stateDetail(analyticsState),
    },
    {
      key: "products",
      label: "Aktif ürün",
      value: analytics
        ? analytics.catalog.activeProducts.toLocaleString("tr-TR")
        : emptyValue,
      detail: analytics ? "Kalıcı katalogda" : stateDetail(analyticsState),
    },
    {
      key: "refunds",
      label: "İadeler",
      value: analytics
        ? analytics.orders.refunded.toLocaleString("tr-TR")
        : emptyValue,
      detail: analytics ? "İade edilen sipariş" : stateDetail(analyticsState),
    },
  ] as const;

  return (
    <PanelPageShell>
      <PanelTopbarBridge
        title={props.dashboard.title}
        subtitle={props.dashboard.description}
        actions={(
          <div className={styles.dashboardTopbarActions} aria-label="Hızlı işlemler">
            <PanelActionButton href="/orders/quick-links">Hızlı sipariş</PanelActionButton>
            <PanelActionButton href="/products/new" primary>Ürün ekle</PanelActionButton>
          </div>
        )}
      />
      <h1 className={styles.visuallyHidden}>Mağaza özeti</h1>
      <nav className={styles.dashboardMobileActions} aria-label="Mobil hızlı işlemler">
        <PanelActionButton href="/orders/quick-links">Hızlı sipariş</PanelActionButton>
        <PanelActionButton href="/products/new" primary>Ürün ekle</PanelActionButton>
      </nav>

      <div className={styles.summaryToolbar} aria-label="Mağaza özeti filtreleri">
        <div className={styles.channelFilter}>
          <Globe2 aria-hidden="true" />
          {hasStorefront ? "Doğrulanmış satış kanalı" : "Satış kanalı bekleniyor"}
        </div>
        <label className={styles.periodFilter}>
          <CalendarDays aria-hidden="true" />
          <span className={styles.visuallyHidden}>Dönem</span>
          <select
            aria-label="Dönem"
            value={period}
            onChange={(event) => {
              const nextPeriod = event.target.value as AnalyticsPeriod;
              if (ANALYTICS_PERIODS.includes(nextPeriod)) {
                props.onPeriodChange?.(nextPeriod);
              }
            }}
          >
            {ANALYTICS_PERIODS.map((value) => (
              <option key={value} value={value}>
                {PERIOD_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <span className={styles.authorityNote}>Kalıcı verilere göre</span>
        {analytics ? (
          <time className={styles.updatedAt} dateTime={analytics.generatedAt}>
            Son güncelleme {formatGeneratedAt(analytics.generatedAt)}
          </time>
        ) : null}
      </div>

      <section className={styles.readinessBanner} aria-label="Mağaza durumu">
        <span className={styles.readinessIcon} aria-hidden="true">
          <Store />
        </span>
        <div>
          <h2>{hasStorefront ? "Mağaza adresiniz doğrulandı" : "Mağaza kurulumunu tamamlayın"}</h2>
          <p>
            {hasStorefront
              ? `${storefront?.value} adresi etkin mağazanıza bağlı.`
              : "Satışa başlamadan önce mağaza adresi ve kurulum durumunu gözden geçirin."}
          </p>
        </div>
        <PanelActionButton href={hasStorefront ? "/analytics" : "/setup"} primary>
          {hasStorefront ? "Analitiği görüntüle" : "Kurulumu tamamla"}
        </PanelActionButton>
      </section>

      <section className={styles.performancePanel} aria-label="Mağaza performansı">
        <div className={styles.kpiViewport}>
          <div className={styles.kpiRail} role="list" aria-label="Mağaza performans metrikleri">
            {kpis.map((metric) => (
              <article key={metric.key} className={styles.kpi} role="listitem">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail}</small>
              </article>
            ))}
          </div>
        </div>

        <div className={styles.salesChart} role="img" aria-label="Kalıcı satış grafiği">
          {analyticsState === "loading" ? (
            <div className={styles.chartLoading} role="status">
              Satış özeti yükleniyor…
            </div>
          ) : null}
          {analyticsState === "error" || analyticsState === "unsupported" ? (
            <div className={styles.chartError} role="alert">
              <div>
                <strong>Satış özeti yüklenemedi</strong>
                <span>Kalıcı ticari veriler şu anda kullanılamıyor.</span>
              </div>
              <SummaryRetryButton
                onRetry={props.onRefreshAnalytics ?? props.onRefresh}
              />
            </div>
          ) : null}
          {analyticsState === "loaded" && analytics ? (
            analytics.series.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analytics.series} accessibilityLayer margin={{ left: 8, right: 12 }}>
                  <CartesianGrid stroke="#E8EDF3" vertical={false} />
                  <XAxis
                    dataKey="startsAt"
                    tickFormatter={formatSeriesLabel}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      formatMoney(Number(value), analytics.currency)
                    }
                    axisLine={false}
                    tickLine={false}
                    width={82}
                  />
                  <Tooltip
                    labelFormatter={(value) =>
                      typeof value === "string" ? formatSeriesLabel(value) : ""
                    }
                    formatter={(value) => [
                      formatMoney(Number(value), analytics.currency),
                      "Satış",
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenueCents"
                    stroke="#FE6100"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.emptyChart}>
                <strong>Bu dönemde satış hareketi yok</strong>
                <span>Kalıcı ödenmiş sipariş oluştuğunda grafik burada görünür.</span>
              </div>
            )
          ) : null}
        </div>

        {pendingOrders > 0 ? (
          <div className={styles.pendingAction}>
            <PackageCheck aria-hidden="true" />
            <PanelActionButton href="/orders">
              {pendingOrders.toLocaleString("tr-TR")} sipariş işlem bekliyor · Siparişleri aç
            </PanelActionButton>
          </div>
        ) : null}

        <div className={styles.channelSummary} aria-label="Satış kanalları">
          <article>
            <span className={styles.channelIcon} aria-hidden="true">
              <Globe2 />
            </span>
            <div>
              <strong>{hasStorefront ? storefront?.value : "Storefront bağlı değil"}</strong>
              <small>{hasStorefront ? "Doğrulanmış mağaza adresi" : "Kurulum bekliyor"}</small>
            </div>
            <span className={hasStorefront ? styles.channelReady : styles.channelPending}>
              {hasStorefront ? "Etkin" : "Bekliyor"}
            </span>
          </article>
          <PanelActionButton href="/analytics">Analitiği görüntüle</PanelActionButton>
        </div>
      </section>

      <div className={styles.insightGrid}>
        <section className={styles.bestSellers} aria-labelledby="best-sellers-title">
          <header>
            <h2 id="best-sellers-title">En çok satanlar</h2>
            <PanelActionButton href="/products">Ürünler</PanelActionButton>
          </header>
          {analyticsState === "loading" ? (
            <p className={styles.insightState} role="status">Ürünler yükleniyor…</p>
          ) : null}
          {(analyticsState === "error" || analyticsState === "unsupported") ? (
            <p className={styles.insightState}>En çok satan ürünler şu anda kullanılamıyor.</p>
          ) : null}
          {analyticsState === "loaded" && analytics ? (
            analytics.topProducts.length > 0 ? (
              <ol className={styles.productList}>
                {analytics.topProducts.map((product, index) => (
                  <li key={product.productId}>
                    <span className={styles.productRank}>{index + 1}</span>
                    <div>
                      <strong>{product.title}</strong>
                      <small>{product.quantity.toLocaleString("tr-TR")} adet</small>
                    </div>
                    <span>{formatMoney(product.revenueCents, analytics.currency)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className={styles.emptyProducts}>
                <PackageCheck aria-hidden="true" />
                <strong>Seçilen dönemde satış bulunmuyor</strong>
                <span>Kalıcı ürün satışı oluştuğunda liste burada görünür.</span>
              </div>
            )
          ) : null}
        </section>

        <section className={styles.growthPanel} aria-labelledby="growth-title">
          <header>
            <h2 id="growth-title">Büyüme metrikleri</h2>
          </header>
          <dl>
            <div>
              <dt>İade edilen sipariş</dt>
              <dd>{analytics ? analytics.growth.refundedOrders.toLocaleString("tr-TR") : emptyValue}</dd>
            </div>
            <div>
              <dt>Ortalama sipariş tutarı</dt>
              <dd>
                {analytics?.growth.averageOrderValueCents === null || !analytics
                  ? emptyValue
                  : formatMoney(analytics.growth.averageOrderValueCents, analytics.currency)}
              </dd>
            </div>
            <div>
              <dt>Düşük stok</dt>
              <dd>{analytics ? analytics.growth.lowStockVariants.toLocaleString("tr-TR") : emptyValue}</dd>
            </div>
            <div>
              <dt>Toplam müşteri</dt>
              <dd>{analytics ? analytics.growth.totalCustomers.toLocaleString("tr-TR") : emptyValue}</dd>
            </div>
          </dl>
        </section>
      </div>

      {props.recentOrdersState ? (
        <section className={styles.recentOrders} aria-labelledby="recent-orders-title">
          <header>
            <div>
              <h2 id="recent-orders-title">Son siparişler</h2>
              <p>En yeni kalıcı sipariş kayıtları</p>
            </div>
            <PanelActionButton href="/orders">Tüm siparişler</PanelActionButton>
          </header>
          {props.recentOrdersState === "loading" ? (
            <p className={styles.recentOrdersState} role="status">Son siparişler yükleniyor…</p>
          ) : null}
          {props.recentOrdersState === "error" ? (
            <div className={styles.recentOrdersError} role="alert">
              <span>Son siparişler şu anda kullanılamıyor.</span>
              <SummaryRetryButton onRetry={props.onRefreshRecentOrders ?? props.onRefresh} />
            </div>
          ) : null}
          {props.recentOrdersState === "loaded" ? (
            (props.recentOrders?.length ?? 0) > 0 ? (
              <div className={styles.recentOrdersViewport}>
                <table className={styles.recentOrdersTable}>
                  <caption className={styles.visuallyHidden}>En yeni siparişler</caption>
                  <thead>
                    <tr>
                      <th scope="col">Sipariş</th>
                      <th scope="col">Müşteri</th>
                      <th scope="col">Durum</th>
                      <th scope="col">Ödeme</th>
                      <th scope="col">Tutar</th>
                      <th scope="col">Tarih</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.recentOrders?.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <PanelActionButton href={`/orders/${order.id}`}>{order.orderNumber}</PanelActionButton>
                          <small>{order.itemCount.toLocaleString("tr-TR")} ürün</small>
                        </td>
                        <td>{order.customerName}</td>
                        <td><span className={styles.orderStatus}>{ORDER_STATUS_LABELS[order.status]}</span></td>
                        <td>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</td>
                        <td>{formatMoney(order.totalCents, order.currency)}</td>
                        <td><time dateTime={order.createdAt}>{formatOrderDate(order.createdAt)}</time></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.recentOrdersState}>Henüz kalıcı sipariş bulunmuyor.</p>
            )
          ) : null}
        </section>
      ) : null}

      <div className={styles.operationsGrid}>
        <section className={styles.operationsPanel} aria-labelledby="todo-title">
          <header>
            <h2 id="todo-title">Yapılacaklar</h2>
            <PanelActionButton href="/orders">Siparişleri görüntüle</PanelActionButton>
          </header>
          {tasks.length > 0 ? (
            <ul className={styles.taskList}>
              {tasks.map((task) => (
                <li key={task.key}>
                  <div>
                    <strong>{task.label}</strong>
                    <small>{task.detail}</small>
                  </div>
                  <PanelActionButton href={task.href}>Aç</PanelActionButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.operationsEmpty}>Bugün kritik aksiyon yok.</p>
          )}
        </section>

        <section className={styles.operationsPanel} aria-labelledby="customer-view-title">
          <header><h2 id="customer-view-title">Müşteri görünümü</h2></header>
          <dl className={styles.customerFacts}>
            <div><dt>Aktif müşteri</dt><dd>{customers ? customers.active.toLocaleString("tr-TR") : emptyValue}</dd></div>
            <div><dt>E-posta izni</dt><dd>{customers ? customers.consentedEmail.toLocaleString("tr-TR") : emptyValue}</dd></div>
            <div><dt>Toplam harcama</dt><dd>{customers ? formatMoney(customers.totalSpentCents, customers.currency) : emptyValue}</dd></div>
            <div><dt>Terk edilen sepet</dt><dd>{carts ? carts.abandoned.toLocaleString("tr-TR") : emptyValue}</dd></div>
          </dl>
          <PanelActionButton href="/customers">Müşterileri görüntüle</PanelActionButton>
        </section>
      </div>
    </PanelPageShell>
  );
}

export function PanelDashboardHomeView() {
  const chrome = usePanelChromeModel();
  const [catalog, setCatalog] = useState<AuthoritySlice<CatalogDashboardSummary>>(
    () => unavailableCatalog(false),
  );
  const [state, setState] = useState<LoadState>("loading");
  const [orders, setOrders] = useState<AuthoritySlice<OrderDashboardSummary>>(
    () => unavailableOrders(false),
  );
  const [ordersState, setOrdersState] = useState<LoadState>("loading");
  const [recentOrders, setRecentOrders] = useState<readonly OrderListItem[]>(
    () => Object.freeze([]),
  );
  const [recentOrdersState, setRecentOrdersState] = useState<LoadState>("loading");
  const [carts, setCarts] = useState<AuthoritySlice<AbandonedCartSummary>>(
    () => unavailableCarts(false),
  );
  const [cartsState, setCartsState] = useState<LoadState>("loading");
  const [customers, setCustomers] = useState<AuthoritySlice<CustomerSummary>>(
    () => unavailableCustomers(false),
  );
  const [customersState, setCustomersState] = useState<LoadState>("loading");
  const [analytics, setAnalytics] = useState<AuthoritySlice<AnalyticsDashboard>>(
    () => unavailableAnalytics(false),
  );
  const [analyticsState, setAnalyticsState] = useState<LoadState>("loading");
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const analyticsPeriod = useRef<AnalyticsPeriod>("month");
  const loader = useRef<ReturnType<typeof createMerchantDashboardSliceLoader> | null>(null);
  const recentOrdersReload = useRef<(() => void) | null>(null);
  const reload = useCallback(
    (slice: MerchantDashboardSlice) => loader.current?.reload(slice),
    [],
  );

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
          if (slice === "catalog") {
            setCatalog(readyCatalog(value as CatalogDashboardSummary));
            setState("loaded");
          }
          if (slice === "orders") {
            setOrders(readyOrders(value as OrderDashboardSummary));
            setOrdersState("loaded");
          }
          if (slice === "carts") {
            setCarts(readyCarts(value as AbandonedCartSummary));
            setCartsState("loaded");
          }
          if (slice === "customers") {
            setCustomers(readyCustomers(value as CustomerSummary));
            setCustomersState("loaded");
          }
          if (slice === "analytics") {
            setAnalytics(readyAnalytics(value as AnalyticsDashboard));
            setAnalyticsState("loaded");
          }
        },
        unavailable(slice) {
          if (slice === "catalog") {
            setCatalog(unavailableCatalog(true));
            setState("error");
          }
          if (slice === "orders") {
            setOrders(unavailableOrders(true));
            setOrdersState("error");
          }
          if (slice === "carts") {
            setCarts(unavailableCarts(true));
            setCartsState("error");
          }
          if (slice === "customers") {
            setCustomers(unavailableCustomers(true));
            setCustomersState("error");
          }
          if (slice === "analytics") {
            setAnalytics(unavailableAnalytics(true));
            setAnalyticsState("error");
          }
        },
      },
    );
    loader.current = next;
    next.reloadAll();
    return () => {
      next.dispose();
      if (loader.current === next) loader.current = null;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    const load = () => {
      const request = ++generation;
      setRecentOrdersState("loading");
      void orderApi.listOrders({ pageSize: 5, sort: "newest" }).then(
        (result) => {
          if (disposed || request !== generation) return;
          setRecentOrders(result.items);
          setRecentOrdersState("loaded");
        },
        () => {
          if (disposed || request !== generation) return;
          setRecentOrders(Object.freeze([]));
          setRecentOrdersState("error");
        },
      );
    };
    recentOrdersReload.current = load;
    load();
    return () => {
      disposed = true;
      generation += 1;
      if (recentOrdersReload.current === load) recentOrdersReload.current = null;
    };
  }, []);

  const changePeriod = useCallback((nextPeriod: AnalyticsPeriod) => {
    if (analyticsPeriod.current === nextPeriod) return;
    analyticsPeriod.current = nextPeriod;
    setPeriod(nextPeriod);
    loader.current?.reload("analytics");
  }, []);

  const dashboard = createMerchantDashboardViewModel(
    chrome,
    catalog,
    orders,
    carts,
    customers,
    analytics,
  );

  return (
    <PanelDashboardPresentation
      dashboard={dashboard}
      onRefresh={() => reload("analytics")}
      onRefreshCatalog={() => reload("catalog")}
      onRefreshOrders={() => reload("orders")}
      onRefreshCarts={() => reload("carts")}
      onRefreshCustomers={() => reload("customers")}
      onRefreshAnalytics={() => reload("analytics")}
      onRefreshRecentOrders={() => recentOrdersReload.current?.()}
      onPeriodChange={changePeriod}
      period={period}
      recentOrders={recentOrders}
      recentOrdersState={recentOrdersState}
      state={state}
      ordersState={ordersState}
      cartsState={cartsState}
      customersState={customersState}
      analyticsState={analyticsState}
    />
  );
}
