"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AbandonedCartSummary,
  AnalyticsSummary,
  CustomerSummary,
  OrderDashboardSummary,
} from "@celebix/saas-contracts";

import {
  PanelActionButton,
  PanelMetricCard,
  PanelPageHeader,
  PanelPageShell,
  PanelPanel,
} from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import {
  catalogApi,
  type CatalogDashboardSummary,
} from "@/lib/catalog-ui/client";
import { orderApi } from "@/lib/order-ui/client";
import { abandonedCartApi } from "@/lib/abandoned-cart-ui/client";
import { customerApi } from "@/lib/customer-ui/client";
import { createAnalyticsBrowserApi } from "@/lib/analytics-ui/client";
import type { AuthoritySlice } from "@/lib/panel-ui/authority-slice";
import {
  createMerchantDashboardViewModel,
  loadMerchantDashboardSummaries,
  type MerchantDashboardViewModel,
} from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

const analyticsApi = createAnalyticsBrowserApi();

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
): AuthoritySlice<AnalyticsSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyAnalytics = (
  value: AnalyticsSummary,
): AuthoritySlice<AnalyticsSummary> =>
  Object.freeze({ state: "ready", value, asOf: value.asOf });

function panelTimestamp(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function analyticsHasData(summary: AnalyticsSummary): boolean {
  return summary.pageviews > 0 || summary.visitors > 0 || summary.visits > 0 || summary.activeVisitors > 0 || summary.pageviewsSeries.length > 0;
}

function orderMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(
    cents / 100,
  );
}

function DashboardRefreshButton({
  ariaLabel,
  label,
  onRefresh,
  state,
}: {
  ariaLabel?: string;
  label: "Tekrar dene" | "Yenile";
  onRefresh: () => void;
  state: "loading" | "loaded" | "error";
}) {
  return (
    <button
      type="button"
      className={styles.refreshButton}
      onClick={onRefresh}
      disabled={state === "loading"}
      aria-label={ariaLabel ?? (label === "Yenile" ? "Katalog özetini yenile" : undefined)}
    >
      {label}
    </button>
  );
}

export function PanelDashboardPresentation({
  dashboard,
  onRefresh,
  state,
  ordersState,
  cartsState,
  customersState,
  analyticsState,
}: {
  dashboard: MerchantDashboardViewModel;
  onRefresh: () => void;
  state: "loading" | "loaded" | "error";
  ordersState?: "loading" | "loaded" | "error" | "unsupported";
  cartsState?: "loading" | "loaded" | "error" | "unsupported";
  customersState?: "loading" | "loaded" | "error" | "unsupported";
  analyticsState?: "loading" | "loaded" | "error" | "unsupported";
}) {
  const activeOrdersState =
    ordersState ??
    (dashboard.orders.state === "ready" ? "loaded" : "unsupported");
  const activeCartsState =
    cartsState ??
    (dashboard.carts.state === "ready" ? "loaded" : "unsupported");
  const activeCustomersState =
    customersState ??
    (dashboard.customers.state === "ready" ? "loaded" : "unsupported");
  const activeAnalyticsState =
    analyticsState ??
    (dashboard.analytics.state === "ready" ? "loaded" : "unsupported");
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={dashboard.title}
        description={dashboard.description}
        actions={
          <PanelActionButton href="/products/new" primary>
            Yeni ürün
          </PanelActionButton>
        }
      />

      <div className={styles.cardGrid}>
        {dashboard.chromeCards.map((card) => (
          <PanelMetricCard
            key={card.key}
            label={card.label}
            value={card.value}
            detail={card.detail ?? card.status}
          />
        ))}
      </div>

      <div
        className={styles.controlBar}
        aria-label="Gösterge paneli filtreleri"
      >
        <div>
          <p className={styles.controlLabel}>Dönem</p>
          <button
            type="button"
            className={styles.filterButton}
            disabled
            aria-disabled="true"
          >
            Güncel katalog
          </button>
        </div>
        <div>
          <p className={styles.controlLabel}>Kanal</p>
          <button
            type="button"
            className={styles.filterButton}
            disabled
            aria-disabled="true"
          >
            Paylaşılan katalog
          </button>
        </div>
      </div>

      {state === "loading" ? (
        <section
          className={styles.catalogSurface}
          role="status"
          aria-label="Katalog özeti yükleniyor"
        >
          <div className={styles.metricTabs}>
            {Array.from({ length: 4 }, (_, index) => (
              <article
                className={styles.skeletonCard}
                aria-hidden="true"
                key={index}
              >
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </article>
            ))}
            <article className={styles.skeletonCard} aria-hidden="true">
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLine} />
            </article>
          </div>
          <div className={styles.chartSkeleton} aria-hidden="true">
            <span className={styles.skeletonLine} />
          </div>
        </section>
      ) : null}

      {state === "error" && dashboard.catalog.state === "unavailable" ? (
        <div className={styles.errorState} role="alert">
          <div>
            <h2>Katalog özeti yüklenemedi</h2>
            <p>Doğrulanmış katalog verileri şu anda kullanılamıyor.</p>
          </div>
          <DashboardRefreshButton
            label="Tekrar dene"
            onRefresh={onRefresh}
            state={state}
          />
        </div>
      ) : null}

      {state === "loaded" && dashboard.catalog.state === "ready" ? (
        <section className={styles.catalogSurface}>
          <div className={styles.metricTabsViewport}>
            <div
              className={styles.metricTabs}
              role="list"
              aria-label="Katalog metrikleri"
            >
              {dashboard.catalog.value.metrics.map((metric) => (
                <article
                  className={styles.metricTab}
                  role="listitem"
                  key={metric.key}
                >
                  <p>{metric.label}</p>
                  <strong>{metric.value.toLocaleString("tr-TR")}</strong>
                  <span>{metric.detail}</span>
                </article>
              ))}
            </div>
          </div>
          <div className={styles.chartPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Katalog dağılımı</h2>
                <p>Kaynak: doğrulanmış paylaşılan katalog özeti.</p>
              </div>
              <DashboardRefreshButton
                label="Yenile"
                onRefresh={onRefresh}
                state={state}
              />
            </div>
            <div className={styles.chartViewport}>
              <div className={styles.chartInner}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={dashboard.catalog.value.chart}
                    accessibilityLayer
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip
                      formatter={(value) => [String(value), "Katalog"]}
                    />
                    <Bar dataKey="value" fill="#FF6A00" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className={styles.readinessLine}>
              {dashboard.catalog.value.productsWithoutMedia.toLocaleString(
                "tr-TR",
              )}{" "}
              üründe medya eksik · ürün limiti{" "}
              {dashboard.catalog.value.productLimit.toLocaleString("tr-TR")}
            </p>
          </div>
        </section>
      ) : null}

      {activeOrdersState === "loading" ? (
        <section
          className={styles.catalogSurface}
          role="status"
          aria-label="Sipariş özeti yükleniyor"
        >
          <div className={styles.metricTabs}>
            {Array.from({ length: 4 }, (_, index) => (
              <article
                className={styles.skeletonCard}
                aria-hidden="true"
                key={index}
              >
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeOrdersState === "error" &&
      dashboard.orders.state === "unavailable" ? (
        <div className={styles.errorState} role="alert">
          <div>
            <h2>Sipariş özeti yüklenemedi</h2>
            <p>Doğrulanmış sipariş verileri şu anda kullanılamıyor.</p>
          </div>
          <DashboardRefreshButton
            label="Tekrar dene"
            onRefresh={onRefresh}
            state="error"
          />
        </div>
      ) : null}

      {activeOrdersState === "loaded" && dashboard.orders.state === "ready" ? (
        <section
          className={styles.catalogSurface}
          aria-labelledby="order-summary-title"
        >
          <div className={styles.chartPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="order-summary-title">Sipariş özeti</h2>
                <p>
                  Son doğrulama:{" "}
                  {new Intl.DateTimeFormat("tr-TR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(dashboard.orders.value.asOf))}
                </p>
              </div>
            </div>
          </div>
          <div
            className={styles.metricTabs}
            role="list"
            aria-label="Sipariş metrikleri"
          >
            <article className={styles.metricTab} role="listitem">
              <p>Toplam sipariş</p>
              <strong>
                {dashboard.orders.value.totalOrders.toLocaleString("tr-TR")}
              </strong>
              <span>Kalıcı sipariş kayıtları</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Bekleyen sipariş</p>
              <strong>
                {dashboard.orders.value.pendingOrders.toLocaleString("tr-TR")}
              </strong>
              <span>Operasyon bekliyor</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Tamamlanan sipariş</p>
              <strong>
                {dashboard.orders.value.fulfilledOrders.toLocaleString("tr-TR")}
              </strong>
              <span>Teslim edilen kayıtlar</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Doğrulanmış gelir</p>
              <strong>
                {orderMoney(
                  dashboard.orders.value.revenueCents,
                  dashboard.orders.value.currency,
                )}
              </strong>
              <span>Teslim edilmiş ve ödenmiş</span>
            </article>
          </div>
        </section>
      ) : null}

      {activeCartsState === "loading" ? (
        <section
          className={styles.catalogSurface}
          role="status"
          aria-label="Terk edilen sepet özeti yükleniyor"
        >
          <div className={styles.metricTabs}>
            {Array.from({ length: 4 }, (_, index) => (
              <article
                className={styles.skeletonCard}
                aria-hidden="true"
                key={index}
              >
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeCartsState === "error" &&
      dashboard.carts.state === "unavailable" ? (
        <div className={styles.errorState} role="alert">
          <div>
            <h2>Terk edilen sepet özeti yüklenemedi</h2>
            <p>Doğrulanmış sepet verileri şu anda kullanılamıyor.</p>
          </div>
          <DashboardRefreshButton
            label="Tekrar dene"
            onRefresh={onRefresh}
            state="error"
          />
        </div>
      ) : null}

      {activeCartsState === "loaded" && dashboard.carts.state === "ready" ? (
        <section
          className={styles.catalogSurface}
          aria-labelledby="cart-summary-title"
        >
          <div className={styles.chartPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="cart-summary-title">Terk edilen sepet özeti</h2>
                <p>
                  Son doğrulama:{" "}
                  {new Intl.DateTimeFormat("tr-TR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(dashboard.carts.value.asOf))}
                </p>
              </div>
              <PanelActionButton href="/orders/abandoned-carts">
                Sepetleri incele
              </PanelActionButton>
            </div>
          </div>
          <div
            className={styles.metricTabs}
            role="list"
            aria-label="Terk edilen sepet metrikleri"
          >
            <article className={styles.metricTab} role="listitem">
              <p>Terk edilen</p>
              <strong>
                {dashboard.carts.value.abandoned.toLocaleString("tr-TR")}
              </strong>
              <span>Takip bekleyen sepet</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Kurtarılan</p>
              <strong>
                {dashboard.carts.value.recovered.toLocaleString("tr-TR")}
              </strong>
              <span>Kalıcı kurtarma kaydı</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Kayıp değer</p>
              <strong>
                {orderMoney(
                  dashboard.carts.value.lostValueCents,
                  dashboard.carts.value.currency,
                )}
              </strong>
              <span>Terk edilmiş sepet toplamı</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Kurtarılan değer</p>
              <strong>
                {orderMoney(
                  dashboard.carts.value.recoveredValueCents,
                  dashboard.carts.value.currency,
                )}
              </strong>
              <span>Kanıtlanmış kurtarma toplamı</span>
            </article>
          </div>
        </section>
      ) : null}

      {activeCustomersState === "loading" ? (
        <section
          className={styles.catalogSurface}
          role="status"
          aria-label="Müşteri özeti yükleniyor"
        >
          <div className={styles.metricTabs}>
            {Array.from({ length: 4 }, (_, index) => (
              <article
                className={styles.skeletonCard}
                aria-hidden="true"
                key={index}
              >
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeCustomersState === "error" &&
      dashboard.customers.state === "unavailable" ? (
        <div className={styles.errorState} role="alert">
          <div>
            <h2>Müşteri özeti yüklenemedi</h2>
            <p>Doğrulanmış müşteri verileri şu anda kullanılamıyor.</p>
          </div>
          <DashboardRefreshButton
            label="Tekrar dene"
            onRefresh={onRefresh}
            state="error"
          />
        </div>
      ) : null}

      {activeCustomersState === "loaded" &&
      dashboard.customers.state === "ready" ? (
        <section
          className={styles.catalogSurface}
          aria-labelledby="customer-summary-title"
        >
          <div className={styles.chartPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="customer-summary-title">Müşteri özeti</h2>
                <p>
                  Son doğrulama:{" "}
                  {new Intl.DateTimeFormat("tr-TR", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(dashboard.customers.value.asOf))}
                </p>
              </div>
              <PanelActionButton href="/customers">
                Müşterileri incele
              </PanelActionButton>
            </div>
          </div>
          <div
            className={styles.metricTabs}
            role="list"
            aria-label="Müşteri metrikleri"
          >
            <article className={styles.metricTab} role="listitem">
              <p>Aktif müşteri</p>
              <strong>
                {dashboard.customers.value.active.toLocaleString("tr-TR")}
              </strong>
              <span>Kalıcı aktif kayıtlar</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Arşiv</p>
              <strong>
                {dashboard.customers.value.archived.toLocaleString("tr-TR")}
              </strong>
              <span>Arşivlenmiş kayıtlar</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>E-posta izinli</p>
              <strong>
                {dashboard.customers.value.consentedEmail.toLocaleString(
                  "tr-TR",
                )}
              </strong>
              <span>Doğrulanmış kanal izni</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Toplam harcama</p>
              <strong>
                {orderMoney(
                  dashboard.customers.value.totalSpentCents,
                  dashboard.customers.value.currency,
                )}
              </strong>
              <span>Kalıcı sipariş toplamı</span>
            </article>
          </div>
        </section>
      ) : null}

      {activeAnalyticsState === "loading" ? (
        <section
          className={styles.analyticsSurface}
          role="status"
          aria-label="Analytics özeti yükleniyor"
        >
          <div className={styles.analyticsMetricGrid}>
            {Array.from({ length: 3 }, (_, index) => (
              <article className={styles.skeletonCard} aria-hidden="true" key={index}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeAnalyticsState === "loaded" &&
      dashboard.analytics.state === "ready" &&
      analyticsHasData(dashboard.analytics.value) ? (
        <section
          className={styles.analyticsSurface}
          aria-labelledby="analytics-summary-title"
        >
          <div className={styles.chartPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="analytics-summary-title">Mağaza analizi</h2>
                <p>
                  Umami · 30 gün · son güncelleme {panelTimestamp(dashboard.analytics.value.asOf)}
                </p>
              </div>
              <DashboardRefreshButton ariaLabel="Analytics özetini yenile" label="Yenile" onRefresh={onRefresh} state="loaded" />
            </div>
          </div>
          <div className={styles.analyticsMetricGrid} role="list" aria-label="Analytics metrikleri">
            <article className={styles.metricTab} role="listitem">
              <p>Sayfa görüntüleme</p>
              <strong>{dashboard.analytics.value.pageviews.toLocaleString("tr-TR")}</strong>
              <span>Umami tarafından doğrulandı</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Ziyaretçi</p>
              <strong>{dashboard.analytics.value.visitors.toLocaleString("tr-TR")}</strong>
              <span>Seçili dönem</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Aktif ziyaretçi</p>
              <strong>{dashboard.analytics.value.activeVisitors.toLocaleString("tr-TR")}</strong>
              <span>Anlık provider değeri</span>
            </article>
          </div>
          <div className={styles.analyticsChart}>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dashboard.analytics.value.pageviewsSeries} accessibilityLayer>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="at" />
                <YAxis allowDecimals={false} />
                <Tooltip formatter={(value) => [String(value), "Sayfa görüntüleme"]} />
                <Line type="monotone" dataKey="value" stroke="#FF6A00" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      ) : null}

      {activeAnalyticsState === "loaded" &&
      ((dashboard.analytics.state === "ready" && !analyticsHasData(dashboard.analytics.value)) ||
        dashboard.analytics.state === "empty") ? (
        <div className={styles.authorityState} role="status">
          <div>
            <h2>Mağaza analizi</h2>
            <p>{dashboard.analytics.state === "empty" ? dashboard.analytics.message : "Henüz doğrulanmış analiz verisi yok"}</p>
          </div>
        </div>
      ) : null}

      {(activeAnalyticsState === "unsupported" || activeAnalyticsState === "loaded") &&
      (dashboard.analytics.state === "locked" || dashboard.analytics.state === "unsupported") ? (
        <div className={styles.authorityState} role="status">
          <div>
            <h2>Mağaza analizi</h2>
            <p>Analytics özelliği kapalı veya bu mağaza için kullanılamıyor.</p>
          </div>
        </div>
      ) : null}

      {activeAnalyticsState === "error" && dashboard.analytics.state === "unavailable" ? (
        <div className={styles.errorState} role="alert">
          <div>
            <h2>Analytics özeti yüklenemedi</h2>
            <p>Umami verileri şu anda kullanılamıyor; diğer dashboard kaynakları etkilenmedi.</p>
          </div>
          <DashboardRefreshButton label="Tekrar dene" onRefresh={onRefresh} state="error" />
        </div>
      ) : null}

      <PanelPanel title="Hızlı işlemler">
        <div className={styles.actionRail}>
          {dashboard.actions.map((action) => (
            <PanelActionButton key={action.href} href={action.href}>
              {action.label}
            </PanelActionButton>
          ))}
        </div>
      </PanelPanel>
    </PanelPageShell>
  );
}

export function PanelDashboardHomeView() {
  const chrome = usePanelChromeModel();
  const [catalog, setCatalog] = useState<
    AuthoritySlice<CatalogDashboardSummary>
  >(() => unavailableCatalog(false));
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [orders, setOrders] = useState<AuthoritySlice<OrderDashboardSummary>>(
    () => unavailableOrders(false),
  );
  const [ordersState, setOrdersState] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [carts, setCarts] = useState<AuthoritySlice<AbandonedCartSummary>>(() =>
    unavailableCarts(false),
  );
  const [cartsState, setCartsState] = useState<"loading" | "loaded" | "error">(
    "loading",
  );
  const [customers, setCustomers] = useState<AuthoritySlice<CustomerSummary>>(
    () => unavailableCustomers(false),
  );
  const [customersState, setCustomersState] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [analytics, setAnalytics] = useState<AuthoritySlice<AnalyticsSummary>>(
    () => unavailableAnalytics(false),
  );
  const [analyticsState, setAnalyticsState] = useState<
    "loading" | "loaded" | "error"
  >("loading");
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setState("loading");
    setOrdersState("loading");
    setCartsState("loading");
    setCustomersState("loading");
    setAnalyticsState("loading");
    const [baseResults, supplementalResults] = await Promise.all([
      loadMerchantDashboardSummaries(catalogApi, orderApi, analyticsApi),
      Promise.allSettled([
        abandonedCartApi.getSummary(),
        customerApi.summary(),
      ]),
    ]);
    const [catalogResult, orderResult, analyticsResult] = baseResults;
    const [cartResult, customerResult] = supplementalResults;
    if (sequence !== requestSequence.current) return;
    if (catalogResult.status === "fulfilled") {
      setCatalog(readyCatalog(catalogResult.value));
      setState("loaded");
    } else {
      setCatalog(unavailableCatalog(true));
      setState("error");
    }
    if (orderResult.status === "fulfilled") {
      setOrders(readyOrders(orderResult.value));
      setOrdersState("loaded");
    } else {
      setOrders(unavailableOrders(true));
      setOrdersState("error");
    }
    if (cartResult?.status === "fulfilled") {
      setCarts(readyCarts(cartResult.value));
      setCartsState("loaded");
    } else {
      setCarts(unavailableCarts(true));
      setCartsState("error");
    }
    if (customerResult?.status === "fulfilled") {
      setCustomers(readyCustomers(customerResult.value));
      setCustomersState("loaded");
    } else {
      setCustomers(unavailableCustomers(true));
      setCustomersState("error");
    }
    if (analyticsResult.status === "fulfilled") {
      setAnalytics(readyAnalytics(analyticsResult.value));
      setAnalyticsState("loaded");
    } else {
      setAnalytics(unavailableAnalytics(true));
      setAnalyticsState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);

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
      onRefresh={() => {
        void load();
      }}
      state={state}
      ordersState={ordersState}
      cartsState={cartsState}
      customersState={customersState}
      analyticsState={analyticsState}
    />
  );
}
