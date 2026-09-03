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
  ANALYTICS_METRIC_TYPES,
  ANALYTICS_RANGES,
  type AnalyticsMetricType,
  type AnalyticsRange,
} from "@celebix/saas-contracts";

import { createAnalyticsBrowserApi } from "@/lib/analytics-ui/client";
import {
  errorAnalyticsPresentation,
  loadAnalyticsPresentation,
  loadingAnalyticsPresentation,
  type AnalyticsBrowserApi,
  type AnalyticsPresentationModel,
} from "@/lib/analytics-ui/presentation";
import styles from "./panel-analytics.module.css";

const DEFAULT_API = createAnalyticsBrowserApi();
const RANGE_LABELS: Readonly<Record<AnalyticsRange, string>> = Object.freeze({
  "7d": "7 gün",
  "30d": "30 gün",
  "90d": "90 gün",
});
const METRIC_LABELS: Readonly<Record<AnalyticsMetricType, string>> =
  Object.freeze({
    path: "Sayfalar",
    referrer: "Yönlendirenler",
    device: "Cihazlar",
    country: "Ülkeler",
    event: "Ticaret olayları",
  });

export type PanelAnalyticsViewProps = Readonly<{
  initialRange?: AnalyticsRange;
  api?: AnalyticsBrowserApi;
}>;

export function PanelAnalyticsView({
  initialRange = "30d",
  api = DEFAULT_API,
}: PanelAnalyticsViewProps) {
  const safeInitialRange = ANALYTICS_RANGES.includes(initialRange)
    ? initialRange
    : "30d";
  const [selectedRange, setSelectedRange] =
    useState<AnalyticsRange>(safeInitialRange);
  const [selectedMetric, setSelectedMetric] =
    useState<AnalyticsMetricType>("path");
  const [model, setModel] = useState<AnalyticsPresentationModel>(() =>
    loadingAnalyticsPresentation(),
  );
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(
    async (range: AnalyticsRange) => {
      activeRequest.current?.abort();
      const controller = new AbortController();
      activeRequest.current = controller;
      setModel(loadingAnalyticsPresentation());
      try {
        const next = await loadAnalyticsPresentation(
          api,
          range,
          controller.signal,
        );
        if (!controller.signal.aborted && activeRequest.current === controller)
          setModel(next);
      } catch {
        if (!controller.signal.aborted && activeRequest.current === controller)
          setModel(errorAnalyticsPresentation());
      }
    },
    [api],
  );

  useEffect(() => {
    void load(selectedRange);
    return () => activeRequest.current?.abort();
  }, [load, selectedRange]);

  const selectedResult = model.metrics[selectedMetric];
  return (
    <section className={styles.workspace} aria-labelledby="traffic-analytics-title">
      <header className={styles.workspaceHeader}>
        <div>
          <h2 id="traffic-analytics-title">Mağaza trafiği</h2>
          <p>Umami tarafından doğrulanan anonim trafik özeti</p>
        </div>
        <div
          className={styles.rangeBar}
          role="group"
          aria-label="Analiz tarih aralığı"
        >
          {ANALYTICS_RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={selectedRange === range}
              onClick={() => setSelectedRange(range)}
            >
              {RANGE_LABELS[range]}
            </button>
          ))}
        </div>
      </header>

      <div aria-live="polite" className={styles.liveRegion}>
        {model.state === "loading" ? (
          <div className={styles.state} role="status">
            Analytics verileri yükleniyor.
          </div>
        ) : null}
        {model.state === "disabled" ? (
          <div className={styles.integrationStatus}>
            <span className={styles.statusIcon} aria-hidden="true" />
            <div>
              <h3>Analytics bağlı değil</h3>
              <p>Mağaza için etkin bir Umami bağlantısı bulunmuyor.</p>
            </div>
          </div>
        ) : null}
        {model.state === "empty" ? (
          <div className={styles.state}>
            <h2>Henüz veri yok</h2>
            <p>Seçili dönemde doğrulanmış analytics kaydı bulunmuyor.</p>
          </div>
        ) : null}
        {model.state === "error" ? (
          <div className={styles.error} role="alert">
            <div>
              <h2>Analytics yüklenemedi</h2>
              <p>
                Diğer panel verileri etkilenmedi. Güvenle yeniden
                deneyebilirsiniz.
              </p>
            </div>
            <button type="button" onClick={() => void load(selectedRange)}>
              Tekrar dene
            </button>
          </div>
        ) : null}

        {model.state === "loaded" && model.summary ? (
          <>
            <section className={styles.metrics} aria-label="Analytics özeti">
              <article>
                <span>Sayfa görüntüleme</span>
                <strong>
                  {model.summary.pageviews.toLocaleString("tr-TR")}
                </strong>
              </article>
              <article>
                <span>Ziyaretçi</span>
                <strong>
                  {model.summary.visitors.toLocaleString("tr-TR")}
                </strong>
              </article>
              <article>
                <span>Ziyaret</span>
                <strong>{model.summary.visits.toLocaleString("tr-TR")}</strong>
              </article>
              <article>
                <span>Aktif ziyaretçi</span>
                <strong>
                  {model.summary.activeVisitors.toLocaleString("tr-TR")}
                </strong>
              </article>
            </section>
            <section
              className={styles.chart}
              aria-labelledby="analytics-series-title"
            >
              <header>
                <div>
                  <h2 id="analytics-series-title">Zaman serisi</h2>
                  <p>
                    Umami · {RANGE_LABELS[model.summary.range]} ·{" "}
                    {new Date(model.summary.asOf).toLocaleString("tr-TR")}
                  </p>
                </div>
              </header>
              <div className={styles.chartViewport}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={model.summary.pageviewsSeries}
                    accessibilityLayer
                    margin={{ left: 4, right: 16, top: 8, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#E8ECF2" vertical={false} />
                    <XAxis dataKey="at" axisLine={false} tickLine={false} />
                    <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                    <Tooltip
                      formatter={(value) => [
                        String(value),
                        "Sayfa görüntüleme",
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#FE6100"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section
              className={styles.breakdown}
              aria-labelledby="analytics-breakdown-title"
            >
              <header className={styles.breakdownHeader}>
                <h2 id="analytics-breakdown-title">Dağılımlar</h2>
                <div
                  className={styles.metricTabs}
                  role="tablist"
                  aria-label="Analytics metrik türü"
                >
                  {ANALYTICS_METRIC_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="tab"
                      aria-selected={selectedMetric === type}
                      onClick={() => setSelectedMetric(type)}
                    >
                      {METRIC_LABELS[type]}
                    </button>
                  ))}
                </div>
              </header>
              {selectedResult ? (
                <div className={styles.tableViewport}>
                  <table>
                    <caption>{METRIC_LABELS[selectedMetric]}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Değer</th>
                        <th scope="col">Toplam</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedResult.items.map((item) => (
                        <tr key={item.label}>
                          <th scope="row">{item.label}</th>
                          <td>{item.value.toLocaleString("tr-TR")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.metricError} role="status">
                  Bu metrik şu anda kullanılamıyor.
                </p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </section>
  );
}
