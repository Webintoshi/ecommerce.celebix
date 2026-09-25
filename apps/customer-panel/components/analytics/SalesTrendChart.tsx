import { useId, type ReactNode } from "react";

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
}>;

const WIDTH = 640;
const TOP = 16;
const BOTTOM = 184;
const LEFT = 12;
const RIGHT = 628;

function money(minor: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

function coordinate(index: number, count: number) {
  return count === 1
    ? (LEFT + RIGHT) / 2
    : LEFT + (index * (RIGHT - LEFT)) / (count - 1);
}

function line(values: readonly number[], ceiling: number) {
  return values
    .map((value, index) => {
      const x = coordinate(index, values.length);
      const y = BOTTOM - (value / ceiling) * (BOTTOM - TOP);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function SalesTrendChart({ points, currency, totalMinor, emptyAction }: Props) {
  const gradientId = useId().replace(/:/g, "");
  const total = money(totalMinor, currency);
  const current = points.map((point) => point.value);
  const hasSales = points.some((point) => point.value > 0 || point.orders > 0);
  const ceiling = Math.max(1, ...current);
  const currentPath = line(current, ceiling);
  const areaPath = `${currentPath} L${coordinate(points.length - 1, points.length).toFixed(2)} ${BOTTOM} L${coordinate(0, points.length).toFixed(2)} ${BOTTOM} Z`;
  const last = points.at(-1);
  const lastY = last ? BOTTOM - (last.value / ceiling) * (BOTTOM - TOP) : BOTTOM;
  const axisIndexes = points.length < 5
    ? points.map((_, index) => index)
    : [0, Math.floor((points.length - 1) / 4), Math.floor((points.length - 1) / 2), Math.floor((3 * (points.length - 1)) / 4), points.length - 1];
  const axis = [...new Set(axisIndexes)].map((index) => points[index]!.label);

  return (
    <section className={styles.panel} aria-label="Satış ritmi">
      <div className={styles.heading}>
        <h2>Satış ritmi</h2>
        <span className={styles.unit}>Günlük</span>
      </div>
      <strong className={styles.total}>{total}</strong>
      {hasSales ? (
        <>
          <svg
            className={styles.chart}
            viewBox={`0 0 ${WIDTH} 210`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Seçili dönemde toplam satış ${total}. ${points.length} günlük veri noktası.`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#536c75" stopOpacity="0.14" />
                <stop offset="100%" stopColor="#536c75" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[TOP, (TOP + BOTTOM) / 3, TOP + (2 * (BOTTOM - TOP)) / 3, BOTTOM].map((y) => (
              <line key={y} x1={LEFT} x2={RIGHT} y1={y} y2={y} className={styles.gridline} />
            ))}
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={currentPath} className={styles.current} />
            <circle
              cx={coordinate(points.length - 1, points.length)}
              cy={lastY}
              r="5"
              className={styles.endpoint}
            >
              <title>{last ? `${last.label}: ${money(last.value, currency)}` : total}</title>
            </circle>
          </svg>
          <div className={styles.axis} aria-hidden="true">
            {axis.map((label, index) => <span key={`${label}:${index}`}>{label}</span>)}
          </div>
          <details className={styles.dataDisclosure}>
            <summary>Günlük veriler</summary>
            <div className={styles.dataTableWrap}>
              <table aria-label="Günlük satış ve sipariş sayıları">
                <thead><tr><th>Tarih</th><th>Satış</th><th>Sipariş</th></tr></thead>
                <tbody>{points.map((point, index) => <tr key={`${point.label}:${index}`}>
                  <th scope="row">{point.label}</th>
                  <td>{money(point.value, currency)}</td>
                  <td>{point.orders.toLocaleString("tr-TR")}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className={styles.empty} role="status">
          <svg className={styles.emptyIllustration} viewBox="0 0 102 76" aria-hidden="true">
            <rect x="23" y="10" width="63" height="55" rx="8" fill="#e8eeee" transform="rotate(5 23 10)" />
            <rect x="17" y="7" width="63" height="55" rx="8" fill="#fff" stroke="#bdc7c8" strokeWidth="2" transform="rotate(-5 17 7)" />
            <path d="M27 49V30m0 19h42" fill="none" stroke="#c8d2d1" strokeWidth="3" strokeLinecap="round" />
            <path d="m38 41 9-8 8 5 12-16" fill="none" stroke="#e96522" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="m88 5 1.5 4.5L94 11l-4.5 1.5L88 17l-1.5-4.5L82 11l4.5-1.5L88 5Z" fill="#e96522" />
          </svg>
          <strong>{totalMinor > 0 ? "Trend verisi yok" : "Bu dönemde satış yok"}</strong>
          {emptyAction ? <div className={styles.emptyAction}>{emptyAction}</div> : null}
        </div>
      )}
    </section>
  );
}
