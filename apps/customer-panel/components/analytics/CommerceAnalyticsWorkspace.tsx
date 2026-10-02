"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, ChevronDown, CircleAlert, GitCompareArrows, Route, SlidersHorizontal } from "lucide-react";
import {
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { PanelPageShell } from "@/components/panel/PanelPageShell";
import { PanelTopbarBridge } from "@/components/panel/PanelTopbarChrome";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import {
  dailySalesPointsForCurrency,
  FUNNEL_STEPS,
  largestFunnelDrop,
  previousAnalyticsRange,
} from "@/lib/analytics-ui/commerce-insights";
import { analyticsProductMetricCount, analyticsTrafficEvents, analyticsTrafficMetric, analyticsTrafficSources } from "@/lib/analytics-ui/traffic";
import { analyticsQueryHref, analyticsRequestQuery, analyticsTabHref, analyticsCommerceTrends, analyticsFunnelStages } from "@/lib/analytics-ui/workspace";
import { ActiveVisitorsCard } from "./ActiveVisitorsCard";
import { SalesTrendChart } from "./SalesTrendChart";
import styles from "./commerce-analytics-workspace.module.css";

const TABS = [
  ["overview", "Genel bakış"],
  ["funnel", "Dönüşüm"],
  ["carts", "Sepetler"],
  ["acquisition", "Kaynaklar"],
  ["products", "Ürünler"],
] as const;
const ROUTES = Object.freeze({
  overview: "/api/analytics/overview",
  funnel: "/api/analytics/funnel",
  carts: "/api/analytics/abandoned-carts",
  acquisition: "/api/analytics/acquisition",
  products: "/api/analytics/products",
});
const FILTER_FIELDS = [
  "device", "source", "campaign", "product", "category", "brand",
  "currency", "touch", "search", "lifecycle", "contact", "minValue", "maxValue",
] as const;
type Tab = keyof typeof ROUTES;
type Range = "today" | "7d" | "30d" | "90d" | "custom";
type Currency = Readonly<{
  currency: string;
  activeCarts: number;
  candidateCarts: number;
  eligibleCarts: number;
  checkoutStarts: number;
  eligibleCheckoutStarts: number;
  checkoutAbandoned: number;
  paymentFailures: number;
  paidOrders: number;
  grossRevenueMinor: number;
  refundedMinor: number;
  abandonedCarts: number;
  abandonedValueMinor: number;
  recoveredCarts: number;
  recoveredGrossMinor: number;
  recoveredRefundedMinor: number;
  recoveredNetMinor: number;
}>;
type Attribution = Readonly<{
  touch: "first" | "last";
  source: string;
  medium: string;
  campaign: string | null;
  currency: string;
  paidOrders: number;
  grossRevenueMinor: number;
  abandonedCarts: number;
  recoveredRevenueMinor: number;
}>;
type Product = Readonly<{
  productId: string;
  title: string;
  imageUrl?: string | null;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  checkoutStarts: number;
  paidOrders: number;
  quantity: number;
  revenueMinor: number;
  abandonedAppearances: number;
  recoveredRevenueMinor: number;
}>;
type Point = Readonly<{
  startsAt: string;
  currency: string;
  paidOrders: number;
  grossRevenueMinor: number;
  abandonedCarts: number;
  recoveredCarts: number;
}>;
type Cart = Readonly<{
  id: string;
  customerLabel: string;
  productSummary: string;
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
  currency: string;
  lastActivityAt: string;
  abandonedAt: string | null;
  source: string;
  campaign: string | null;
  device: "desktop" | "mobile" | "tablet" | "unknown";
  lifecycle: string;
  contactable: boolean;
  contacted: boolean;
}>;
type Snapshot = Readonly<{
  rangeStart?: string;
  rangeEnd?: string;
  currencies: readonly Currency[];
  attribution: readonly Attribution[];
  products: readonly Product[];
  productPage: Readonly<{
    page: number;
    pageSize: 100;
    totalItems: number;
    totalPages: number;
  }>;
  cartPage: Readonly<{
    page: number;
    pageSize: 100;
    totalItems: number;
    totalPages: number;
  }>;
  series: readonly Point[];
  carts: readonly Cart[];
  worker: Readonly<{
    pending: number;
    claimed: number;
    retry: number;
    deadLetter: number;
    oldestPendingSeconds: number;
    lastSuccessfulDelivery: string | null;
    deliveryLatencyMilliseconds: number;
  }>;
}>;
type Payload = Readonly<{
  status: "complete" | "degraded";
  message: string | null;
  traffic: unknown;
  comparisonTraffic: unknown;
  commerce: Snapshot;
  comparisonCommerce: Snapshot | null;
  range: Readonly<{
    start: string;
    end: string;
    timezone: string;
    label: string;
  }>;
}>;
type OverviewDetails = Readonly<{
  key: string; funnel?: Payload; products?: Payload;
  funnelState: "loading" | "ready" | "error"; productsState: "loading" | "ready" | "error";
}>;

function integer(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : -1;
}
function text(value: unknown, maximum = 240) {
  return typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum
    ? value
    : "";
}
function code(value: unknown) {
  return typeof value === "string" && /^[A-Z]{3}$/.test(value) ? value : "";
}
function instant(value: unknown) {
  return Boolean(text(value, 40)) && Number.isFinite(Date.parse(String(value)));
}
function snapshot(value: unknown): Snapshot {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_response");
  const root = value as Record<string, unknown>,
    worker = root.worker as Record<string, unknown>,
    rawProductPage = root.productPage as Record<string, unknown>,
    rawCartPage = root.cartPage as Record<string, unknown>;
  if (
    !Array.isArray(root.currencies) ||
    !Array.isArray(root.attribution) ||
    !Array.isArray(root.products) ||
    !Array.isArray(root.series) ||
    !Array.isArray(root.carts) ||
    !worker ||
    !rawProductPage ||
    !rawCartPage
  )
    throw Error("invalid_response");
  const nums = (row: Record<string, unknown>, keys: readonly string[]) => {
    for (const key of keys)
      if (integer(row[key]) < 0) throw Error("invalid_response");
  };
  const currencies = root.currencies.map((entry) => {
    const row = entry as Record<string, unknown>;
    nums(row, [
      "activeCarts",
      "candidateCarts",
      "eligibleCarts",
      "checkoutStarts",
      "eligibleCheckoutStarts",
      "checkoutAbandoned",
      "paymentFailures",
      "paidOrders",
      "grossRevenueMinor",
      "refundedMinor",
      "abandonedCarts",
      "abandonedValueMinor",
      "recoveredCarts",
      "recoveredGrossMinor",
      "recoveredRefundedMinor",
      "recoveredNetMinor",
    ]);
    if (!code(row.currency)) throw Error("invalid_response");
    return Object.freeze(row) as unknown as Currency;
  });
  const attribution = root.attribution.map((entry) => {
    const row = entry as Record<string, unknown>;
    nums(row, [
      "paidOrders",
      "grossRevenueMinor",
      "abandonedCarts",
      "recoveredRevenueMinor",
    ]);
    if (
      !["first", "last"].includes(String(row.touch)) ||
      !text(row.source, 128) ||
      !text(row.medium, 128) ||
      !code(row.currency)
    )
      throw Error("invalid_response");
    return Object.freeze(row) as unknown as Attribution;
  });
  const products = root.products.map((entry) => {
    const row = entry as Record<string, unknown>;
    nums(row, [
      "checkoutStarts",
      "paidOrders",
      "quantity",
      "revenueMinor",
      "abandonedAppearances",
      "recoveredRevenueMinor",
    ]);
    if (
      !/^[0-9a-f-]{36}$/.test(String(row.productId)) ||
      !text(row.title, 200) ||
      !code(row.currency)
    )
      throw Error("invalid_response");
    return Object.freeze(row) as unknown as Product;
  });
  const productPage = {
    page: integer(rawProductPage.page),
    pageSize: integer(rawProductPage.pageSize),
    totalItems: integer(rawProductPage.totalItems),
    totalPages: integer(rawProductPage.totalPages),
  };
  if (
    productPage.page < 1 ||
    productPage.pageSize !== 100 ||
    productPage.totalPages !== Math.ceil(productPage.totalItems / 100) ||
    products.length > 100
  )
    throw Error("invalid_response");
  const cartPage = {
    page: integer(rawCartPage.page),
    pageSize: integer(rawCartPage.pageSize),
    totalItems: integer(rawCartPage.totalItems),
    totalPages: integer(rawCartPage.totalPages),
  };
  if (
    cartPage.page < 1 ||
    cartPage.pageSize !== 100 ||
    cartPage.totalPages !== Math.ceil(cartPage.totalItems / 100) ||
    root.carts.length > 100
  )
    throw Error("invalid_response");
  const series = root.series.map((entry) => {
    const row = entry as Record<string, unknown>;
    nums(row, [
      "paidOrders",
      "grossRevenueMinor",
      "abandonedCarts",
      "recoveredCarts",
    ]);
    if (!instant(row.startsAt) || !code(row.currency))
      throw Error("invalid_response");
    return Object.freeze(row) as unknown as Point;
  });
  const carts = root.carts.map((entry) => {
    const row = entry as Record<string, unknown>;
    nums(row, [
      "subtotalMinor",
      "discountMinor",
      "shippingMinor",
      "totalMinor",
    ]);
    if (
      !/^[0-9a-f-]{36}$/.test(String(row.id)) ||
      !text(row.customerLabel, 200) ||
      !text(row.productSummary) ||
      !code(row.currency) ||
      !instant(row.lastActivityAt) ||
      (row.abandonedAt !== null && !instant(row.abandonedAt)) ||
      typeof row.contactable !== "boolean" ||
      typeof row.contacted !== "boolean"
    )
      throw Error("invalid_response");
    return Object.freeze(row) as unknown as Cart;
  });
  const status = {
    pending: integer(worker.pending),
    claimed: integer(worker.claimed),
    retry: integer(worker.retry),
    deadLetter: integer(worker.deadLetter),
    oldestPendingSeconds: integer(worker.oldestPendingSeconds),
    lastSuccessfulDelivery:
      typeof worker.lastSuccessfulDelivery === "string"
        ? worker.lastSuccessfulDelivery
        : null,
    deliveryLatencyMilliseconds: integer(worker.deliveryLatencyMilliseconds),
  };
  if (
    (status.lastSuccessfulDelivery !== null && !instant(status.lastSuccessfulDelivery)) ||
    Object.values(status).some(
      (field) => typeof field === "number" && field < 0,
    )
  )
    throw Error("invalid_response");
  return Object.freeze({
    ...(text(root.rangeStart, 40) && text(root.rangeEnd, 40)
      ? { rangeStart: String(root.rangeStart), rangeEnd: String(root.rangeEnd) } : {}),
    currencies: Object.freeze(currencies),
    attribution: Object.freeze(attribution),
    products: Object.freeze(products),
    productPage: Object.freeze(productPage) as Snapshot["productPage"],
    series: Object.freeze(series),
    carts: Object.freeze(carts),
    cartPage: Object.freeze(cartPage) as Snapshot["cartPage"],
    worker: Object.freeze(status),
  });
}
function parse(value: unknown): Payload {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("invalid_response");
  const root = value as Record<string, unknown>;
  if (root.status !== "complete" && root.status !== "degraded")
    throw Error("invalid_response");
  const rawRange = root.range as Record<string, unknown>;
  if (
    !rawRange ||
    !instant(rawRange.start) ||
    !instant(rawRange.end) ||
    Date.parse(String(rawRange.start)) >= Date.parse(String(rawRange.end)) ||
    !text(rawRange.timezone, 64) ||
    !text(rawRange.label, 32)
  )
    throw Error("invalid_response");
  try {
    new Intl.DateTimeFormat("en", { timeZone: String(rawRange.timezone) });
  } catch {
    throw Error("invalid_response");
  }
  return Object.freeze({
    status: root.status,
    message: typeof root.message === "string" ? root.message : null,
    traffic: root.traffic,
    comparisonTraffic: root.comparisonTraffic,
    commerce: snapshot(root.commerce),
    comparisonCommerce: root.comparisonCommerce
      ? snapshot(root.comparisonCommerce)
      : null,
    range: Object.freeze({
      start: String(rawRange.start),
      end: String(rawRange.end),
      timezone: String(rawRange.timezone),
      label: String(rawRange.label),
    }),
  });
}
function money(value: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
function percent(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("tr-TR", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
}
function date(value: string, timezone: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
function trafficSummary(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>,
    raw = (
      root.summary && typeof root.summary === "object" ? root.summary : root
    ) as Record<string, unknown>,
    visitors = integer(raw.visitors),
    pageviews = integer(raw.pageviews),
    visits = integer(raw.visits),
    bounceRateBasisPoints = integer(raw.bounceRateBasisPoints),
    averageVisitSeconds = integer(raw.averageVisitSeconds);
  if (
    visitors < 0 || pageviews < 0 || visits < 0 ||
    bounceRateBasisPoints < 0 || bounceRateBasisPoints > 10_000 ||
    averageVisitSeconds < 0
  ) return null;
  const series = (
    Array.isArray(raw.visitsSeries) ? raw.visitsSeries : []
  ).flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    return text(row?.at, 40) && integer(row?.value) >= 0
      ? [{ at: String(row.at), value: integer(row.value) }]
      : [];
  });
  return { visitors, pageviews, visits, bounceRateBasisPoints, averageVisitSeconds, series };
}
type AcquisitionTraffic = Readonly<{
  source: string;
  medium: string;
  campaign: string | null;
  visitors: number;
  pageviews: number;
  productViews: number;
  addsToCart: number;
  checkouts: number;
}>;
function acquisitionRows(value: unknown): readonly AcquisitionTraffic[] {
  if (!value || typeof value !== "object") return [];
  const breakdown = (value as Record<string, unknown>).breakdown;
  if (
    !breakdown ||
    typeof breakdown !== "object" ||
    !Array.isArray((breakdown as Record<string, unknown>).items)
  )
    return [];
  return Object.freeze(
    ((breakdown as Record<string, unknown>).items as unknown[]).flatMap(
      (entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
          return [];
        const row = entry as Record<string, unknown>,
          source = text(row.source, 128),
          medium = text(row.medium, 128),
          campaign = row.campaign === null ? null : text(row.campaign, 128),
          visitors = integer(row.visitors),
          pageviews = integer(row.pageviews),
          productViews = integer(row.productViews),
          addsToCart = integer(row.addsToCart),
          checkouts = integer(row.checkouts);
        return source &&
          medium &&
          (row.campaign === null || Boolean(campaign)) &&
          [visitors, pageviews, productViews, addsToCart, checkouts].every(
            (value) => value >= 0,
          )
          ? [
              {
                source: String(row.source),
                medium: String(row.medium),
                campaign: campaign === null ? null : String(row.campaign),
                visitors,
                pageviews,
                productViews,
                addsToCart,
                checkouts,
              },
            ]
          : [];
      },
    ),
  );
}
function total(rows: readonly Currency[], key: keyof Currency) {
  return rows.reduce(
    (sum, row) => sum + (typeof row[key] === "number" ? Number(row[key]) : 0),
    0,
  );
}
function delta(current: number | null, previous: number | null) {
  return current === null || previous === null || previous === 0
    ? "—"
    : percent((current - previous) / previous);
}

function MetricTile({
  label,
  value,
  note,
  trend,
}: Readonly<{
  label: string;
  value: ReactNode;
  note?: string;
  trend?: "up" | "down";
}>) {
  return (
    <div className={styles.metricTile}>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
      {note ? (
        <small className={trend === "up" ? styles.positive : trend === "down" ? styles.negative : styles.metricNote}>
          {note}
        </small>
      ) : null}
    </div>
  );
}

function EmptyIllustration() {
  return (
    <svg className={styles.emptyIllustration} viewBox="0 0 104 78" fill="none" aria-hidden="true">
      <rect x="20" y="9" width="64" height="58" rx="8" className={styles.illustrationBack} />
      <rect x="13" y="5" width="64" height="58" rx="8" className={styles.illustrationPaper} strokeWidth="2" transform="rotate(-4 13 5)" />
      <path d="M28 45V26M28 45H63" className={styles.illustrationLine} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M34 40L43 34L50 37L62 23" className={styles.illustrationAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="83" cy="15" r="3" className={styles.illustrationAccent} />
    </svg>
  );
}

function InsightIllustration({ kind }: Readonly<{ kind: "funnel" | "cart" }>) {
  return (
    <svg className={styles.insightArtwork} viewBox="0 0 180 140" width={160} height={160} fill="none" aria-hidden="true" focusable="false">
      <ellipse cx="88" cy="121" rx="65" ry="9" className={styles.insightBackdrop} />
      {kind === "funnel" ? (
        <>
          <rect x="35" y="20" width="104" height="99" rx="10" transform="rotate(4 35 20)" className={styles.insightBackdrop} />
          <rect x="28" y="14" width="104" height="99" rx="10" transform="rotate(-4 28 14)" className={styles.insightPaper} strokeWidth="2.5" />
          <path d="M49 39h64L99 59H63L49 39ZM65 66h32l-7 13H72l-7-13Z" className={styles.insightPaper} strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M77 86h9v13l-9 5V86Z" className={styles.insightAccent} strokeWidth="3" strokeLinejoin="round" />
          <path d="M143 23l4-11m3 22 10-6m-8 18h12" className={styles.insightAccent} strokeWidth="3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M30 44h13l14 57h68" className={styles.insightOutline} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M46 56h83l-10 33H54l-8-33Z" className={styles.insightPaper} strokeWidth="3" strokeLinejoin="round" />
          <path d="M70 61V49c0-11 6-17 15-17s15 6 15 17v12" className={styles.insightOutline} strokeWidth="3" strokeLinecap="round" />
          <circle cx="66" cy="115" r="6" className={styles.insightPaper} strokeWidth="3" />
          <circle cx="114" cy="115" r="6" className={styles.insightPaper} strokeWidth="3" />
          <path d="M127 22c14-3 23 6 23 16 0 9-7 16-16 16m-7-32 2-10m-2 10 11 3" className={styles.insightAccent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

function DetailBars({
  title,
  rows,
  format = (value: number) => value.toLocaleString("tr-TR"),
}: Readonly<{
  title: string;
  rows: readonly Readonly<{ label: string; value: number }>[] | null;
  format?: (value: number) => string;
}>) {
  if (rows === null) return null;
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className={styles.detailBars}>
      <h3>{title}</h3>
      {rows.length ? rows.map((row, index) => (
        <div className={styles.detailBarRow} key={`${row.label}:${index}`}>
          <span title={row.label}>{row.label}</span>
          <i aria-hidden="true"><i style={{ width: `${row.value > 0 ? Math.max(2, (row.value / max) * 100) : 0}%` }} /></i>
          <strong>{format(row.value)}</strong>
        </div>
      )) : <span className={styles.quietState}>—</span>}
    </section>
  );
}

function FunnelPanel({
  events,
  available,
  wideRangeHref,
  paidOrders,
}: Readonly<{
  events: Readonly<Record<string, number>>;
  available: boolean;
  wideRangeHref: string;
  paidOrders: number;
}>) {
  if (!available) {
    return (
      <section className={`${styles.panel} ${styles.compactState}`} aria-label="Dönüşüm yolculuğu">
        <EmptyIllustration />
        <h2>Yolculuk bekleniyor</h2>
        <p>Trafik ölçümü geldiğinde altı adım gösterilecek.</p>
      </section>
    );
  }
  const steps = FUNNEL_STEPS.map(([key, label]) => ({ key, label, value: events[key] ?? null }));
  const first = Math.max(1, ...steps.map((step) => step.value ?? 0));
  const largest = largestFunnelDrop(events);
  const stages = analyticsFunnelStages(events);
  if (steps[0]?.value === null) {
    return <section className={`${styles.panel} ${styles.compactState}`} aria-label="Dönüşüm yolculuğu"><EmptyIllustration /><h2>Bu adım ölçülemiyor</h2><p>Ürün görüntüleme ölçümü geldiğinde huni gösterilecek.</p></section>;
  }
  if (!steps.some((step) => (step.value ?? 0) > 0)) {
    return (
      <section className={`${styles.panel} ${styles.compactState}`} aria-label="Dönüşüm yolculuğu">
        <EmptyIllustration />
        <h2>Bu dönemde yolculuk yok</h2>
        <Link className={styles.outlineAction} href={wideRangeHref}>Son 90 güne bak</Link>
      </section>
    );
  }
  return (
    <section className={styles.panel} aria-label="Dönüşüm yolculuğu">
      <div className={styles.panelHeading}>
        <h2>Dönüşüm yolculuğu</h2>
        {largest ? <span className={styles.softBadge}>En büyük kayıp: {largest.to}</span> : null}
      </div>
      <ol className={styles.funnel}>
        {steps.map((step, index) => {
          const prior = index ? steps[index - 1]!.value : null;
          const progress = prior && prior > 0 && step.value !== null && step.value <= prior ? step.value / prior : null;
          return (
            <li key={step.key}>
              <span className={styles.funnelLabel}>{step.label}</span>
              <span className={styles.funnelTrack} aria-hidden="true"><span style={{ width: `${Math.min(100, ((step.value ?? 0) / first) * 100)}%` }} /></span>
              <strong>{step.value?.toLocaleString("tr-TR") ?? "—"}</strong>
              <small>{index ? `${percent(progress)} ilerledi` : "Başlangıç"}</small>
            </li>
          );
        })}
      </ol>
      {largest ? (
        <p className={styles.funnelInsight}>
          {largest.from} → {largest.to}: {largest.lost.toLocaleString("tr-TR")} kayıp ({percent(largest.rate)})
        </p>
      ) : null}
      <details className={styles.secondaryMetrics}>
        <summary>Adım oranları</summary>
        <div className={styles.tableScroll}>
          <table aria-label="Dönüşüm adım oranları">
            <thead><tr><th>Adım</th><th>Öncekinden</th><th>İlk adımdan</th><th>Kayıp</th></tr></thead>
            <tbody>{stages.map((stage) => <tr key={stage.event}>
              <td data-label="Adım" data-primary="true">{stage.label}</td>
              <td data-label="Öncekinden">{percent(stage.previousRate)}</td>
              <td data-label="İlk adımdan">{percent(stage.totalRate)}</td>
              <td data-label="Kayıp">{stage.dropoff?.toLocaleString("tr-TR") ?? "—"} · {percent(stage.dropoffRate)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className={styles.quietState}>Sipariş / ödeme başlangıcı: {percent(events.begin_checkout ? paidOrders / events.begin_checkout : null)}</p>
      </details>
    </section>
  );
}

function FilterForm({
  tab,
  params,
  currencies,
  onSubmit,
}: Readonly<{
  tab: Tab;
  params: URLSearchParams;
  currencies: readonly string[];
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}>) {
  return (
    <form
      className={styles.filterGrid}
      onSubmit={onSubmit}
      aria-label="Analitik boyut filtreleri"
    >
      <label>
        Para birimi
        <select name="currency" defaultValue={params.get("currency") ?? ""}>
          <option value="">Tümü</option>
          {params.get("currency") && !currencies.includes(params.get("currency")!) ? (
            <option value={params.get("currency")!}>{params.get("currency")}</option>
          ) : null}
          {currencies.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      {tab === "funnel" ? (
        <>
          <label>
            Cihaz
            <select name="device" defaultValue={params.get("device") ?? ""}>
              <option value="">Tümü</option>
              <option value="desktop">Masaüstü</option>
              <option value="mobile">Mobil</option>
              <option value="tablet">Tablet</option>
            </select>
          </label>
          <label>
            Kaynak
            <input
              name="source"
              defaultValue={params.get("source") ?? ""}
              maxLength={128}
            />
          </label>
          <label>
            Kampanya
            <input
              name="campaign"
              defaultValue={params.get("campaign") ?? ""}
              maxLength={128}
            />
          </label>
          <label>
            Kategori ID
            <input
              name="category"
              defaultValue={params.get("category") ?? ""}
              pattern="[0-9a-f-]{36}"
            />
          </label>
          <label>
            Ürün ID
            <input
              name="product"
              defaultValue={params.get("product") ?? ""}
              pattern="[0-9a-f-]{36}"
            />
          </label>
        </>
      ) : null}
      {tab === "carts" ? (
        <>
          <label>
            Durum
            <select
              name="lifecycle"
              defaultValue={params.get("lifecycle") ?? ""}
            >
              <option value="">Tümü</option>
              {([
                ["active", "Aktif"],
                ["candidate", "Terk adayı"],
                ["abandoned", "Terk edildi"],
                ["resumed", "Geri döndü"],
                ["converted_pending_payment", "Ödeme bekliyor"],
                ["recovered", "Geri kazanıldı"],
                ["expired", "Süresi doldu"],
              ] as const).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
          <label>
            İletişim
            <select name="contact" defaultValue={params.get("contact") ?? ""}>
              <option value="">Tümü</option>
              <option value="contactable">Kurulabilir</option>
              <option value="unavailable">Kurulamaz</option>
            </select>
          </label>
          <label>
            Min tutar (alt birim)
            <input
              name="minValue"
              defaultValue={params.get("minValue") ?? ""}
              inputMode="numeric"
              pattern="(0|[1-9][0-9]{0,14})"
            />
          </label>
          <label>
            Maks tutar (alt birim)
            <input
              name="maxValue"
              defaultValue={params.get("maxValue") ?? ""}
              inputMode="numeric"
              pattern="(0|[1-9][0-9]{0,14})"
            />
          </label>
          <label>
            Kaynak
            <input name="source" defaultValue={params.get("source") ?? ""} />
          </label>
          <label>
            Kampanya
            <input
              name="campaign"
              defaultValue={params.get("campaign") ?? ""}
            />
          </label>
          <label>
            Cihaz
            <select name="device" defaultValue={params.get("device") ?? ""}>
              <option value="">Tümü</option>
              <option value="desktop">Masaüstü</option>
              <option value="mobile">Mobil</option>
              <option value="tablet">Tablet</option>
              <option value="unknown">Bilinmiyor</option>
            </select>
          </label>
          <label>
            Ara
            <input
              name="search"
              defaultValue={params.get("search") ?? ""}
              maxLength={100}
            />
          </label>
        </>
      ) : null}
      {tab === "acquisition" ? (
        <>
          <label>
            Temas
            <select name="touch" defaultValue={params.get("touch") ?? "last"}>
              <option value="last">Son temas</option>
              <option value="first">İlk temas</option>
            </select>
          </label>
          <label>
            Kaynak
            <input name="source" defaultValue={params.get("source") ?? ""} />
          </label>
          <label>
            Kampanya
            <input
              name="campaign"
              defaultValue={params.get("campaign") ?? ""}
            />
          </label>
        </>
      ) : null}
      {tab === "products" ? (
        <>
          <label>
            Ürün ara
            <input
              name="search"
              defaultValue={params.get("search") ?? ""}
              maxLength={100}
            />
          </label>
          <label>
            Ürün ID
            <input
              name="product"
              defaultValue={params.get("product") ?? ""}
              pattern="[0-9a-f-]{36}"
            />
          </label>
          <label>
            Kategori ID
            <input
              name="category"
              defaultValue={params.get("category") ?? ""}
              pattern="[0-9a-f-]{36}"
            />
          </label>
          <label>
            Marka ID
            <input
              name="brand"
              defaultValue={params.get("brand") ?? ""}
              pattern="[0-9a-f-]{36}"
            />
          </label>
          <label>
            Trafik kaynağı
            <input name="source" defaultValue={params.get("source") ?? ""} />
          </label>
        </>
      ) : null}
      <button type="submit">Uygula</button>
    </form>
  );
}

function isolateFilterSheet(panel: HTMLElement) {
  const previous: Array<{ element: HTMLElement; inert: boolean }> = [];
  let branch: HTMLElement | null = panel;
  while (branch?.parentElement) {
    for (const sibling of Array.from(branch.parentElement.children)) {
      // Keep the native details summary exposed; the sheet focus guard excludes it.
      if (sibling === branch || !(sibling instanceof HTMLElement) || sibling.tagName === "SUMMARY") continue;
      previous.push({ element: sibling, inert: sibling.inert });
      sibling.inert = true;
    }
    branch = branch.parentElement;
    if (branch === document.body) break;
  }
  const overflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    for (const item of previous) item.element.inert = item.inert;
    document.body.style.overflow = overflow;
  };
}

function filterFocusTargets(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), a[href], [tabindex="0"]',
  )).filter((element) => !element.closest("[hidden]"));
}

export function CommerceAnalyticsWorkspace({
  tab,
  range,
  compare = false,
  customFrom,
  customTo,
  initialTimezone,
}: Readonly<{
  tab: Tab;
  range: Range;
  compare?: boolean;
  customFrom?: string;
  customTo?: string;
  initialTimezone?: string;
}>) {
  const router = useRouter(),
    searchParams = useSearchParams(),
    serialized = searchParams.toString();
  const [from, setFrom] = useState(customFrom ?? ""),
    [to, setTo] = useState(customTo ?? ""),
    [timezone, setTimezone] = useState(initialTimezone),
    [timezoneDraft, setTimezoneDraft] = useState(initialTimezone ?? "");
  const [chartCurrency, setChartCurrency] = useState<string | null>(null);
  const filterRef = useRef<HTMLDetailsElement>(null);
  const filterBodyRef = useRef<HTMLDivElement>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);
  const [retry, setRetry] = useState(0);
  const [resultKey, setResultKey] = useState("");
  const [dateError, setDateError] = useState("");
  const [detailsData, setDetailsData] = useState<OverviewDetails>();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"),
    [data, setData] = useState<Payload>(),
    [error, setError] = useState("");
  useEffect(() => {
    setFrom(customFrom ?? "");
    setTo(customTo ?? "");
    setDateError("");
  }, [customFrom, customTo, range]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1024px)");
    const update = () => setFilterSheet(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => { setFiltersOpen(false); }, [tab, serialized]);
  useEffect(() => {
    const panel = filterBodyRef.current;
    if (!filtersOpen || !filterSheet || !panel || !filterRef.current?.open) return;
    const release = isolateFilterSheet(panel);
    const focusInside = () => (filterFocusTargets(panel)[0] ?? panel).focus();
    const guardFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) focusInside();
    };
    document.addEventListener("focusin", guardFocus);
    focusInside();
    return () => {
      document.removeEventListener("focusin", guardFocus);
      release();
      filterRef.current?.querySelector("summary")?.focus();
    };
  }, [filtersOpen, filterSheet, tab, serialized]);
  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      const details = filterRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
        setFiltersOpen(false);
        details.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);
  const apiQuery = useMemo(() => {
    return analyticsRequestQuery(serialized, range, initialTimezone);
  }, [range, serialized, initialTimezone]);
  const requestKey = `${tab}:${apiQuery}:${retry}`;
  const viewState = resultKey === requestKey ? state : "loading";
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError("");
    void fetch(`${ROUTES[tab]}?${apiQuery}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("request_failed");
        return parse(await response.json());
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setTimezone(value.range.timezone);
          setTimezoneDraft(value.range.timezone);
          setResultKey(requestKey);
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(undefined);
          setError("Analitik veriler şu anda yüklenemiyor.");
          setResultKey(requestKey);
          setState("error");
        }
      });
    return () => controller.abort();
  }, [apiQuery, tab, retry, requestKey]);
  useEffect(() => {
    if (tab !== "overview") return;
    const controller = new AbortController();
    setDetailsData({ key: requestKey, funnelState: "loading", productsState: "loading" });
    for (const report of ["funnel", "products"] as const) {
      void fetch(`${ROUTES[report]}?${apiQuery}`, {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw Error("request_failed");
        return parse(await response.json());
      }).then((value) => {
        if (!controller.signal.aborted) setDetailsData((previous) => previous?.key === requestKey
          ? { ...previous, [report]: value, [`${report}State`]: "ready" } : previous);
      }).catch(() => {
        if (!controller.signal.aborted) setDetailsData((previous) => previous?.key === requestKey
          ? { ...previous, [`${report}State`]: "error" } : previous);
      });
    }
    return () => controller.abort();
  }, [apiQuery, tab, requestKey]);
  const traffic = useMemo(() => trafficSummary(data?.traffic), [data?.traffic]),
    measuredEvents = useMemo(() => analyticsTrafficEvents(data?.traffic), [data?.traffic]),
    events = measuredEvents ?? {},
    previousTraffic = useMemo(
      () => trafficSummary(data?.comparisonTraffic),
      [data?.comparisonTraffic],
    );
  const href = (patch: Record<string, string | null>) => analyticsQueryHref(serialized, patch);
  const tabHref = (next: Tab) => analyticsTabHref(serialized, next);
  const onTabKeyDown = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const last = TABS.length - 1;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? last
      : event.key === "ArrowRight" ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length;
    event.currentTarget.parentElement?.querySelectorAll<HTMLAnchorElement>('[role="tab"]')[nextIndex]?.focus();
    router.push(tabHref(TABS[nextIndex]![0]));
  };
  function filters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      query = new URLSearchParams(serialized);
    for (const key of [
      "device",
      "source",
      "campaign",
      "product",
      "category",
      "brand",
      "currency",
      "touch",
      "search",
      "lifecycle",
      "contact",
      "minValue",
      "maxValue",
      "page",
    ]) {
      const value = String(form.get(key) ?? "").trim();
      value ? query.set(key, value) : query.delete(key);
    }
    if (tab === "products" || tab === "carts") query.set("page", "1");
    if (filterRef.current) filterRef.current.open = false;
    setFiltersOpen(false);
    filterRef.current?.querySelector("summary")?.focus();
    router.push(`/analytics?${query.toString()}`);
  }
  const activeTimezone = data?.range.timezone ?? timezone ?? "UTC";
  const current = data?.commerce.currencies ?? [];
  const previous = data?.comparisonCommerce?.currencies ?? [];
  const selectedCurrency = current.find((row) => row.currency === chartCurrency) ?? current[0];
  const activeFilterCount = FILTER_FIELDS.filter((key) => searchParams.has(key)).length;
  const clearFiltersHref = href({ ...Object.fromEntries(FILTER_FIELDS.map((key) => [key, null])), page: null });
  const wideRangeHref = href({ range: "90d", from: null, to: null, compare: null });
  const trafficExpected = tab !== "carts" && !(tab === "acquisition" && searchParams.get("touch") === "first");
  const trafficMissing = trafficExpected && Boolean(data) && data?.traffic === null;
  const workerDelayed = Boolean(data && (data.commerce.worker.deadLetter > 0 || data.commerce.worker.retry > 0 || data.commerce.worker.oldestPendingSeconds > 300));
  const applicableDegradation = data?.status === "degraded" && (trafficExpected || workerDelayed);
  const currencyFiltered = Boolean(searchParams.get("currency"));

  return (
    <PanelPageShell>
      <div className={styles.root}>
        <PanelTopbarBridge
          title="Analizler"
          hideHeading
          context={<div className={styles.topbarLiveMetric}><ActiveVisitorsCard /></div>}
        />
        <h1 className="sr-only">Analizler</h1>
        <div className={styles.pageTop}>
          <nav className={styles.tabs} aria-label="Analizler bölümleri" role="tablist">
            {TABS.map(([value, label], index) => (
              <Link
                key={value}
                id={`analytics-tab-${value}`}
                aria-controls="analytics-report"
                aria-current={value === tab ? "page" : undefined}
                aria-selected={value === tab}
                className={value === tab ? styles.activeTab : styles.tab}
                href={tabHref(value)}
                role="tab"
                tabIndex={value === tab ? 0 : -1}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className={styles.quickControls}>
            <div className={styles.periodControl}>
              <CalendarDays aria-hidden="true" />
              <select
                aria-label="Tarih aralığı"
                value={range}
                onChange={(event) => {
                  const next = event.currentTarget.value as Exclude<Range, "custom">;
                  router.push(href({ range: next, from: null, to: null, page: null }));
                }}
              >
                {range === "custom" ? <option value="custom">Özel aralık</option> : null}
                <option value="today">Bugün</option>
                <option value="7d">Son 7 gün</option>
                <option value="30d">Son 30 gün</option>
                <option value="90d">Son 90 gün</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </div>
            {range !== "custom" ? (
              <button
                type="button"
                className={styles.compareButton}
                aria-pressed={compare}
                onClick={() => router.push(href({ compare: compare ? null : "1" }))}
              >
                <GitCompareArrows size={16} aria-hidden="true" /> Kıyasla
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.contextRow}>
          <div className={styles.dataStatus} role="status">
            <span className={viewState !== "ready" ? styles.statusNeutral : trafficMissing || applicableDegradation ? styles.statusAmber : styles.statusDot} aria-hidden="true" />
            {viewState === "ready" && data
              ? workerDelayed ? "Veriler gecikiyor" : trafficMissing ? "Satış verileri güncel" : applicableDegradation ? "Bazı ölçümler eksik" : "Veriler güncel"
              : viewState === "loading" ? "Yükleniyor" : "Veri alınamadı"}
            {viewState === "ready" && data ? <span className={styles.contextMeta}>{new Intl.DateTimeFormat("tr-TR", {day: "numeric", month: "short", timeZone: activeTimezone}).format(new Date(data.range.start))} – {new Intl.DateTimeFormat("tr-TR", {day: "numeric", month: "short", timeZone: activeTimezone}).format(new Date(Date.parse(data.range.end) - 1))} · {activeTimezone}</span> : null}
          </div>
          <details
            className={styles.filterDisclosure}
            key={`${tab}:${serialized}`}
            ref={filterRef}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              event.preventDefault();
              event.currentTarget.open = false;
              setFiltersOpen(false);
              event.currentTarget.querySelector("summary")?.focus();
            }}
          >
            <summary tabIndex={filterSheet && filtersOpen ? -1 : undefined}>
              <SlidersHorizontal size={15} aria-hidden="true" />
              Filtreler{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </summary>
            <div
              className={styles.filterBody}
              ref={filterBodyRef}
              role={filterSheet ? "dialog" : undefined}
              aria-modal={filterSheet && filtersOpen ? true : undefined}
              aria-label={filterSheet ? "Analiz filtreleri" : undefined}
              tabIndex={-1}
              onKeyDown={(event) => {
                if (!filterSheet || !filtersOpen || event.key !== "Tab") return;
                const targets = filterFocusTargets(event.currentTarget);
                const first = targets[0], last = targets[targets.length - 1];
                if (!first || !last) { event.preventDefault(); event.currentTarget.focus(); return; }
                if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
                  event.preventDefault(); last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault(); first.focus();
                }
              }}
            >
              <button
                type="button"
                className={styles.filterClose}
                onClick={() => {
                  if (filterRef.current) filterRef.current.open = false;
                  setFiltersOpen(false);
                  filterRef.current?.querySelector("summary")?.focus();
                }}
              >Kapat</button>
              <FilterForm
                tab={tab}
                params={new URLSearchParams(serialized)}
                currencies={[...new Set(current.map((row) => row.currency))]}
                onSubmit={filters}
              />
              {activeFilterCount ? <Link className={styles.clearFilters} href={clearFiltersHref}>Filtreleri temizle</Link> : null}
              <div className={styles.advancedControls}>
                <span className={styles.filterHint}>Özel tarih ve saat dilimi</span>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!from || !to || to < from) { setDateError("Bitiş tarihi başlangıçtan önce olamaz."); return; }
                    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 >= 400) { setDateError("En fazla 400 günlük aralık seçin."); return; }
                    setDateError("");
                    if (filterRef.current) filterRef.current.open = false;
                    setFiltersOpen(false);
                    filterRef.current?.querySelector("summary")?.focus();
                    router.push(href({ range: null, from, to, compare: null, page: null }));
                  }}
                >
                  <label>Başlangıç<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setDateError(""); }} required /></label>
                  <label>Bitiş<input type="date" aria-describedby={dateError ? "analytics-date-error" : undefined} aria-invalid={Boolean(dateError)} value={to} onChange={(event) => { setTo(event.target.value); setDateError(""); }} required /></label>
                  <button type="submit">Özel aralık</button>
                </form>
                {dateError ? <p className={styles.dateError} id="analytics-date-error" role="alert">{dateError}</p> : null}
                <div className={styles.timezoneControl}>
                  <label>Saat dilimi<input value={timezoneDraft} maxLength={64} onChange={(event) => setTimezoneDraft(event.currentTarget.value)} /></label>
                  <button
                    type="button"
                    onClick={() => {
                      if (!timezoneDraft.trim()) { setError("Geçerli bir saat dilimi girin."); return; }
                      try {
                        new Intl.DateTimeFormat("en", { timeZone: timezoneDraft });
                        setTimezone(timezoneDraft);
                        setError("");
                        router.push(href({ timezone: timezoneDraft }));
                      } catch {
                        setError("Geçerli bir saat dilimi girin.");
                      }
                    }}
                  >Uygula</button>
                </div>
              </div>
            </div>
          </details>
        </div>

        {error && viewState !== "error" ? <p className={styles.inlineError} role="alert">{error}</p> : null}
        <div id="analytics-report" role="tabpanel" aria-labelledby={`analytics-tab-${tab}`} aria-busy={viewState === "loading"} tabIndex={0} className={styles.reportPanel}>
        {viewState === "loading" ? (
          <div className={styles.loading} role="status" aria-label="Analizler yükleniyor">
            <div className={styles.skeletonGrid}><span /><span /><span /><span /></div>
            <span className={styles.skeletonChart} />
          </div>
        ) : null}
        {viewState === "error" ? (
          <section className={styles.errorState} role="alert">
            <CircleAlert size={22} aria-hidden="true" />
            <strong>Veri alınamadı</strong>
            <button type="button" onClick={() => setRetry((value) => value + 1)}>Yeniden dene</button>
          </section>
        ) : null}
        {viewState === "ready" && data ? (
          <>
            {trafficMissing || applicableDegradation ? (
              <div className={styles.warning} role="status">
                <CircleAlert size={18} aria-hidden="true" />
                <div>
                  <strong>{trafficMissing ? currencyFiltered ? "Bu para biriminde trafik ölçülmüyor" : "Trafik verisi alınamıyor" : workerDelayed ? "Ölçümde gecikme var" : "Bazı ölçümler kullanılamıyor"}</strong>
                  {trafficMissing ? <span>{workerDelayed ? "Satış ve sepet verileri gecikiyor." : "Satış ve sepet verileri güncel."}</span> : null}
                </div>
              </div>
            ) : null}
            {compare && data.comparisonCommerce ? (
              <details className={styles.comparisonDetails}>
                <summary>Önceki dönem</summary>
                <div className={styles.comparisonRows}>
                  {[...new Set([...current, ...previous].map((row) => row.currency))].map((currency) => {
                    const active = current.find((row) => row.currency === currency);
                    const prior = previous.find((row) => row.currency === currency);
                    return <span key={currency}>
                      {currency} · {active ? money(active.grossRevenueMinor, currency) : "—"} / {prior ? money(prior.grossRevenueMinor, currency) : "—"} · {active?.paidOrders ?? "—"} / {prior?.paidOrders ?? "—"} sipariş · {active?.abandonedCarts ?? "—"} / {prior?.abandonedCarts ?? "—"} terk · {active?.recoveredCarts ?? "—"} / {prior?.recoveredCarts ?? "—"} geri kazanım
                    </span>;
                  })}
                  {traffic && previousTraffic ? <span>Ziyaretçi · {traffic.visitors.toLocaleString("tr-TR")} / {previousTraffic.visitors.toLocaleString("tr-TR")}</span> : null}
                  {traffic && previousTraffic ? <span>Sayfa görüntüleme · {traffic.pageviews.toLocaleString("tr-TR")} / {previousTraffic.pageviews.toLocaleString("tr-TR")} · {delta(traffic.pageviews, previousTraffic.pageviews)}</span> : null}
                </div>
              </details>
            ) : null}
            {tab === "overview" ? (
              <Overview
                data={data}
                traffic={traffic}
                events={events}
                eventsAvailable={measuredEvents !== null}
                detailsData={detailsData?.key === requestKey ? detailsData : undefined}
                previousTraffic={previousTraffic}
                compare={compare}
                timezone={activeTimezone}
                range={range}
                selectedCurrency={selectedCurrency}
                onCurrencyChange={setChartCurrency}
                funnelHref={tabHref("funnel")}
                sourcesHref={tabHref("acquisition")}
                productsHref={tabHref("products")}
                cartsHref={tabHref("carts")}
                wideRangeHref={wideRangeHref}
              />
            ) : null}
            {tab === "funnel" ? <FunnelPanel events={events} available={measuredEvents !== null} wideRangeHref={wideRangeHref} paidOrders={total(current, "paidOrders")} /> : null}
            {tab === "carts" ? <Carts data={data} href={href} timezone={activeTimezone} /> : null}
            {tab === "acquisition" ? <Acquisition data={data} params={searchParams} /> : null}
            {tab === "products" ? <Products data={data} href={href} /> : null}
            <details className={styles.technical}>
              <summary>Veri ve ölçüm</summary>
              <p className={styles.footnote}>Satış: ödenen sipariş geliri. Huni: aynı oturumda ilerleyen adımlar. Para birimleri ayrı gösterilir.</p>
              <div>
                <span>Bekleyen {data.commerce.worker.pending}</span>
                <span>İşlenen {data.commerce.worker.claimed}</span>
                <span>Tekrar {data.commerce.worker.retry}</span>
                <span>Hatalı {data.commerce.worker.deadLetter}</span>
                <span>En eski {data.commerce.worker.oldestPendingSeconds} sn</span>
                <span>Gecikme {data.commerce.worker.deliveryLatencyMilliseconds} ms</span>
                <span>Son başarılı {data.commerce.worker.lastSuccessfulDelivery ? date(data.commerce.worker.lastSuccessfulDelivery, activeTimezone) : "—"}</span>
                <Link href="/settings/analytics">Analitik ayarları <ArrowRight size={13} aria-hidden="true" /></Link>
              </div>
            </details>
          </>
        ) : null}
        </div>
      </div>
    </PanelPageShell>
  );
}

function Overview({
  data,
  traffic,
  events,
  previousTraffic,
  eventsAvailable,
  detailsData,
  compare,
  timezone,
  selectedCurrency,
  onCurrencyChange,
  funnelHref,
  sourcesHref,
  productsHref,
  cartsHref,
  wideRangeHref,
  range,
}: Readonly<{
  data: Payload;
  traffic: ReturnType<typeof trafficSummary>;
  events: Readonly<Record<string, number>>;
  previousTraffic: ReturnType<typeof trafficSummary>;
  eventsAvailable: boolean;
  detailsData?: OverviewDetails;
  compare: boolean;
  timezone: string;
  selectedCurrency?: Currency;
  onCurrencyChange: (currency: string) => void;
  funnelHref: string;
  sourcesHref: string;
  productsHref: string;
  cartsHref: string;
  wideRangeHref: string;
  range: Range;
}>) {
  const currencies = data.commerce.currencies;
  const previousCurrencies = data.comparisonCommerce?.currencies ?? [];
  const paidOrders = total(currencies, "paidOrders");
  const previousOrders = total(previousCurrencies, "paidOrders");
  const conversion = traffic?.visitors ? paidOrders / traffic.visitors : null;
  const previousConversion = previousTraffic?.visitors ? previousOrders / previousTraffic.visitors : null;
  const conversionChange = conversion !== null && previousConversion !== null
    ? Number(((conversion - previousConversion) * 100).toFixed(1)) : null;
  const currentSeries = selectedCurrency
    ? dailySalesPointsForCurrency(data.commerce.series, selectedCurrency.currency, data.range)
    : [];
  const labelDate = (value: string) => {
    const calendarDay = /^\d{4}-\d{2}-\d{2}$/.test(value);
    return new Intl.DateTimeFormat("tr-TR", {
      day: "numeric", month: "short", year: "numeric",
      timeZone: calendarDay ? "UTC" : timezone,
    }).format(new Date(calendarDay ? `${value}T00:00:00.000Z` : value));
  };
  const chartPoints = currentSeries.map((point) => ({
    label: labelDate(point.day),
    value: point.value,
    orders: point.paidOrders,
  }));
  const abandonedCarts = total(currencies, "abandonedCarts");
  const recoveredCarts = total(currencies, "recoveredCarts");
  const journey = [FUNNEL_STEPS[0], FUNNEL_STEPS[1], FUNNEL_STEPS[3], FUNNEL_STEPS[5]];
  const journeyEvents = analyticsTrafficEvents(detailsData?.funnel?.traffic);
  const largestDrop = journeyEvents ? largestFunnelDrop(journeyEvents) : null;
  const comparison = data.comparisonCommerce;
  const priorRange = comparison?.rangeStart && comparison.rangeEnd
    ? { start: comparison.rangeStart, end: comparison.rangeEnd, timezone }
    : previousAnalyticsRange(data.range);
  const priorSeries = compare && selectedCurrency && data.comparisonCommerce && priorRange && previousCurrencies.some((bucket) => bucket.currency === selectedCurrency.currency)
    ? dailySalesPointsForCurrency(data.comparisonCommerce.series, selectedCurrency.currency, priorRange).map((point) => ({label: labelDate(point.day), value: point.value, orders: point.paidOrders}))
    : undefined;
  const journeyPeak = Math.max(1, ...journey.map(([key]) => journeyEvents?.[key] ?? 0));
  const sources = (analyticsTrafficSources(data.traffic) ?? []).slice(0, 3);
  const products = detailsData?.products?.commerce.products.slice(0, 3) ?? [];
  const commerceTrends = analyticsCommerceTrends(data.commerce.series, traffic?.series ?? null, timezone);
  const trafficBreakdowns = ([
    ["Sayfalar", "path"], ["Yönlendirenler", "referrer"],
    ["Cihazlar", "device"], ["Ülkeler", "country"],
  ] as const).map(([title, key]) => ({ title, rows: analyticsTrafficMetric(data.traffic, key)?.slice(0, 10) ?? null }));
  const salesChange = selectedCurrency && compare
    ? previousCurrencies.find((row) => row.currency === selectedCurrency.currency)
    : null;
  const sourceLabel = (value: string) => value === "direct" ? "Doğrudan" : value === "search" ? "Organik arama" : value;
  return (
    <div className={styles.overview}>
      <section className={styles.kpiStrip} aria-label="Temel performans göstergeleri">
        <MetricTile
          label="Ödenen satış"
          value={currencies.length ? currencies.map((bucket) => (
            <span className={styles.currencyAmount} key={bucket.currency}>{money(bucket.grossRevenueMinor, bucket.currency)}</span>
          )) : "—"}
          note={salesChange && salesChange.grossRevenueMinor > 0 && currencies.length === 1
            ? `Önceki döneme göre ${delta(selectedCurrency?.grossRevenueMinor ?? null, salesChange.grossRevenueMinor)}`
            : undefined}
          trend={salesChange && (selectedCurrency?.grossRevenueMinor ?? 0) >= salesChange.grossRevenueMinor ? "up" : undefined}
        />
        <MetricTile
          label="Ödenen sipariş"
          value={paidOrders.toLocaleString("tr-TR")}
          note={compare && previousOrders > 0 ? `Önceki döneme göre ${delta(paidOrders, previousOrders)}` : undefined}
          trend={compare && previousOrders > 0 ? paidOrders >= previousOrders ? "up" : "down" : undefined}
        />
        <MetricTile
          label="Ziyaretçi"
          value={traffic ? traffic.visitors.toLocaleString("tr-TR") : "—"}
          note={compare && traffic && previousTraffic?.visitors
            ? `Önceki döneme göre ${delta(traffic.visitors, previousTraffic.visitors)}` : undefined}
          trend={compare && traffic && previousTraffic?.visitors
            ? traffic.visitors >= previousTraffic.visitors ? "up" : "down" : undefined}
        />
        <MetricTile
          label="Satın alma oranı"
          value={percent(conversion)}
          note={compare && conversionChange !== null
            ? `Önceki döneme göre ${(conversionChange === 0 ? 0 : conversionChange).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} puan` : undefined}
          trend={compare && conversionChange !== null && conversionChange !== 0
            ? conversionChange > 0 ? "up" : "down" : undefined}
        />
      </section>

      {currencies.length > 1 ? (
        <div className={styles.currencySelector} role="group" aria-label="Grafik para birimi">
          {currencies.map((bucket) => (
            <button
              key={bucket.currency}
              type="button"
              aria-pressed={bucket.currency === selectedCurrency?.currency}
              onClick={() => onCurrencyChange(bucket.currency)}
            >{bucket.currency}</button>
          ))}
        </div>
      ) : null}

      <div className={`${styles.heroGrid} ${largestDrop || abandonedCarts || !journeyEvents ? "" : styles.heroSolo}`}>
        {selectedCurrency ? (
          <SalesTrendChart
            points={chartPoints}
            currency={selectedCurrency.currency}
            totalMinor={selectedCurrency.grossRevenueMinor}
            comparisonPoints={priorSeries}
            emptyAction={range !== "90d" ? <Link href={wideRangeHref}>Son 90 güne bak</Link> : undefined}
          />
        ) : (
          <section className={`${styles.panel} ${styles.compactState}`}>
            <EmptyIllustration />
            <h2>Bu dönemde satış yok</h2>
            {range !== "90d" ? <Link className={styles.outlineAction} href={wideRangeHref}>Son 90 güne bak</Link> : null}
          </section>
        )}
        {largestDrop ? (
          <aside className={styles.insight} aria-label="Dönüşüm içgörüsü">
            <div className={styles.insightContent}>
              <span className={styles.insightLabel}>EN BÜYÜK KAYIP</span>
              <h2>{largestDrop.to}</h2>
              <strong>{largestDrop.lost.toLocaleString("tr-TR")} oturum · {percent(largestDrop.rate)}</strong>
              <p className={styles.filterHint}>{largestDrop.from} → {largestDrop.to}</p>
            </div>
            <InsightIllustration kind="funnel" />
            <Link href={funnelHref}>Huniyi incele <ArrowRight size={16} aria-hidden="true" /></Link>
          </aside>
        ) : abandonedCarts ? (
          <aside className={styles.insight} aria-label="Sepet içgörüsü">
            <div className={styles.insightContent}>
              <span className={styles.insightLabel}>SEPET HAREKETİ</span>
              <h2>{abandonedCarts.toLocaleString("tr-TR")} terk edilen sepet</h2>
              <strong>{recoveredCarts.toLocaleString("tr-TR")} geri kazanım</strong>
            </div>
            <InsightIllustration kind="cart" />
            <Link href={cartsHref}>Sepetleri incele <ArrowRight size={16} aria-hidden="true" /></Link>
          </aside>
        ) : !journeyEvents ? (
          <aside className={`${styles.panel} ${styles.journeyUnavailable}`} aria-label="Etkileşim adımları">
            <Route size={24} aria-hidden="true" /><h2>{!detailsData || detailsData.funnelState === "loading" ? "Etkileşimler yükleniyor" : "Etkileşim ölçümü bekleniyor"}</h2>
            {detailsData && detailsData.funnelState !== "loading" ? <><p>Bu durum sıfır ziyaretçi anlamına gelmez.</p><Link className={styles.outlineAction} href={funnelHref}>Huniyi incele</Link></> : null}
          </aside>
        ) : null}
      </div>

      {journeyEvents ? (
        <section className={styles.journeySection}>
          <div className={styles.sectionHeading}>
            <h2>Etkileşim adımları</h2>
            <Link href={funnelHref}>6 adımı gör <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <div className={styles.journey}>
            {journey.map(([key, label], index) => {
              const value = journeyEvents[key] ?? null;
              return <div className={styles.journeyItem} key={key}>
                <small>{label}</small>
                <span className={styles.journeyTrack} aria-hidden="true"><span style={{ width: `${Math.min(100, ((value ?? 0) / journeyPeak) * 100)}%` }} data-final={index === journey.length - 1} /></span>
                <strong>{value?.toLocaleString("tr-TR") ?? "—"}</strong>
              </div>;
            })}
          </div>
        </section>
      ) : null}

      <div className={styles.lowerGrid}>
        {(
          <section className={styles.listPanel}>
            <div className={styles.sectionHeading}><h2>Başlıca kaynaklar</h2><Link href={sourcesHref}>Tümünü gör <ArrowRight size={14} aria-hidden="true" /></Link></div>
            {sources.length ? sources.map((row) => <div className={styles.listRow} key={row.label}><span>{sourceLabel(row.label)}</span><strong>{row.value.toLocaleString("tr-TR")}</strong></div>) : <p className={styles.quietState}>{analyticsTrafficSources(data.traffic) === null ? "Kaynak ölçümü alınamıyor." : "Bu dönemde kaynak kaydı yok."}</p>}
          </section>
        )}
        {(
          <section className={styles.listPanel}>
            <div className={styles.sectionHeading}><h2>Öne çıkan ürünler</h2><Link href={productsHref}>Tümünü gör <ArrowRight size={14} aria-hidden="true" /></Link></div>
            {products.length ? products.map((row) => <div className={styles.listRow} key={`${row.productId}:${row.currency}`}><span className={styles.listProduct}><ProductThumbnail imageUrl={row.imageUrl} className={styles.productIcon} />{row.title}</span><strong>{money(row.revenueMinor, row.currency)}</strong></div>) : <p className={styles.quietState}>{!detailsData || detailsData.productsState === "loading" ? "Ürünler yükleniyor" : detailsData.productsState === "error" ? "Ürün ölçümleri alınamadı." : "Bu dönemde ürün hareketi yok."}</p>}
          </section>
        )}
        {!sources.length && !products.length ? (
          <section className={styles.listPanel}>
            <div className={styles.sectionHeading}><h2>Ticari hareket</h2></div>
            <div className={styles.listRow}><span>Ödenen sipariş</span><strong>{paidOrders.toLocaleString("tr-TR")}</strong></div>
            <div className={styles.listRow}><span>Terk edilen sepet</span><strong>{total(currencies, "abandonedCarts").toLocaleString("tr-TR")}</strong></div>
            <div className={styles.listRow}><span>Geri kazanılan sepet</span><strong>{total(currencies, "recoveredCarts").toLocaleString("tr-TR")}</strong></div>
          </section>
        ) : null}
      </div>
      <details className={styles.secondaryMetrics}>
        <summary>Diğer ölçümler</summary>
        <div className={styles.secondaryGrid}>
          {traffic ? <section className={styles.dataList}>
            <h3>Ziyaret davranışı</h3>
            <div><span>Sayfa görüntüleme</span><strong>{traffic.pageviews.toLocaleString("tr-TR")}</strong></div>
            <div><span>Oturum</span><strong>{traffic.visits.toLocaleString("tr-TR")}</strong></div>
            <div><span>Ort. oturum</span><strong>{traffic.averageVisitSeconds.toLocaleString("tr-TR")} sn</strong></div>
            <div><span>Hemen çıkma</span><strong>{percent(traffic.bounceRateBasisPoints / 10_000)}</strong></div>
          </section> : null}
          {eventsAvailable ? <DetailBars title="Bağımsız etkileşim sinyalleri" rows={FUNNEL_STEPS.filter(([key]) => events[key] !== undefined).map(([key, label]) => ({label, value: events[key]!}))} /> : null}
          {currencies.map((bucket) => <section className={styles.dataList} key={bucket.currency}>
            <h3>{bucket.currency} · ticaret</h3>
            <div><span>Ort. sipariş</span><strong>{bucket.paidOrders ? money(bucket.grossRevenueMinor / bucket.paidOrders, bucket.currency) : "—"}</strong></div>
            <div><span>İade</span><strong>{money(bucket.refundedMinor, bucket.currency)}</strong></div>
            <div><span>Aktif sepet</span><strong>{bucket.activeCarts.toLocaleString("tr-TR")}</strong></div>
            <div><span>Terk edilen</span><strong>{bucket.abandonedCarts.toLocaleString("tr-TR")}</strong></div>
            <div><span>Geri kazanılan</span><strong>{bucket.recoveredCarts.toLocaleString("tr-TR")}</strong></div>
            <div><span>Geri kazanılan tutar</span><strong>{money(bucket.recoveredNetMinor, bucket.currency)}</strong></div>
          </section>)}
          <DetailBars title="Sipariş ritmi" rows={commerceTrends.orders.slice(-10)} />
          <DetailBars title="Ödenen sipariş / oturum" rows={commerceTrends.paidConversionPermille?.slice(-10) ?? null} format={(value) => percent(value / 1000)} />
          <DetailBars title="Oturum ritmi" rows={traffic?.series.slice(-10).map((row) => ({ label: labelDate(row.at), value: row.value })) ?? null} />
          <DetailBars title="Terk / geri kazanım" rows={data.commerce.series.slice(-10).flatMap((row) => [
            { label: `${labelDate(row.startsAt)} · ${row.currency} terk`, value: row.abandonedCarts },
            { label: `${labelDate(row.startsAt)} · ${row.currency} geri`, value: row.recoveredCarts },
          ])} />
          {trafficBreakdowns.map(({ title, rows }) => <DetailBars key={title} title={title} rows={rows} />)}
        </div>
      </details>
    </div>
  );
}

// Reuses the rendered overview for isolated presentation QA without live requests.
export { Overview as CommerceAnalyticsOverviewPresentation };

function Carts({
  data,
  href,
  timezone,
}: Readonly<{
  data: Payload;
  href: (patch: Record<string, string | null>) => string;
  timezone: string;
}>) {
  const statusLabel: Record<string, string> = {
    active: "Aktif", candidate: "Terk adayı", abandoned: "Terk edildi",
    resumed: "Geri döndü", converted_pending_payment: "Ödeme bekliyor",
    recovered: "Geri kazanıldı", expired: "Süresi doldu",
  };
  const page = data.commerce.cartPage;
  return (
    <div className={styles.detailPage}>
      {data.commerce.currencies.map((bucket) => (
        <section key={bucket.currency} aria-label={`${bucket.currency} sepet özeti`}>
          {data.commerce.currencies.length > 1 ? <h2 className={styles.currencyHeading}>{bucket.currency}</h2> : null}
          <div className={styles.metrics}>
            <MetricTile label="Aktif sepet" value={bucket.activeCarts.toLocaleString("tr-TR")} />
            <MetricTile label="Terk edilen" value={bucket.abandonedCarts.toLocaleString("tr-TR")} note={money(bucket.abandonedValueMinor, bucket.currency)} />
            <MetricTile label="Ödeme hatası" value={bucket.paymentFailures.toLocaleString("tr-TR")} />
            <MetricTile label="Geri kazanılan" value={bucket.recoveredCarts.toLocaleString("tr-TR")} note={money(bucket.recoveredNetMinor, bucket.currency)} />
          </div>
          <details className={styles.comparisonDetails}>
            <summary>Diğer sepet ölçümleri</summary>
            <div className={styles.comparisonRows}>
              <span>Terk adayı {bucket.candidateCarts}</span>
              <span>Uygun sepet {bucket.eligibleCarts}</span>
              <span>Ödemeye geçen {bucket.checkoutStarts}</span>
              <span>Uygun ödeme {bucket.eligibleCheckoutStarts}</span>
              <span>Ödemede terk {bucket.checkoutAbandoned}</span>
              <span>Ödemede terk oranı {percent(bucket.eligibleCheckoutStarts ? bucket.checkoutAbandoned / bucket.eligibleCheckoutStarts : null)}</span>
              <span>Ödeme hatası oranı {percent(bucket.checkoutStarts ? bucket.paymentFailures / bucket.checkoutStarts : null)}</span>
              <span>Sepet terk oranı {percent(bucket.eligibleCarts ? bucket.abandonedCarts / bucket.eligibleCarts : null)}</span>
              <span>Geri kazanım oranı {percent(bucket.abandonedCarts ? bucket.recoveredCarts / bucket.abandonedCarts : null)}</span>
              <span>Geri kazanılan brüt {money(bucket.recoveredGrossMinor, bucket.currency)}</span>
              <span>İade {money(bucket.recoveredRefundedMinor, bucket.currency)}</span>
              <span>Net {money(bucket.recoveredNetMinor, bucket.currency)}</span>
            </div>
          </details>
        </section>
      ))}
      <section className={styles.tablePanel}>
        <div className={styles.sectionHeading}><h2>{"Sepet hareketleri"}</h2><span className={styles.tableCount}>{page.totalItems.toLocaleString("tr-TR")} kayıt</span></div>
        {data.commerce.carts.length ? (
          <div className={styles.tableScroll}>
            <table aria-label="Sepet listesi">
              <thead><tr><th>Müşteri / ürün</th><th>Tutar</th><th>Son hareket</th><th>Kaynak / cihaz</th><th>Durum</th></tr></thead>
              <tbody>
                {data.commerce.carts.map((cart) => (
                  <tr key={cart.id}>
                    <td data-label="Müşteri / ürün" data-primary="true">
                      <strong>{cart.customerLabel}</strong>
                      <small>{cart.productSummary}</small>
                      <Link href={`/orders/abandoned-carts/${cart.id}`}>Detay <ArrowRight size={13} aria-hidden="true" /></Link>
                    </td>
                    <td data-label="Tutar">
                      <strong>{money(cart.totalMinor, cart.currency)}</strong>
                      <small>Ara {money(cart.subtotalMinor, cart.currency)} · İndirim {money(cart.discountMinor, cart.currency)} · Kargo {money(cart.shippingMinor, cart.currency)}</small>
                    </td>
                    <td data-label="Son hareket">
                      {date(cart.lastActivityAt, timezone)}
                      {cart.abandonedAt ? <small>Terk {date(cart.abandonedAt, timezone)}</small> : null}
                    </td>
                    <td data-label="Kaynak / cihaz">
                      {cart.source} · {cart.device}
                      {cart.campaign ? <small>{cart.campaign}</small> : null}
                    </td>
                    <td data-label="Durum">
                      {statusLabel[cart.lifecycle] ?? cart.lifecycle}
                      <small>{cart.contacted ? "İletişim kuruldu" : cart.contactable ? "İletişime uygun" : "İletişim yok"}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.quietState}>Bu filtrelerde sepet yok.</p>}
      </section>
      <nav aria-label="Sepet listesi sayfaları" className={styles.pagination}>
        {page.page > 1 ? <Link href={href({ page: String(page.page - 1) })}>Önceki</Link> : <span aria-disabled="true">Önceki</span>}
        <span>{page.page} / {Math.max(page.totalPages, 1)}</span>
        {page.page < page.totalPages ? <Link href={href({ page: String(page.page + 1) })}>Sonraki</Link> : <span aria-disabled="true">Sonraki</span>}
      </nav>
    </div>
  );
}

function Acquisition({
  data,
  params,
}: Readonly<{ data: Payload; params: ReadonlyURLSearchParams }>) {
  const firstTouch = params.get("touch") === "first";
  const behavioral = firstTouch ? [] : acquisitionRows(data.traffic);
  const behaviorAvailable = !firstTouch && Boolean(data.traffic && typeof data.traffic === "object" && (data.traffic as {breakdown?: {items?: unknown}}).breakdown?.items instanceof Array);
  const sum = (key: keyof AcquisitionTraffic) => behavioral.reduce((value, row) => value + (typeof row[key] === "number" ? Number(row[key]) : 0), 0);
  const behaviorFor = (row: Payload["commerce"]["attribution"][number]) => behavioral.find((item) =>
    item.source === row.source && item.medium === row.medium && (item.campaign ?? null) === (row.campaign ?? null));
  const rows = [
    ...data.commerce.attribution.map((commerce) => ({ commerce, behavior: behaviorFor(commerce) })),
    ...behavioral.filter((behavior) => !data.commerce.attribution.some((commerce) =>
      commerce.source === behavior.source && commerce.medium === behavior.medium && (commerce.campaign ?? null) === (behavior.campaign ?? null)
    )).map((behavior) => ({ commerce: null, behavior })),
  ];
  return (
    <div className={styles.detailPage}>
      {behaviorAvailable ? (
        <section className={styles.metrics} aria-label="Kaynak özeti">
          <MetricTile label="Ziyaretçi" value={sum("visitors").toLocaleString("tr-TR")} />
          <MetricTile label="Ürün görüntüleme" value={sum("productViews").toLocaleString("tr-TR")} />
          <MetricTile label="Sepete ekleme" value={sum("addsToCart").toLocaleString("tr-TR")} />
          <MetricTile label="Ödemeye geçiş" value={sum("checkouts").toLocaleString("tr-TR")} />
        </section>
      ) : null}
      {firstTouch ? <p className={styles.methodNotice}>İlk temasta ziyaretçi adımları ölçülmüyor; satış verileri gösteriliyor.</p> : null}
      <section className={styles.tablePanel}>
        <div className={styles.sectionHeading}><h2>{firstTouch ? "İlk temas" : "Son temas"} kaynakları</h2><span className={styles.tableCount}>{rows.length.toLocaleString("tr-TR")} kayıt</span></div>
        {rows.length ? (
          <div className={styles.tableScroll}>
            <table aria-label="Trafik kaynakları">
              <thead><tr><th>Kaynak</th><th>Kampanya</th><th>Ziyaretçi / sayfa</th><th>Ürün</th><th>Sepet</th><th>Ödeme</th><th>Sipariş</th><th>Satış</th><th>Terk</th><th>Geri kazanım</th></tr></thead>
              <tbody>
                {rows.map(({ commerce: row, behavior }, index) => {
                  const source = row?.source ?? behavior?.source ?? "unknown";
                  const medium = row?.medium ?? behavior?.medium ?? "unknown";
                  const campaign = row?.campaign ?? behavior?.campaign ?? null;
                  return (
                    <tr key={`${row?.touch ?? "traffic"}:${source}:${medium}:${campaign}:${row?.currency ?? "none"}:${index}`}>
                      <td data-label="Kaynak" data-primary="true"><strong>{source === "direct" ? "Doğrudan" : source === "unknown" ? "Bilinmiyor" : source}</strong><small>{medium}</small></td>
                      <td data-label="Kampanya">{campaign ?? "—"}</td>
                      <td data-label="Ziyaretçi / sayfa">{behavior?.visitors.toLocaleString("tr-TR") ?? "—"}{behavior ? <small>Sayfa {behavior.pageviews.toLocaleString("tr-TR")}</small> : null}</td>
                      <td data-label="Ürün">{behavior?.productViews.toLocaleString("tr-TR") ?? "—"}</td>
                      <td data-label="Sepet">{behavior?.addsToCart.toLocaleString("tr-TR") ?? "—"}</td>
                      <td data-label="Ödeme">{behavior?.checkouts.toLocaleString("tr-TR") ?? "—"}</td>
                      <td data-label="Sipariş">{row?.paidOrders.toLocaleString("tr-TR") ?? "0"}</td>
                      <td data-label="Satış"><strong>{row ? money(row.grossRevenueMinor, row.currency) : "—"}</strong></td>
                      <td data-label="Terk">{row?.abandonedCarts.toLocaleString("tr-TR") ?? "0"}</td>
                      <td data-label="Geri kazanım">{row ? money(row.recoveredRevenueMinor, row.currency) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.quietState}>Bu filtrelerde kaynak yok.</p>}
      </section>
    </div>
  );
}

function Products({
  data,
  href,
}: Readonly<{
  data: Payload;
  href: (patch: Record<string, string | null>) => string;
}>) {
  const page = data.commerce.productPage;
  return (
    <div className={styles.detailPage}>
      <section className={styles.tablePanel}>
        <div className={styles.sectionHeading}><h2>Ürün performansı</h2><span className={styles.tableCount}>{page.totalItems.toLocaleString("tr-TR")} kayıt</span></div>
        {data.commerce.products.length ? (
          <div className={styles.tableScroll}>
            <table aria-label="Ürün performansı">
              <thead><tr><th>Ürün</th><th>Görüntüleme</th><th>Sepete ekleme</th><th>Ödeme</th><th>Sipariş</th><th>Satılan</th><th>Satış</th><th>Terk</th><th>Geri kazanım</th></tr></thead>
              <tbody>
                {data.commerce.products.map((row) => {
                  const viewed = analyticsProductMetricCount(data.traffic, "views", row.productId);
                  const added = analyticsProductMetricCount(data.traffic, "adds", row.productId);
                  return (
                    <tr key={`${row.productId}:${row.currency}`}>
                      <td data-label="Ürün" data-primary="true"><div className={styles.productIdentity}><ProductThumbnail imageUrl={row.imageUrl} className={styles.productIcon} /><span><strong>{row.title}</strong><small>{row.categoryName ?? "—"} · {row.brandName ?? "—"}</small></span></div></td>
                      <td data-label="Görüntüleme">{viewed?.toLocaleString("tr-TR") ?? "—"}</td>
                      <td data-label="Sepete ekleme">{added?.toLocaleString("tr-TR") ?? "—"}</td>
                      <td data-label="Ödeme">{row.checkoutStarts.toLocaleString("tr-TR")}</td>
                      <td data-label="Sipariş">{row.paidOrders.toLocaleString("tr-TR")}</td>
                      <td data-label="Satılan">{row.quantity.toLocaleString("tr-TR")}</td>
                      <td data-label="Satış"><strong>{money(row.revenueMinor, row.currency)}</strong></td>
                      <td data-label="Terk">{row.abandonedAppearances.toLocaleString("tr-TR")}</td>
                      <td data-label="Geri kazanım">{money(row.recoveredRevenueMinor, row.currency)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className={styles.quietState}>Bu filtrelerde ürün yok.</p>}
      </section>
      <nav aria-label="Ürün listesi sayfaları" className={styles.pagination}>
        {page.page > 1 ? <Link href={href({ page: String(page.page - 1) })}>Önceki</Link> : <span aria-disabled="true">Önceki</span>}
        <span>{page.page} / {Math.max(page.totalPages, 1)}</span>
        {page.page < page.totalPages ? <Link href={href({ page: String(page.page + 1) })}>Sonraki</Link> : <span aria-disabled="true">Sonraki</span>}
      </nav>
    </div>
  );
}
