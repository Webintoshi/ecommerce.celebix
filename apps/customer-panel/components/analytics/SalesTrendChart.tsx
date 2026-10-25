"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

import { analyticsMoney as money } from "@/lib/analytics-ui/formatters";

import styles from "./sales-trend-chart.module.css";

export type SalesTrendPoint = Readonly<{
  label: string;
  value: number;
  orders: number;
}>;

type Props = Readonly<{
  points: readonly SalesTrendPoint[];
  currency: string;
  totalMinor: number;
  emptyAction?: ReactNode;
  comparisonPoints?: readonly SalesTrendPoint[];
}>;

const WIDTH = 640;
const TOP = 16;
const BOTTOM = 184;
const LEFT = 12;
const RIGHT = 628;
const HEIGHT = 210;

function coordinate(index: number, count: number) {
  return count === 1
    ? (LEFT + RIGHT) / 2
    : LEFT + (index * (RIGHT - LEFT)) / (count - 1);
}

function line(values: readonly number[], ceiling: number, domainCount = values.length) {
  return values
    .map((value, index) => {
      const x = coordinate(index, domainCount);
      const y = BOTTOM - (value / ceiling) * (BOTTOM - TOP);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function SalesTrendChart({ points, currency, totalMinor, emptyAction, comparisonPoints }: Props) {
  const chartId = useId().replace(/:/g, "");
  const gradientId = `${chartId}gradient`;
  const tooltipId = `${chartId}tooltip`;
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const total = money(totalMinor, currency);
  const geometry = useMemo(() => {
    const current = points.map((point) => point.value);
    const previous = comparisonPoints?.map((point) => point.value) ?? [];
    const ceiling = Math.max(1, ...current, ...previous);
    const domainCount = Math.max(1, points.length, comparisonPoints?.length ?? 0);
    const currentPath = line(current, ceiling, domainCount);
    const areaPath = `${currentPath} L${coordinate(points.length - 1, domainCount).toFixed(2)} ${BOTTOM} L${coordinate(0, domainCount).toFixed(2)} ${BOTTOM} Z`;
    const axisPoints = points.length ? points : comparisonPoints ?? [];
    const axisIndexes = axisPoints.length < 5
      ? axisPoints.map((_, index) => index)
      : [0, Math.floor((axisPoints.length - 1) / 4), Math.floor((axisPoints.length - 1) / 2), Math.floor((3 * (axisPoints.length - 1)) / 4), axisPoints.length - 1];
    return {
      ceiling,
      domainCount,
      currentPath,
      areaPath,
      previousPath: line(previous, ceiling, domainCount),
      hasSales: points.some((point) => point.value > 0 || point.orders > 0) || Boolean(comparisonPoints?.some((point) => point.value > 0 || point.orders > 0)),
      axis: [...new Set(axisIndexes)].map((index) => ({ label: axisPoints[index]!.label, index })),
      ticks: [1, 2 / 3, 1 / 3, 0].map((fraction) => ({
        value: ceiling * fraction,
        y: BOTTOM - fraction * (BOTTOM - TOP),
      })),
    };
  }, [points, comparisonPoints]);
  const { ceiling, domainCount, currentPath, areaPath, previousPath, hasSales, axis, ticks } = geometry;
  const last = points.at(-1);
  const lastY = last ? BOTTOM - (last.value / ceiling) * (BOTTOM - TOP) : BOTTOM;
  const selectedIndex = activeIndex === null ? null : Math.min(activeIndex, domainCount - 1);
  const selectedCurrent = selectedIndex === null ? undefined : points[selectedIndex];
  const selectedPrevious = selectedIndex === null ? undefined : comparisonPoints?.[selectedIndex];
  const selectedX = selectedIndex === null ? 0 : coordinate(selectedIndex, domainCount);
  const pointY = (value: number) => BOTTOM - (value / ceiling) * (BOTTOM - TOP);

  function inspectPointer(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0) return;
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const index = domainCount === 1 ? 0 : Math.round(((x - LEFT) / (RIGHT - LEFT)) * (domainCount - 1));
    setActiveIndex(Math.max(0, Math.min(domainCount - 1, index)));
  }

  function inspectKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Escape") setActiveIndex(null);
    else if (event.key === "Home") setActiveIndex(0);
    else if (event.key === "End") setActiveIndex(domainCount - 1);
    else setActiveIndex((index) => Math.max(0, Math.min(domainCount - 1, (index ?? 0) + (event.key === "ArrowRight" ? 1 : -1))));
  }

  // Hover changes only the cursor and tooltip; the full daily tables retain their DOM.
  const dailyData = useMemo(() => (
    <details className={styles.dataDisclosure}>
      <summary>Günlük veriler <span className={styles.footerTotal}>Toplam <strong>{money(totalMinor, currency)}</strong></span></summary>
      <div className={styles.dataTableWrap}>
        <table aria-label="Günlük satış ve sipariş sayıları">
          <thead><tr><th>Tarih</th><th>Satış</th><th>Sipariş</th></tr></thead>
          <tbody>{points.map((point, index) => <tr key={`${point.label}:${index}`}>
            <th scope="row">{point.label}</th>
            <td>{money(point.value, currency)}</td>
            <td>{point.orders.toLocaleString("tr-TR")}</td>
          </tr>)}</tbody>
        </table>
        {comparisonPoints ? <table aria-label="Önceki dönemin günlük satış ve sipariş sayıları">
          <caption>Önceki dönem · başlangıç gününe göre kıyas</caption>
          <thead><tr><th>Tarih</th><th>Satış</th><th>Sipariş</th></tr></thead>
          <tbody>{comparisonPoints.map((point, index) => <tr key={`${point.label}:${index}`}><th scope="row">{point.label}</th><td>{money(point.value, currency)}</td><td>{point.orders.toLocaleString("tr-TR")}</td></tr>)}</tbody>
        </table> : null}
      </div>
    </details>
  ), [points, comparisonPoints, currency, totalMinor]);

  return (
    <section className={styles.panel} aria-label="Satış ritmi">
      <div className={styles.heading}>
        <div><h2>Satış performansı</h2><p className={styles.subtitle}>Ödenen siparişlerden elde edilen gelir</p></div>
        <span className={styles.unit}>{currency}</span>
      </div>
      {hasSales ? (
        <>
          <div className={styles.legend}><span className={styles.legendCurrent}>Bu dönem</span>{comparisonPoints ? <span className={styles.legendPrior}>Önceki dönem</span> : null}</div>
          <div className={styles.chartBody}>
            <div className={styles.yAxis} aria-hidden="true">{ticks.map((tick) => <span key={tick.y} style={{ top: `${tick.y / HEIGHT * 100}%` }}>{money(tick.value, currency)}</span>)}</div>
            <div className={styles.plotColumn}>
              <div
                className={styles.plot}
                tabIndex={0}
                role="group"
                aria-label="Günlük satış grafiği. Günler arasında ok tuşlarıyla geçin."
                aria-describedby={selectedIndex === null ? undefined : tooltipId}
                onPointerMove={inspectPointer}
                onPointerLeave={() => setActiveIndex(null)}
                onPointerCancel={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(0)}
                onBlur={() => setActiveIndex(null)}
                onKeyDown={inspectKey}
              >
                <svg
                  className={styles.chart}
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Seçili dönemde toplam satış ${total}. ${points.length} günlük veri noktası.${comparisonPoints ? " Önceki dönem kesikli çizgiyle gösterilir." : ""}`}
                >
                  <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--cp-brand, #FE6100)" stopOpacity="0.10" />
                      <stop offset="100%" stopColor="var(--cp-brand, #FE6100)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {ticks.map(({ y }) => (
                    <line key={y} x1={LEFT} x2={RIGHT} y1={y} y2={y} className={styles.gridline} />
                  ))}
                  {points.length ? <path d={areaPath} fill={`url(#${gradientId})`} /> : null}
                  {comparisonPoints?.length ? <path d={previousPath} className={styles.prior} /> : null}
                  {points.length ? <path d={currentPath} className={styles.current} /> : null}
                  {last ? <circle
                    cx={coordinate(points.length - 1, domainCount)}
                    cy={lastY}
                    r="3"
                    className={styles.endpoint}
                  >
                    <title>{last ? `${last.label}: ${money(last.value, currency)}` : total}</title>
                  </circle> : null}
                  {selectedIndex !== null ? <>
                    <line x1={selectedX} x2={selectedX} y1={TOP} y2={BOTTOM} className={styles.cursor} />
                    {selectedPrevious ? <circle cx={selectedX} cy={pointY(selectedPrevious.value)} r="4" className={styles.priorPoint} /> : null}
                    {selectedCurrent ? <circle cx={selectedX} cy={pointY(selectedCurrent.value)} r="4" className={styles.activePoint} /> : null}
                  </> : null}
                </svg>
                {selectedIndex !== null ? <div className={styles.tooltip} id={tooltipId} role="tooltip" style={{ left: `clamp(8px, calc(${selectedX / WIDTH * 100}% + 12px), calc(100% - 212px))` }}>
                  <div><span className={styles.tooltipLabel}><i className={styles.tooltipCurrent} aria-hidden="true" />Bu dönem<small>{selectedCurrent?.label ?? "Veri yok"}</small></span><span className={styles.tooltipValue}><strong>{selectedCurrent ? money(selectedCurrent.value, currency) : "—"}</strong>{selectedCurrent ? <small>{selectedCurrent.orders.toLocaleString("tr-TR")} sipariş</small> : null}</span></div>
                  {comparisonPoints ? <div><span className={styles.tooltipLabel}><i className={styles.tooltipPrior} aria-hidden="true" />Önceki dönem<small>{selectedPrevious?.label ?? "Veri yok"}</small></span><span className={styles.tooltipValue}><strong>{selectedPrevious ? money(selectedPrevious.value, currency) : "—"}</strong>{selectedPrevious ? <small>{selectedPrevious.orders.toLocaleString("tr-TR")} sipariş</small> : null}</span></div> : null}
                </div> : null}
              </div>
              <div className={styles.axis} aria-hidden="true">
                {axis.map(({ label, index }, labelIndex) => <span key={`${label}:${index}`} style={{ left: `${coordinate(index, domainCount) / WIDTH * 100}%`, transform: labelIndex === 0 ? "none" : labelIndex === axis.length - 1 ? "translateX(-100%)" : "translateX(-50%)" }}>{label}</span>)}
              </div>
            </div>
          </div>
          {dailyData}
        </>
      ) : (
        <div className={styles.empty} role="status">
          <svg className={styles.emptyIllustration} viewBox="0 0 102 76" aria-hidden="true">
            <rect x="23" y="10" width="63" height="55" rx="8" className={styles.illustrationBack} transform="rotate(5 23 10)" />
            <rect x="17" y="7" width="63" height="55" rx="8" className={styles.illustrationPaper} strokeWidth="2" transform="rotate(-5 17 7)" />
            <path d="M27 49V30m0 19h42" className={styles.illustrationLine} strokeWidth="3" strokeLinecap="round" />
            <path d="m38 41 9-8 8 5 12-16" className={styles.illustrationAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m88 5 1.5 4.5L94 11l-4.5 1.5L88 17l-1.5-4.5L82 11l4.5-1.5L88 5Z" className={styles.illustrationAccent} />
          </svg>
          <strong>{totalMinor > 0 ? "Trend verisi yok" : "Bu dönemde satış yok"}</strong>
          {emptyAction ? <div className={styles.emptyAction}>{emptyAction}</div> : null}
          <span className={styles.emptyTotal}>Toplam {total}</span>
        </div>
      )}
    </section>
  );
}
