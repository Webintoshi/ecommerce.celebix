"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  type AnalyticsDashboard as AnalyticsDashboardData,
  type AnalyticsPeriod,
} from "@celebix/saas-contracts";

import {
  PanelEmptyState,
  PanelMetricCard,
  PanelPageHeader,
  PanelPageShell,
  PanelPanel,
} from "@/components/panel/PanelPageShell";
import { AnalyticsApiError, analyticsApi } from "@/lib/analytics-ui/client";

import styles from "./analytics-dashboard.module.css";

type ViewState = "loading" | "ready" | "error";

const PERIOD_LABELS: Readonly<Record<AnalyticsPeriod, string>> = Object.freeze({
  today: "Bugün",
  week: "Bu hafta",
  month: "Bu ay",
  year: "Bu yıl",
});

const ERROR_MESSAGE: Readonly<Record<AnalyticsApiError["code"], string>> =
  Object.freeze({
    invalid_input: "Seçilen dönem geçersiz.",
    unauthenticated: "Oturumunuz sona erdi.",
    membership_denied: "Bu veriyi görüntüleme yetkiniz yok.",
    store_inactive: "Mağaza bu veriye erişemiyor.",
    feature_not_enabled: "Analitik planınızda etkin değil.",
    durable_authority_invalid: "Yetki yeniden doğrulanamadı.",
    unavailable: "Analitik verileri şu anda kullanılamıyor.",
  });

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
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

function stableError(error: unknown): string {
  return error instanceof AnalyticsApiError
    ? ERROR_MESSAGE[error.code]
    : ERROR_MESSAGE.unavailable;
}

export function AnalyticsDashboard() {
  const [period, setPeriod] = useState<AnalyticsPeriod>("month");
  const [dashboard, setDashboard] = useState<AnalyticsDashboardData>();
  const [state, setState] = useState<ViewState>("loading");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"csv" | "json" | null>(null);
  const requestVersion = useRef(0);
  const exportVersion = useRef(0);
  const mountedRef = useRef(true);
  const activeExportRef = useRef<number | null>(null);

  const load = useCallback(async (requestedPeriod: AnalyticsPeriod) => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    if (!mountedRef.current) return;
    setState("loading");
    setError("");
    try {
      const next = await analyticsApi.dashboard(requestedPeriod);
      if (!mountedRef.current || requestVersion.current !== version) return;
      setDashboard(next);
      setState("ready");
    } catch (caught) {
      if (!mountedRef.current || requestVersion.current !== version) return;
      setDashboard(undefined);
      setError(stableError(caught));
      setState("error");
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersion.current += 1;
      exportVersion.current += 1;
      activeExportRef.current = null;
    };
  }, []);

  useEffect(() => {
    void load(period);
    return () => {
      requestVersion.current += 1;
    };
  }, [load, period]);

  const selectPeriod = useCallback((next: AnalyticsPeriod) => {
    setPeriod(next);
  }, []);

  const exportDashboard = useCallback(async (format: "csv" | "json") => {
    if (activeExportRef.current !== null) return;
    const version = exportVersion.current + 1;
    exportVersion.current = version;
    activeExportRef.current = version;
    setExporting(format);
    setError("");
    try {
      const value = await analyticsApi.export(period, format);
      if (!mountedRef.current || exportVersion.current !== version) return;
      const blob = typeof value === "string"
        ? new Blob([value], { type: "text/csv;charset=utf-8" })
        : new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
      const filename = format === "csv" ? "merchant-analytics.csv" : "merchant-analytics.json";
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (caught) {
      if (mountedRef.current && exportVersion.current === version) setError(stableError(caught));
    } finally {
      if (mountedRef.current && activeExportRef.current === version) {
        activeExportRef.current = null;
        setExporting(null);
      }
    }
  }, [period]);

  return (
    <PanelPageShell>
      <div className={styles.root}>
      <PanelPageHeader
        title="Analitik"
        description="Yalnız kalıcı sipariş, müşteri ve katalog kayıtlarından türetilen ticari özet."
      />

      <div className={styles.toolbar} aria-label="Analitik dönem seçimi">
        <div className={styles.periods} role="group" aria-label="Dönem">
          {ANALYTICS_PERIODS.map((value) => (
            <button
              type="button"
              key={value}
              className={value === period ? styles.periodActive : styles.period}
              aria-pressed={value === period}
              disabled={state === "loading" && value === period}
              onClick={() => selectPeriod(value)}
            >
              {PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
        <div className={styles.exports} aria-label="Analitik dışa aktar">
          <button type="button" disabled={exporting !== null || state !== "ready"} onClick={() => void exportDashboard("csv")}>
            {exporting === "csv" ? "CSV hazırlanıyor…" : "CSV dışa aktar"}
          </button>
          <button type="button" disabled={exporting !== null || state !== "ready"} onClick={() => void exportDashboard("json")}>
            {exporting === "json" ? "JSON hazırlanıyor…" : "JSON dışa aktar"}
          </button>
        </div>
      </div>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {state === "loading" ? (
        <section className={styles.loading} role="status" aria-label="Analitik yükleniyor">
          Analitik yükleniyor…
        </section>
      ) : null}

      {state === "error" ? (
        <PanelEmptyState
          title="Analitik yüklenemedi"
          description="Doğrulanmış ticari özet şu anda kullanılamıyor."
          action={<button type="button" className={styles.retry} onClick={() => void load(period)}>Tekrar dene</button>}
        />
      ) : null}

      {state === "ready" && dashboard ? (
        <>
          <section className={styles.metrics} aria-label="Kalıcı ticari metrikler">
            <PanelMetricCard label="Gelir" value={formatMoney(dashboard.revenueCents, dashboard.currency)} detail={`${dashboard.orders.paid.toLocaleString("tr-TR")} ödenmiş sipariş`} />
            <PanelMetricCard label="Sipariş" value={dashboard.orders.total.toLocaleString("tr-TR")} detail={`${dashboard.orders.cancelled.toLocaleString("tr-TR")} iptal · ${dashboard.orders.refunded.toLocaleString("tr-TR")} iade`} />
            <PanelMetricCard label="Yeni müşteri" value={dashboard.customers.newInPeriod.toLocaleString("tr-TR")} detail={`${dashboard.customers.total.toLocaleString("tr-TR")} kalıcı müşteri`} />
            <PanelMetricCard label="Düşük stok" value={dashboard.catalog.lowStockVariants.toLocaleString("tr-TR")} detail={`${dashboard.catalog.activeProducts.toLocaleString("tr-TR")} aktif ürün`} />
          </section>

          {dashboard.series.length === 0 ? (
            <PanelEmptyState title="Bu dönem için ticari hareket yok" description="Kalıcı sipariş kaydı oluştuğunda zaman serisi burada görünür." />
          ) : (
            <PanelPanel title="Gelir zaman serisi">
              <div className={styles.chartViewport}>
                <div className={styles.chart} role="img" aria-label="Gelir zaman serisi; seçili dönemde kalıcı sipariş gelirini gösterir">
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dashboard.series} accessibilityLayer margin={{ left: 12, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="startsAt" tickFormatter={formatSeriesLabel} />
                      <YAxis
                        tickFormatter={(value) => formatMoney(Number(value), dashboard.currency)}
                        width={96}
                        tickMargin={8}
                      />
                      <Tooltip labelFormatter={(value) => typeof value === "string" ? formatSeriesLabel(value) : ""} formatter={(value) => [formatMoney(Number(value), dashboard.currency), "Gelir"]} />
                      <Line type="monotone" dataKey="revenueCents" stroke="#FF6A00" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </PanelPanel>
          )}

          <PanelPanel title="En çok gelir getiren ürünler">
            {dashboard.topProducts.length ? (
              <ol className={styles.products}>
                {dashboard.topProducts.map((product) => (
                  <li key={product.productId}>
                    <span>{product.title}</span>
                    <span>{product.quantity.toLocaleString("tr-TR")} adet · {formatMoney(product.revenueCents, dashboard.currency)}</span>
                  </li>
                ))}
              </ol>
            ) : <p className={styles.empty}>Bu dönem için kalıcı ürün geliri yok.</p>}
          </PanelPanel>
        </>
      ) : null}
      </div>
    </PanelPageShell>
  );
}
