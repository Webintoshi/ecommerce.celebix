"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  AbandonedCartSummary,
  AnalyticsDashboard,
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
import type { AuthoritySlice } from "@/lib/panel-ui/authority-slice";
import {
  createMerchantDashboardViewModel,
  loadMerchantDashboardSummaries,
  type MerchantDashboardViewModel,
} from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

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

function orderMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(
    cents / 100,
  );
}

function DashboardRefreshButton({
  label,
  onRefresh,
  state,
}: {
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
      aria-label={label === "Yenile" ? "Katalog özetini yenile" : undefined}
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
  const analyticsValue = dashboard.analytics.state === "ready"
    ? dashboard.analytics.value
    : undefined;
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={dashboard.title}
        description={dashboard.description}
        actions={
          <>
            <PanelActionButton href="/analytics">Ticari analitik</PanelActionButton>
            <PanelActionButton href="/products/new" primary>
              Yeni ürün
            </PanelActionButton>
          </>
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

      {activeAnalyticsState === "loading" ? (
        <section
          className={styles.catalogSurface}
          role="status"
          aria-label="Ticari analitik özeti yükleniyor"
        >
          <div className={styles.metricTabs}>
            {Array.from({ length: 4 }, (_, index) => (
              <article className={styles.skeletonCard} aria-hidden="true" key={index}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {activeAnalyticsState === "error" &&
      dashboard.analytics.state === "unavailable" ? (
        <div className={styles.errorState} role="alert">
          <div>
            <h2>Ticari analitik özeti yüklenemedi</h2>
            <p>Kalıcı ticari özet şu anda kullanılamıyor.</p>
          </div>
          <DashboardRefreshButton
            label="Tekrar dene"
            onRefresh={onRefresh}
            state="error"
          />
        </div>
      ) : null}

      {activeAnalyticsState === "loaded" && analyticsValue ? (
        <section className={styles.catalogSurface} aria-labelledby="analytics-summary-title">
          <div className={styles.chartPanel}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 id="analytics-summary-title">Bu ayın ticari özeti</h2>
                <p>Kalıcı sipariş, müşteri ve katalog kayıtlarından hesaplanır.</p>
              </div>
              <PanelActionButton href="/analytics">Analitiği incele</PanelActionButton>
            </div>
          </div>
          <div className={styles.metricTabs} role="list" aria-label="Ticari analitik metrikleri">
            <article className={styles.metricTab} role="listitem">
              <p>Gelir</p>
              <strong>{orderMoney(analyticsValue.revenueCents, analyticsValue.currency)}</strong>
              <span>Ödenmiş siparişlerden</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Sipariş</p>
              <strong>{analyticsValue.orders.total.toLocaleString("tr-TR")}</strong>
              <span>{analyticsValue.orders.paid.toLocaleString("tr-TR")} ödenmiş kayıt</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Yeni müşteri</p>
              <strong>{analyticsValue.customers.newInPeriod.toLocaleString("tr-TR")}</strong>
              <span>{analyticsValue.customers.total.toLocaleString("tr-TR")} kalıcı müşteri</span>
            </article>
            <article className={styles.metricTab} role="listitem">
              <p>Düşük stok</p>
              <strong>{analyticsValue.catalog.lowStockVariants.toLocaleString("tr-TR")}</strong>
              <span>{analyticsValue.catalog.activeProducts.toLocaleString("tr-TR")} aktif ürün</span>
            </article>
          </div>
          {analyticsValue.series.length > 0 ? (
            <div className={styles.chartPanel}>
              <div className={styles.chartViewport}>
                <div className={styles.chartInner} role="img" aria-label="Aylık gelir zaman serisi">
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={analyticsValue.series} accessibilityLayer>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="startsAt" />
                      <YAxis tickFormatter={(value) => orderMoney(Number(value), analyticsValue.currency)} />
                      <Tooltip formatter={(value) => [orderMoney(Number(value), analyticsValue.currency), "Gelir"]} />
                      <Bar dataKey="revenueCents" fill="#FF6A00" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : null}
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
  const [analytics, setAnalytics] = useState<AuthoritySlice<AnalyticsDashboard>>(
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
      loadMerchantDashboardSummaries(catalogApi, orderApi),
      Promise.allSettled([
        abandonedCartApi.getSummary(),
        customerApi.summary(),
        (async () => {
          const { analyticsApi } = await import("@/lib/analytics-ui/client");
          return analyticsApi.dashboard("month");
        })(),
      ]),
    ]);
    const [catalogResult, orderResult] = baseResults;
    const [cartResult, customerResult, analyticsResult] = supplementalResults;
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
    if (analyticsResult?.status === "fulfilled") {
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
