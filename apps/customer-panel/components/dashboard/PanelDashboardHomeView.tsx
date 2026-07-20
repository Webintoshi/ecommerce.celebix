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

import {
  PanelActionButton,
  PanelMetricCard,
  PanelPageHeader,
  PanelPageShell,
  PanelPanel,
} from "@/components/panel/PanelPageShell";
import { usePanelChromeModel } from "@/components/panel/PanelLayoutClient";
import { catalogApi, type CatalogDashboardSummary } from "@/lib/catalog-ui/client";
import type { AuthoritySlice } from "@/lib/panel-ui/authority-slice";
import {
  createMerchantDashboardViewModel,
  createPanelDashboardModel,
} from "@/lib/panel-ui/dashboard-model";
import styles from "./panel-dashboard.module.css";

const UNSUPPORTED_DOMAINS = Object.freeze([
  Object.freeze({ key: "orders" as const, label: "Siparişler" }),
  Object.freeze({ key: "analytics" as const, label: "Analizler" }),
  Object.freeze({ key: "customers" as const, label: "Müşteriler" }),
  Object.freeze({ key: "carts" as const, label: "Sepetler" }),
]);

const unavailableCatalog = (retryable: boolean): AuthoritySlice<CatalogDashboardSummary> =>
  Object.freeze({ state: "unavailable", retryable });

const readyCatalog = (value: CatalogDashboardSummary): AuthoritySlice<CatalogDashboardSummary> =>
  Object.freeze({ state: "ready", value, asOf: new Date().toISOString() });

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

export function PanelDashboardHomeView() {
  const chrome = usePanelChromeModel();
  const legacyDashboard = createPanelDashboardModel(chrome);
  const [catalog, setCatalog] = useState<AuthoritySlice<CatalogDashboardSummary>>(
    () => unavailableCatalog(false),
  );
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    setState("loading");
    try {
      const value = await catalogApi.getDashboardSummary();
      if (sequence !== requestSequence.current) return;
      setCatalog(readyCatalog(value));
      setState("loaded");
    } catch {
      if (sequence !== requestSequence.current) return;
      setCatalog(unavailableCatalog(true));
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  const dashboard = createMerchantDashboardViewModel(chrome, catalog);
  return (
    <PanelPageShell>
      <PanelPageHeader
        title={legacyDashboard.title}
        description={legacyDashboard.description}
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
            onRefresh={() => { void load(); }}
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
                onRefresh={() => { void load(); }}
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

      <section className={styles.unsupportedSurface} aria-labelledby="unsupported-dashboard-title">
        <div className={styles.sectionHeader}>
          <div>
            <h2 id="unsupported-dashboard-title">Ticaret görünümü</h2>
            <p>Sipariş, analiz, müşteri ve sepet verileri bu panelde desteklenmiyor.</p>
          </div>
        </div>
        <div className={styles.unsupportedGrid}>
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
