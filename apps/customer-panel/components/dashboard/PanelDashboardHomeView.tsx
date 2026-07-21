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
import type { OrderDashboardSummary } from "@celebix/saas-contracts";

import {
  PanelActionButton,
  PanelMetricCard,
  PanelPageHeader,
  PanelPageShell,
  PanelPanel,
} from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import { catalogApi, type CatalogDashboardSummary } from "@/lib/catalog-ui/client";
import { orderApi } from "@/lib/order-ui/client";
import type { AuthoritySlice } from "@/lib/panel-ui/authority-slice";
import {
  createMerchantDashboardViewModel,
  type MerchantDashboardViewModel,
} from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

const UNSUPPORTED_DOMAINS = Object.freeze([
  Object.freeze({ key: "analytics" as const, label: "Analizler" }),
  Object.freeze({ key: "customers" as const, label: "Müşteriler" }),
  Object.freeze({ key: "carts" as const, label: "Sepetler" }),
]);

const unavailableCatalog = (retryable: boolean): AuthoritySlice<CatalogDashboardSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyCatalog = (value: CatalogDashboardSummary): AuthoritySlice<CatalogDashboardSummary> =>
  Object.freeze({ state: "ready", value, asOf: new Date().toISOString() });

const unavailableOrders = (retryable: boolean): AuthoritySlice<OrderDashboardSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyOrders = (value: OrderDashboardSummary): AuthoritySlice<OrderDashboardSummary> =>
  Object.freeze({ state: "ready", value, asOf: value.asOf });

function orderMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(cents / 100);
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
}: {
  dashboard: MerchantDashboardViewModel;
  onRefresh: () => void;
  state: "loading" | "loaded" | "error";
  ordersState?: "loading" | "loaded" | "error" | "unsupported";
}) {
  const activeOrdersState = ordersState ?? (dashboard.orders.state === "ready" ? "loaded" : "unsupported");
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={dashboard.title}
        description={dashboard.description}
        actions={<PanelActionButton href="/products/new" primary>Yeni ürün</PanelActionButton>}
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

      <div className={styles.controlBar} aria-label="Gösterge paneli filtreleri">
        <div>
          <p className={styles.controlLabel}>Dönem</p>
          <button type="button" className={styles.filterButton} disabled aria-disabled="true">
            Güncel katalog
          </button>
        </div>
        <div>
          <p className={styles.controlLabel}>Kanal</p>
          <button type="button" className={styles.filterButton} disabled aria-disabled="true">
            Paylaşılan katalog
          </button>
        </div>
      </div>

      {state === "loading" ? (
        <section className={styles.catalogSurface} role="status" aria-label="Katalog özeti yükleniyor">
          <div className={styles.metricTabs}>
            {Array.from({ length: 4 }, (_, index) => (
              <article className={styles.skeletonCard} aria-hidden="true" key={index}>
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
            <div className={styles.metricTabs} role="list" aria-label="Katalog metrikleri">
              {dashboard.catalog.value.metrics.map((metric) => (
                <article className={styles.metricTab} role="listitem" key={metric.key}>
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
                  <BarChart data={dashboard.catalog.value.chart} accessibilityLayer>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value) => [String(value), "Katalog"]} />
                    <Bar dataKey="value" fill="#FF6A00" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className={styles.readinessLine}>
              {dashboard.catalog.value.productsWithoutMedia.toLocaleString("tr-TR")} üründe medya eksik · ürün limiti {dashboard.catalog.value.productLimit.toLocaleString("tr-TR")}
            </p>
          </div>
        </section>
      ) : null}

      {activeOrdersState === "loading" ? (
        <section className={styles.catalogSurface} role="status" aria-label="Sipariş özeti yükleniyor">
          <div className={styles.metricTabs}>{Array.from({ length: 4 }, (_, index) => <article className={styles.skeletonCard} aria-hidden="true" key={index}><span className={styles.skeletonLine} /><span className={styles.skeletonLine} /></article>)}</div>
        </section>
      ) : null}

      {activeOrdersState === "error" && dashboard.orders.state === "unavailable" ? (
        <div className={styles.errorState} role="alert"><div><h2>Sipariş özeti yüklenemedi</h2><p>Doğrulanmış sipariş verileri şu anda kullanılamıyor.</p></div><DashboardRefreshButton label="Tekrar dene" onRefresh={onRefresh} state="error" /></div>
      ) : null}

      {activeOrdersState === "loaded" && dashboard.orders.state === "ready" ? (
        <section className={styles.catalogSurface} aria-labelledby="order-summary-title">
          <div className={styles.chartPanel}><div className={styles.sectionHeader}><div><h2 id="order-summary-title">Sipariş özeti</h2><p>Son doğrulama: {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(dashboard.orders.value.asOf))}</p></div></div></div>
          <div className={styles.metricTabs} role="list" aria-label="Sipariş metrikleri">
            <article className={styles.metricTab} role="listitem"><p>Toplam sipariş</p><strong>{dashboard.orders.value.totalOrders.toLocaleString("tr-TR")}</strong><span>Kalıcı sipariş kayıtları</span></article>
            <article className={styles.metricTab} role="listitem"><p>Bekleyen sipariş</p><strong>{dashboard.orders.value.pendingOrders.toLocaleString("tr-TR")}</strong><span>Operasyon bekliyor</span></article>
            <article className={styles.metricTab} role="listitem"><p>Tamamlanan sipariş</p><strong>{dashboard.orders.value.fulfilledOrders.toLocaleString("tr-TR")}</strong><span>Teslim edilen kayıtlar</span></article>
            <article className={styles.metricTab} role="listitem"><p>Doğrulanmış gelir</p><strong>{orderMoney(dashboard.orders.value.revenueCents, dashboard.orders.value.currency)}</strong><span>Teslim edilmiş ve ödenmiş</span></article>
          </div>
        </section>
      ) : null}

      <section className={styles.unsupportedSurface} aria-labelledby="unsupported-dashboard-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="unsupported-dashboard-title">Ticaret görünümü</h2>
            <p>{dashboard.orders.state === "unsupported" ? "Sipariş, analiz, müşteri ve sepet verileri bu panelde desteklenmiyor." : "Analiz, müşteri ve sepet verileri bu panelde henüz desteklenmiyor."}</p>
          </div>
        </div>
        <div className={styles.unsupportedGrid}>
          {dashboard.orders.state === "unsupported" ? <article className={styles.unsupportedCard}><span>Siparişler</span><b>Desteklenmiyor</b><p>Bu alan için doğrulanmış bir veri kaynağı bağlı değil.</p></article> : null}
          {UNSUPPORTED_DOMAINS.map((domain) => (
            <article className={styles.unsupportedCard} key={domain.key}>
              <span>{domain.label}</span>
              <b>
                {dashboard[domain.key].state === "unsupported" ? "Desteklenmiyor" : "Kullanılamıyor"}
              </b>
              <p>Bu alan için doğrulanmış bir veri kaynağı bağlı değil.</p>
            </article>
          ))}
        </div>
      </section>

      <PanelPanel title="Hızlı işlemler">
        <div className={styles.actionRail}>
          {dashboard.actions.map((action) => (
            <PanelActionButton key={action.href} href={action.href}>{action.label}</PanelActionButton>
          ))}
        </div>
      </PanelPanel>
    </PanelPageShell>
  );
}

export function PanelDashboardHomeView() {
  const chrome = usePanelChromeModel();
  const [catalog, setCatalog] = useState<AuthoritySlice<CatalogDashboardSummary>>(
    () => unavailableCatalog(false),
  );
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [orders, setOrders] = useState<AuthoritySlice<OrderDashboardSummary>>(() => unavailableOrders(false));
  const [ordersState, setOrdersState] = useState<"loading" | "loaded" | "error">("loading");
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setState("loading");
    setOrdersState("loading");
    const [catalogResult, orderResult] = await Promise.allSettled([
      catalogApi.getDashboardSummary(),
      orderApi.getDashboardSummary(),
    ]);
    if (sequence !== requestSequence.current) return;
    if (catalogResult.status === "fulfilled") { setCatalog(readyCatalog(catalogResult.value)); setState("loaded"); }
    else { setCatalog(unavailableCatalog(true)); setState("error"); }
    if (orderResult.status === "fulfilled") { setOrders(readyOrders(orderResult.value)); setOrdersState("loaded"); }
    else { setOrders(unavailableOrders(true)); setOrdersState("error"); }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const dashboard = createMerchantDashboardViewModel(chrome, catalog, orders);
  return (
    <PanelDashboardPresentation
      dashboard={dashboard}
      onRefresh={() => { void load(); }}
      state={state}
      ordersState={ordersState}
    />
  );
}
