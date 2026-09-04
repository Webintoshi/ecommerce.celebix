"use client";

import Link from "next/link";
import {
  useRouter,
  useSearchParams,
  type ReadonlyURLSearchParams,
} from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

import {
  PanelEmptyState,
  PanelMetricCard,
  PanelPageHeader,
  PanelPageShell,
} from "@/components/panel/PanelPageShell";
import {
  analyticsTrafficMetric,
  analyticsTrafficSources,
} from "@/lib/analytics-ui/traffic";
import styles from "./commerce-analytics-workspace.module.css";
import { ActiveVisitorsCard } from "./ActiveVisitorsCard";

const TABS = [
  ["overview", "Genel Bakış"],
  ["funnel", "Dönüşüm Hunisi"],
  ["carts", "Sepet ve Checkout"],
  ["acquisition", "Trafik Kaynakları"],
  ["products", "Ürün Performansı"],
] as const;
const ROUTES = Object.freeze({
  overview: "/api/analytics/overview",
  funnel: "/api/analytics/funnel",
  carts: "/api/analytics/abandoned-carts",
  acquisition: "/api/analytics/acquisition",
  products: "/api/analytics/products",
});
const FUNNEL = [
  ["product_view", "Product view"],
  ["add_to_cart", "Add to cart"],
  ["view_cart", "View cart"],
  ["begin_checkout", "Begin checkout"],
  ["payment_method_selected", "Payment method selected"],
  ["purchase", "Paid purchase"],
] as const;
const DEGRADED =
  "Trafik verileri geçici olarak alınamıyor. Sipariş ve sepet verileri günceldir.";
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
    if (!text(row.startsAt, 40) || !code(row.currency))
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
    Object.values(status).some(
      (field) => typeof field === "number" && field < 0,
    )
  )
    throw Error("invalid_response");
  return Object.freeze({
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
    !text(rawRange.start, 40) ||
    !text(rawRange.end, 40) ||
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
    ? "Hesaplanamadı"
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
function analyticsDay(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
function items(
  value: unknown,
  path?: string,
): readonly Readonly<{ label: string; value: number }>[] {
  if (!value || typeof value !== "object") return [];
  let selected = value as Record<string, unknown>;
  if (path) {
    const nested = selected[path];
    if (!nested || typeof nested !== "object") return [];
    selected = nested as Record<string, unknown>;
  }
  if (!Array.isArray(selected.items)) return [];
  return Object.freeze(
    selected.items.flatMap((entry) => {
      const row = entry as Record<string, unknown>,
        count = integer(row?.value);
      return text(row?.label, 200) && count >= 0
        ? [{ label: String(row.label), value: count }]
        : [];
    }),
  );
}
function eventCounts(value: unknown) {
  return Object.freeze(
    Object.fromEntries(
      items(value, "events").map((row) => [row.label, row.value]),
    ) as Record<string, number>,
  );
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
    visitors < 0 ||
    pageviews < 0 ||
    visits < 0 ||
    bounceRateBasisPoints < 0 ||
    bounceRateBasisPoints > 10_000 ||
    averageVisitSeconds < 0
  )
    return null;
  const series = (
    Array.isArray(raw.visitsSeries) ? raw.visitsSeries : []
  ).flatMap((entry) => {
    const row = entry as Record<string, unknown>;
    return text(row?.at, 40) && integer(row?.value) >= 0
      ? [{ at: String(row.at), value: integer(row.value) }]
      : [];
  });
  return {
    visitors,
    pageviews,
    visits,
    bounceRateBasisPoints,
    averageVisitSeconds,
    series,
  };
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
    ? "Hesaplanamadı"
    : percent((current - previous) / previous);
}

function Bars({
  title,
  rows,
  format = (value) => value.toLocaleString("tr-TR"),
}: Readonly<{
  title: string;
  rows: readonly Readonly<{ label: string; value: number }>[];
  format?: (value: number) => string;
}>) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className={styles.chart}>
      <h3>{title}</h3>
      {rows.length ? (
        <div className={styles.bars}>
          {rows.map((row) => (
            <div className={styles.barRow} key={row.label}>
              <span>{row.label}</span>
              <i
                style={
                  {
                    "--bar": `${Math.max(2, (row.value / max) * 100)}%`,
                  } as CSSProperties
                }
              />
              <strong>{format(row.value)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p>Bu dönem için veri yok.</p>
      )}
    </section>
  );
}
function UnavailableChart({ title }: Readonly<{ title: string }>) {
  return (
    <section className={styles.chart}>
      <h3>{title}</h3>
      <p>Trafik verisi geçici olarak kullanılamıyor.</p>
    </section>
  );
}
function CurrencyCards({
  bucket,
  visitors,
}: Readonly<{ bucket: Currency; visitors: number | null }>) {
  const paidConversion =
      visitors && visitors > 0 ? bucket.paidOrders / visitors : null,
    average = bucket.paidOrders
      ? bucket.grossRevenueMinor / bucket.paidOrders
      : null,
    recovery = bucket.abandonedCarts
      ? bucket.recoveredCarts / bucket.abandonedCarts
      : null;
  return (
    <section className={styles.metrics}>
      <PanelMetricCard
        label={`${bucket.currency} paid sipariş`}
        value={bucket.paidOrders.toLocaleString("tr-TR")}
        detail={`Paid dönüşüm ${percent(paidConversion)}`}
      />
      <PanelMetricCard
        label={`${bucket.currency} ciro`}
        value={money(bucket.grossRevenueMinor, bucket.currency)}
        detail={`İade ${money(bucket.refundedMinor, bucket.currency)}`}
      />
      <PanelMetricCard
        label="Ortalama sepet"
        value={
          average === null ? "Hesaplanamadı" : money(average, bucket.currency)
        }
        detail="Captured gross / paid order"
      />
      <PanelMetricCard
        label="Terk edilmiş sepet"
        value={bucket.abandonedCarts.toLocaleString("tr-TR")}
        detail={money(bucket.abandonedValueMinor, bucket.currency)}
      />
      <PanelMetricCard
        label="Geri kazanılan"
        value={bucket.recoveredCarts.toLocaleString("tr-TR")}
        detail={`Oran ${percent(recovery)}`}
      />
      <PanelMetricCard
        label="Geri kazanılan ciro"
        value={money(bucket.recoveredNetMinor, bucket.currency)}
        detail={`Brüt ${money(bucket.recoveredGrossMinor, bucket.currency)} · İade ${money(bucket.recoveredRefundedMinor, bucket.currency)} · Net ${money(bucket.recoveredNetMinor, bucket.currency)}`}
      />
    </section>
  );
}
function FunnelPanel({
  events,
  paidOrders,
}: Readonly<{
  events: Readonly<Record<string, number>>;
  paidOrders: number;
}>) {
  const steps = [
      ...FUNNEL.map(([eventName, label]) => ({
        eventName,
        label,
        value: events[eventName] ?? null,
      })),
    ] as const,
    first = steps[0].value,
    checkoutSessions = events.begin_checkout ?? null,
    checkoutConversion =
      checkoutSessions !== null && checkoutSessions > 0
        ? paidOrders / checkoutSessions
        : null;
  return (
    <section className={styles.panel}>
      <h2>Dönüşüm adımları</h2>
      <div className={styles.metrics}>
        <PanelMetricCard
          label="Checkout dönüşümü"
          value={percent(checkoutConversion)}
          detail="Captured paid purchase / Umami unique session begin_checkout"
        />
      </div>
      <ol className={styles.funnel}>
        {steps.map((step, index) => {
          const prior = index ? steps[index - 1]!.value : null,
            priorRate =
              step.value !== null && prior !== null && prior > 0
                ? step.value / prior
                : null,
            firstRate =
              step.value !== null && first !== null && first > 0
                ? step.value / first
                : null,
            loss =
              step.value !== null && prior !== null
                ? Math.max(0, prior - step.value)
                : null,
            lossRate =
              loss !== null && prior !== null && prior > 0
                ? loss / prior
                : null;
          return (
            <li key={step.eventName}>
              <strong>{step.label}</strong>
              <span>
                {step.value === null
                  ? "Hesaplanamadı"
                  : step.value.toLocaleString("tr-TR")}
              </span>
              <small>
                Önceki: {index ? percent(priorRate) : "Başlangıç"} · İlk adıma
                göre: {percent(firstRate)} · Kayıp:{" "}
                {loss === null ? "Hesaplanamadı" : loss.toLocaleString("tr-TR")}{" "}
                ({percent(lossRate)})
              </small>
            </li>
          );
        })}
      </ol>
      <p className={styles.definition}>
        Tüm adımlar privacy-safe opaque session reference ile sıralanmış unique
        oturumlardır; purchase yalnız PostgreSQL captured sipariş outbox
        eventidir.
      </p>
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
          <option value="">Tümü (ayrı)</option>
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
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
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
            Campaign
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
              {[
                "active",
                "candidate",
                "abandoned",
                "resumed",
                "converted_pending_payment",
                "recovered",
                "expired",
              ].map((value) => (
                <option key={value}>{value}</option>
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
            Min tutar (minor-unit)
            <input
              name="minValue"
              defaultValue={params.get("minValue") ?? ""}
              inputMode="numeric"
              pattern="(0|[1-9][0-9]{0,14})"
            />
          </label>
          <label>
            Maks tutar (minor-unit)
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
            Campaign
            <input
              name="campaign"
              defaultValue={params.get("campaign") ?? ""}
            />
          </label>
          <label>
            Cihaz
            <select name="device" defaultValue={params.get("device") ?? ""}>
              <option value="">Tümü</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
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
            Attribution
            <select name="touch" defaultValue={params.get("touch") ?? "last"}>
              <option value="last">Last-touch</option>
              <option value="first">First-touch</option>
            </select>
          </label>
          <label>
            Kaynak
            <input name="source" defaultValue={params.get("source") ?? ""} />
          </label>
          <label>
            Campaign
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
            Global ürün arama
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
      <button type="submit">Filtreleri uygula</button>
    </form>
  );
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
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"),
    [data, setData] = useState<Payload>(),
    [error, setError] = useState("");
  const apiQuery = useMemo(() => {
    const query = new URLSearchParams(serialized);
    query.delete("tab");
    if (!query.has("timezone") && timezone) query.set("timezone", timezone);
    if (range !== "custom" && !query.has("range")) query.set("range", range);
    return query.toString();
  }, [range, serialized, timezone]);
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
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(undefined);
          setError("Analitik veriler şu anda yüklenemiyor.");
          setState("error");
        }
      });
    return () => controller.abort();
  }, [apiQuery, tab]);
  const traffic = useMemo(() => trafficSummary(data?.traffic), [data?.traffic]),
    events = useMemo(() => eventCounts(data?.traffic), [data?.traffic]),
    previousTraffic = useMemo(
      () => trafficSummary(data?.comparisonTraffic),
      [data?.comparisonTraffic],
    ),
    previousEvents = useMemo(
      () => eventCounts(data?.comparisonTraffic),
      [data?.comparisonTraffic],
    );
  const href = (patch: Record<string, string | null>) => {
    const query = new URLSearchParams(serialized);
    for (const [key, value] of Object.entries(patch))
      value === null ? query.delete(key) : query.set(key, value);
    return `/analytics?${query.toString()}`;
  };
  const tabHref = (next: Tab) => {
    const query = new URLSearchParams(serialized);
    const allowed = new Set<string>([
      "range",
      "from",
      "to",
      "timezone",
      "compare",
      "currency",
      ...(next === "funnel"
        ? ["device", "source", "campaign", "product", "category"]
        : next === "carts"
          ? [
              "lifecycle",
              "contact",
              "minValue",
              "maxValue",
              "source",
              "campaign",
              "device",
              "search",
              "page",
            ]
          : next === "acquisition"
            ? ["touch", "source", "campaign"]
            : next === "products"
              ? [
                  "search",
                  "product",
                  "category",
                  "brand",
                  "source",
                  "campaign",
                  "device",
                  "page",
                ]
              : []),
    ]);
    for (const key of [...query.keys()])
      if (key !== "tab" && !allowed.has(key)) query.delete(key);
    query.set("tab", next);
    return `/analytics?${query.toString()}`;
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
    router.push(`/analytics?${query.toString()}`);
  }
  const activeTimezone = data?.range.timezone ?? timezone ?? "UTC",
    current = data?.commerce.currencies ?? [],
    previous = data?.comparisonCommerce?.currencies ?? [];
  return (
    <PanelPageShell>
      <div className={styles.root}>
        <PanelPageHeader
          title="Ticaret Analitiği"
          description="Anonim trafik Umami’den; sipariş, gelir ve sepet sonuçları PostgreSQL’den gelir."
        />
        <nav className={styles.tabs} aria-label="Analitik bölümleri">
          {TABS.map(([value, label]) => (
            <Link
              key={value}
              aria-current={value === tab ? "page" : undefined}
              className={value === tab ? styles.activeTab : styles.tab}
              href={tabHref(value)}
            >
              {label}
            </Link>
          ))}
        </nav>
        <section
          className={styles.controls}
          aria-label="Analitik tarih aralığı"
        >
          <span>Tarih</span>
          {(["today", "7d", "30d", "90d"] as const).map((value) => (
            <Link
              key={value}
              href={href({
                range: value,
                from: null,
                to: null,
                timezone: timezone ?? null,
              })}
            >
              {value === "today" ? "Bugün" : `Son ${value.slice(0, -1)} gün`}
            </Link>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (from && to)
                router.push(
                  href({
                    range: null,
                    from,
                    to,
                    timezone: timezone ?? null,
                    compare: null,
                  }),
                );
            }}
          >
            <label>
              Başlangıç
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                required
              />
            </label>
            <label>
              Bitiş
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                required
              />
            </label>
            <button type="submit">Özel aralığı uygula</button>
          </form>
          {range !== "custom" ? (
            <Link
              href={href({ compare: compare ? null : "1" })}
              aria-pressed={compare}
            >
              {compare ? "Önceki dönem: açık" : "Önceki dönemle karşılaştır"}
            </Link>
          ) : null}
          <label>
            Timezone
            <input
              value={timezoneDraft}
              maxLength={64}
              onChange={(event) => setTimezoneDraft(event.currentTarget.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              try {
                new Intl.DateTimeFormat("en", { timeZone: timezoneDraft });
                setTimezone(timezoneDraft);
                router.push(href({ timezone: timezoneDraft }));
              } catch {
                setError("Geçerli bir IANA saat dilimi girin.");
              }
            }}
          >
            Saat dilimini uygula
          </button>
        </section>
        <FilterForm
          tab={tab}
          params={new URLSearchParams(serialized)}
          currencies={[...new Set(current.map((row) => row.currency))]}
          onSubmit={filters}
        />
        {state === "loading" ? (
          <div className={styles.loading} role="status">
            Analitik yükleniyor…
          </div>
        ) : null}
        {state === "error" ? (
          <PanelEmptyState title="Analitik yüklenemedi" description={error} />
        ) : null}
        {state === "ready" && data ? (
          <>
            {data.status === "degraded" ? (
              <div className={styles.warning} role="status">
                <strong>{data.message ?? DEGRADED}</strong>
              </div>
            ) : null}
            {compare && data.comparisonCommerce ? (
              <section
                className={styles.comparison}
                aria-label="Önceki dönem karşılaştırması"
              >
                <strong>Önceki dönem karşılaştırması</strong>
                {[
                  ...new Set(
                    [...current, ...previous].map((row) => row.currency),
                  ),
                ].map((currency) => {
                  const active = current.find(
                      (row) => row.currency === currency,
                    ),
                    prior = previous.find((row) => row.currency === currency);
                  return (
                    <span key={currency}>
                      {currency}: paid {active?.paidOrders ?? 0} /{" "}
                      {prior?.paidOrders ?? 0} · ciro{" "}
                      {money(active?.grossRevenueMinor ?? 0, currency)} /{" "}
                      {money(prior?.grossRevenueMinor ?? 0, currency)} · terk{" "}
                      {active?.abandonedCarts ?? 0} /{" "}
                      {prior?.abandonedCarts ?? 0} · geri kazanılan{" "}
                      {active?.recoveredCarts ?? 0} /{" "}
                      {prior?.recoveredCarts ?? 0}
                    </span>
                  );
                })}
                <span>
                  Ziyaretçiler: {traffic?.visitors ?? "Kullanılamıyor"} /{" "}
                  {previousTraffic?.visitors ?? "Kullanılamıyor"} · delta{" "}
                  {delta(
                    traffic?.visitors ?? null,
                    previousTraffic?.visitors ?? null,
                  )}
                </span>
                <span>
                  Sayfa görüntülemeleri:{" "}
                  {traffic?.pageviews ?? "Kullanılamıyor"} /{" "}
                  {previousTraffic?.pageviews ?? "Kullanılamıyor"} · delta{" "}
                  {delta(
                    traffic?.pageviews ?? null,
                    previousTraffic?.pageviews ?? null,
                  )}
                </span>
                <span>
                  Sepete ekleme oranı delta{" "}
                  {delta(
                    events.product_view
                      ? (events.add_to_cart ?? 0) / events.product_view
                      : null,
                    previousEvents.product_view
                      ? (previousEvents.add_to_cart ?? 0) /
                          previousEvents.product_view
                      : null,
                  )}
                </span>
                <span>
                  Checkout başlatma oranı delta{" "}
                  {delta(
                    events.add_to_cart
                      ? (events.begin_checkout ?? 0) / events.add_to_cart
                      : null,
                    previousEvents.add_to_cart
                      ? (previousEvents.begin_checkout ?? 0) /
                          previousEvents.add_to_cart
                      : null,
                  )}
                </span>
              </section>
            ) : null}
            {tab === "overview" ? (
              <Overview
                data={data}
                traffic={traffic}
                events={events}
                timezone={activeTimezone}
              />
            ) : null}
            {tab === "funnel" ? (
              <>
                <FunnelPanel
                  events={events}
                  paidOrders={data.commerce.currencies.reduce(
                    (total, bucket) => total + bucket.paidOrders,
                    0,
                  )}
                />
                {current.map((bucket) => (
                  <CurrencyCards
                    key={bucket.currency}
                    bucket={bucket}
                    visitors={null}
                  />
                ))}
              </>
            ) : null}
            {tab === "carts" ? (
              <Carts data={data} href={href} timezone={activeTimezone} />
            ) : null}
            {tab === "acquisition" ? (
              <Acquisition data={data} params={searchParams} />
            ) : null}
            {tab === "products" ? <Products data={data} href={href} /> : null}
            {!current.length && tab !== "products" && tab !== "carts" ? (
              <PanelEmptyState
                title="Bu dönemde ticari hareket yok"
                description="Veri yok durumu servis kesintisinden ayrı gösterilir."
              />
            ) : null}
            <section className={styles.health}>
              <h2>Event teslimat sağlığı</h2>
              <span>Bekleyen {data.commerce.worker.pending}</span>
              <span>Claimed {data.commerce.worker.claimed}</span>
              <span>Retry {data.commerce.worker.retry}</span>
              <span>Dead-letter {data.commerce.worker.deadLetter}</span>
              <span>
                En eski {data.commerce.worker.oldestPendingSeconds} sn
              </span>
              <span>
                Son başarılı teslimat{" "}
                {data.commerce.worker.lastSuccessfulDelivery
                  ? date(
                      data.commerce.worker.lastSuccessfulDelivery,
                      activeTimezone,
                    )
                  : "Yok"}
              </span>
              <span>
                Teslimat gecikmesi{" "}
                {data.commerce.worker.deliveryLatencyMilliseconds} ms
              </span>
            </section>
          </>
        ) : null}
        <footer className={styles.footer}>
          <Link href="/settings/analytics">Analitik ayarları</Link>
          <span>Session replay kapalıdır.</span>
        </footer>
      </div>
    </PanelPageShell>
  );
}

function Overview({
  data,
  traffic,
  events,
  timezone,
}: Readonly<{
  data: Payload;
  traffic: ReturnType<typeof trafficSummary>;
  events: Readonly<Record<string, number>>;
  timezone: string;
}>) {
  const sources = analyticsTrafficSources(data.traffic),
    pages = analyticsTrafficMetric(data.traffic, "path"),
    referrers = analyticsTrafficMetric(data.traffic, "referrer"),
    devices = analyticsTrafficMetric(data.traffic, "device"),
    countries = analyticsTrafficMetric(data.traffic, "country");
  return (
    <>
      {
        <section className={styles.metrics}>
          <ActiveVisitorsCard />
          <PanelMetricCard
            label="Ziyaretçiler"
            value={
              traffic
                ? traffic.visitors.toLocaleString("tr-TR")
                : "Kullanılamıyor"
            }
          />
          <PanelMetricCard
            label="Sayfa görüntülemeleri"
            value={
              traffic
                ? traffic.pageviews.toLocaleString("tr-TR")
                : "Kullanılamıyor"
            }
          />
          <PanelMetricCard
            label="Oturumlar"
            value={
              traffic
                ? traffic.visits.toLocaleString("tr-TR")
                : "Kullanılamıyor"
            }
          />
          <PanelMetricCard
            label="Hemen çıkma oranı"
            value={
              traffic
                ? percent(traffic.bounceRateBasisPoints / 10_000)
                : "Kullanılamıyor"
            }
          />
          <PanelMetricCard
            label="Ortalama oturum süresi"
            value={
              traffic
                ? `${traffic.averageVisitSeconds.toLocaleString("tr-TR")} sn`
                : "Kullanılamıyor"
            }
          />
          <PanelMetricCard
            label="Sepete ekleme oranı"
            value={percent(
              (events.product_view ?? 0) > 0
                ? (events.add_to_cart ?? 0) / (events.product_view ?? 1)
                : null,
            )}
          />
          <PanelMetricCard
            label="Checkout başlatma oranı"
            value={percent(
              (events.add_to_cart ?? 0) > 0
                ? (events.begin_checkout ?? 0) / (events.add_to_cart ?? 1)
                : null,
            )}
          />
        </section>
      }
      {data.commerce.currencies.map((bucket) => (
        <CurrencyCards
          key={bucket.currency}
          bucket={bucket}
          visitors={traffic?.visitors ?? null}
        />
      ))}
      <div className={styles.chartGrid}>
        {traffic ? (
          <Bars
            title="Ziyaretçi zaman serisi"
            rows={traffic.series.map((row) => ({
              label: new Date(row.at).toLocaleDateString("tr-TR", {
                timeZone: timezone,
              }),
              value: row.value,
            }))}
          />
        ) : (
          <UnavailableChart title="Ziyaretçi zaman serisi" />
        )}
        <Bars
          title="Ciro zaman serisi"
          rows={data.commerce.series.map((row) => ({
            label: `${new Date(row.startsAt).toLocaleDateString("tr-TR", { timeZone: timezone })} · ${row.currency}`,
            value: row.grossRevenueMinor,
          }))}
        />
        <Bars
          title="Paid sipariş zaman serisi"
          rows={data.commerce.series.map((row) => ({
            label: `${new Date(row.startsAt).toLocaleDateString("tr-TR", { timeZone: timezone })} · ${row.currency}`,
            value: row.paidOrders,
          }))}
        />
        {traffic ? (
          <Bars
            title="Paid dönüşüm zaman serisi (binde)"
            rows={data.commerce.series.flatMap((row) => {
              const visitors =
                traffic.series.find(
                  (point) =>
                    analyticsDay(point.at, timezone) ===
                    analyticsDay(row.startsAt, timezone),
                )?.value ?? 0;
              return visitors > 0
                ? [
                    {
                      label: `${new Date(row.startsAt).toLocaleDateString("tr-TR", { timeZone: timezone })} · ${row.currency}`,
                      value: Math.round((row.paidOrders / visitors) * 1000),
                    },
                  ]
                : [];
            })}
          />
        ) : (
          <UnavailableChart title="Paid dönüşüm zaman serisi (binde)" />
        )}
        <Bars
          title="Terk / geri kazanım trendi"
          rows={data.commerce.series.flatMap((row) => [
            {
              label: `${new Date(row.startsAt).toLocaleDateString("tr-TR", { timeZone: timezone })} terk`,
              value: row.abandonedCarts,
            },
            {
              label: `${new Date(row.startsAt).toLocaleDateString("tr-TR", { timeZone: timezone })} geri`,
              value: row.recoveredCarts,
            },
          ])}
        />
        {sources !== null ? (
          <Bars
            title="Trafik kaynağı dağılımı"
            rows={sources.slice(0, 10)}
          />
        ) : (
          <UnavailableChart title="Trafik kaynağı dağılımı" />
        )}
        {pages !== null ? (
          <Bars
            title="En çok görüntülenen sayfalar"
            rows={pages.slice(0, 10)}
          />
        ) : (
          <UnavailableChart title="En çok görüntülenen sayfalar" />
        )}
        {referrers !== null ? (
          <Bars title="Yönlendiren kaynaklar" rows={referrers.slice(0, 10)} />
        ) : (
          <UnavailableChart title="Yönlendiren kaynaklar" />
        )}
        {devices !== null ? (
          <Bars title="Cihaz dağılımı" rows={devices.slice(0, 10)} />
        ) : (
          <UnavailableChart title="Cihaz dağılımı" />
        )}
        {countries !== null ? (
          <Bars title="Ülke dağılımı" rows={countries.slice(0, 10)} />
        ) : (
          <UnavailableChart title="Ülke dağılımı" />
        )}
      </div>
    </>
  );
}
function Carts({
  data,
  href,
  timezone,
}: Readonly<{
  data: Payload;
  href: (patch: Record<string, string | null>) => string;
  timezone: string;
}>) {
  return (
    <>
      <section className={styles.metrics}>
        {data.commerce.currencies.flatMap((bucket) => [
          <PanelMetricCard
            key={`${bucket.currency}:active`}
            label={`${bucket.currency} aktif / terk adayı`}
            value={`${bucket.activeCarts} / ${bucket.candidateCarts}`}
            detail={`Uygun sepet ${bucket.eligibleCarts}`}
          />,
          <PanelMetricCard
            key={`${bucket.currency}:checkout`}
            label={`${bucket.currency} checkout / terk`}
            value={`${bucket.checkoutStarts} / ${bucket.checkoutAbandoned}`}
            detail={`Uygun başlangıç ${bucket.eligibleCheckoutStarts} · Terk oranı ${percent(bucket.eligibleCheckoutStarts ? bucket.checkoutAbandoned / bucket.eligibleCheckoutStarts : null)}`}
          />,
          <PanelMetricCard
            key={`${bucket.currency}:failed`}
            label={`${bucket.currency} ödeme başarısızlığı`}
            value={bucket.paymentFailures.toLocaleString("tr-TR")}
            detail={`Başarısızlık oranı ${percent(bucket.checkoutStarts ? bucket.paymentFailures / bucket.checkoutStarts : null)}`}
          />,
          <PanelMetricCard
            key={`${bucket.currency}:recovery`}
            label={`${bucket.currency} terk / recovery`}
            value={`${bucket.abandonedCarts} / ${bucket.recoveredCarts}`}
            detail={`${money(bucket.abandonedValueMinor, bucket.currency)} terk değer · Terk oranı ${percent(bucket.eligibleCarts ? bucket.abandonedCarts / bucket.eligibleCarts : null)} · Recovery ${percent(bucket.abandonedCarts ? bucket.recoveredCarts / bucket.abandonedCarts : null)}`}
          />,
          <PanelMetricCard
            key={`${bucket.currency}:recovered-revenue`}
            label={`${bucket.currency} geri kazanılan ciro`}
            value={money(bucket.recoveredNetMinor, bucket.currency)}
            detail={`Brüt ${money(bucket.recoveredGrossMinor, bucket.currency)} · İade ${money(bucket.recoveredRefundedMinor, bucket.currency)} · Net ${money(bucket.recoveredNetMinor, bucket.currency)}`}
          />,
        ])}
      </section>
      <section className={styles.tablePanel}>
        <h2>Sepet ve checkout listesi</h2>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Ürünler</th>
                <th>Değer</th>
                <th>Son hareket / terk</th>
                <th>Kaynak</th>
                <th>Cihaz</th>
                <th>Durum</th>
                <th>İletişim</th>
                <th>Aksiyon</th>
              </tr>
            </thead>
            <tbody>
              {data.commerce.carts.map((cart) => (
                <tr key={cart.id}>
                  <td>{cart.customerLabel}</td>
                  <td>{cart.productSummary}</td>
                  <td>
                    <strong>{money(cart.totalMinor, cart.currency)}</strong>
                    <small>
                      Ara {money(cart.subtotalMinor, cart.currency)} · İndirim{" "}
                      {money(cart.discountMinor, cart.currency)} · Kargo{" "}
                      {money(cart.shippingMinor, cart.currency)}
                    </small>
                  </td>
                  <td>
                    {date(cart.lastActivityAt, timezone)}
                    <small>
                      {cart.abandonedAt
                        ? `Terk ${date(cart.abandonedAt, timezone)}`
                        : "Terk edilmedi"}
                    </small>
                  </td>
                  <td>
                    {cart.source}
                    <small>{cart.campaign ?? "Campaign yok"}</small>
                  </td>
                  <td>{cart.device}</td>
                  <td>{cart.lifecycle}</td>
                  <td>
                    {cart.contacted
                      ? "İletişim kuruldu"
                      : cart.contactable
                        ? "Kurulabilir"
                        : "Kurulamaz"}
                  </td>
                  <td>
                    <Link href={`/orders/abandoned-carts/${cart.id}`}>
                      Detay / aksiyonlar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.commerce.carts.length ? (
          <p>Filtrelerle eşleşen sepet yok.</p>
        ) : null}
      </section>
      <nav aria-label="Sepet listesi sayfaları" className={styles.pagination}>
        <Link
          aria-disabled={data.commerce.cartPage.page <= 1}
          href={
            data.commerce.cartPage.page <= 1
              ? href({ page: "1" })
              : href({ page: String(data.commerce.cartPage.page - 1) })
          }
        >
          Önceki
        </Link>
        <span>
          Sayfa {data.commerce.cartPage.page} /{" "}
          {Math.max(data.commerce.cartPage.totalPages, 1)} ·{" "}
          {data.commerce.cartPage.totalItems.toLocaleString("tr-TR")} sepet
        </span>
        <Link
          aria-disabled={
            data.commerce.cartPage.page >= data.commerce.cartPage.totalPages
          }
          href={
            data.commerce.cartPage.page >= data.commerce.cartPage.totalPages
              ? href({ page: String(data.commerce.cartPage.page) })
              : href({ page: String(data.commerce.cartPage.page + 1) })
          }
        >
          Sonraki
        </Link>
      </nav>
    </>
  );
}
function Acquisition({
  data,
  params,
}: Readonly<{ data: Payload; params: ReadonlyURLSearchParams }>) {
  const firstTouch = params.get("touch") === "first",
    behavioral = firstTouch ? [] : acquisitionRows(data.traffic),
    sum = (
      key: keyof Pick<
        AcquisitionTraffic,
        "productViews" | "addsToCart" | "checkouts"
      >,
    ) => behavioral.reduce((value, row) => value + row[key], 0),
    behaviorFor = (row: Payload["commerce"]["attribution"][number]) =>
      behavioral.find(
        (item) =>
          item.source === row.source &&
          item.medium === row.medium &&
          (item.campaign ?? null) === (row.campaign ?? null),
      ),
    rows = [
      ...data.commerce.attribution.map((commerce) => ({
        commerce,
        behavior: behaviorFor(commerce),
      })),
      ...behavioral
        .filter(
          (behavior) =>
            !data.commerce.attribution.some(
              (commerce) =>
                commerce.source === behavior.source &&
                commerce.medium === behavior.medium &&
                (commerce.campaign ?? null) === (behavior.campaign ?? null),
            ),
        )
        .map((behavior) => ({ commerce: null, behavior })),
    ];
  return (
    <>
      <section className={styles.metrics}>
        <PanelMetricCard
          label="Seçili trafik kohortu product view"
          value={
            data.traffic === null || firstTouch
              ? "Kullanılamıyor"
              : sum("productViews").toLocaleString("tr-TR")
          }
        />
        <PanelMetricCard
          label="Seçili trafik kohortu add to cart"
          value={
            data.traffic === null || firstTouch
              ? "Kullanılamıyor"
              : sum("addsToCart").toLocaleString("tr-TR")
          }
        />
        <PanelMetricCard
          label="Seçili trafik kohortu checkout"
          value={
            data.traffic === null || firstTouch
              ? "Kullanılamıyor"
              : sum("checkouts").toLocaleString("tr-TR")
          }
        />
      </section>
      {firstTouch ? (
        <p>
          First-touch ticari sonuçlar PostgreSQL kaynağından gösterilir. Umami
          ziyaretçi ve davranış metrikleri first-touch özelliği taşımadığı için
          yanlış kohort eşleştirmemek adına kullanılamıyor olarak bırakılır.
        </p>
      ) : null}
      <section className={styles.tablePanel}>
        <h2>
          {params.get("touch") === "first" ? "First-touch" : "Last-touch"}{" "}
          trafik kaynakları
        </h2>
        <div className={styles.tableScroll}>
          <table>
            <thead>
              <tr>
                <th>Source / medium</th>
                <th>Campaign</th>
                <th>Visitors</th>
                <th>Product views</th>
                <th>Add to cart</th>
                <th>Checkout</th>
                <th>Paid / conversion</th>
                <th>Revenue</th>
                <th>Abandoned</th>
                <th>Recovered revenue</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ commerce: row, behavior }, index) => {
                const source = row?.source ?? behavior?.source ?? "unknown",
                  medium = row?.medium ?? behavior?.medium ?? "unknown",
                  campaign = row?.campaign ?? behavior?.campaign ?? null;
                return (
                  <tr
                    key={`${row?.touch ?? "traffic"}:${source}:${medium}:${campaign}:${row?.currency ?? "none"}:${index}`}
                  >
                    <td>
                      {source === "direct"
                        ? "Doğrudan"
                        : source === "unknown"
                          ? "Bilinmiyor"
                          : source}{" "}
                      / {medium}
                    </td>
                    <td>{campaign ?? "—"}</td>
                    <td>{behavior?.visitors ?? "Kullanılamıyor"}</td>
                    <td>{behavior?.productViews ?? "Kullanılamıyor"}</td>
                    <td>{behavior?.addsToCart ?? "Kullanılamıyor"}</td>
                    <td>{behavior?.checkouts ?? "Kullanılamıyor"}</td>
                    <td>
                      {row?.paidOrders ?? 0} /{" "}
                      {percent(
                        behavior?.visitors && row
                          ? row.paidOrders / behavior.visitors
                          : null,
                      )}
                    </td>
                    <td>
                      {row ? money(row.grossRevenueMinor, row.currency) : "—"}
                    </td>
                    <td>{row?.abandonedCarts ?? 0}</td>
                    <td>
                      {row
                        ? money(row.recoveredRevenueMinor, row.currency)
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function Products({
  data,
  href,
}: Readonly<{
  data: Payload;
  href: (patch: Record<string, string | null>) => string;
}>) {
  const views = items(data.traffic, "views"),
    adds = items(data.traffic, "adds"),
    page = data.commerce.productPage;
  return (
    <section className={styles.tablePanel}>
      <h2>Ürün performansı</h2>
      <div className={styles.tableScroll}>
        <table>
          <thead>
            <tr>
              <th>Ürün</th>
              <th>Views</th>
              <th>Add to cart / rate</th>
              <th>Checkout</th>
              <th>Paid orders</th>
              <th>Satılan</th>
              <th>Ciro</th>
              <th>Terk görünümü</th>
              <th>Recovered revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.commerce.products.map((row) => {
              const viewed =
                  views.find((item) => item.label === row.productId)?.value ??
                  null,
                added =
                  adds.find((item) => item.label === row.productId)?.value ??
                  null;
              return (
                <tr key={`${row.productId}:${row.currency}`}>
                  <td>
                    <strong>{row.title}</strong>
                    <small>
                      {row.categoryName ?? "Kategori yok"} ·{" "}
                      {row.brandName ?? "Marka yok"}
                    </small>
                  </td>
                  <td>{viewed ?? "Kullanılamıyor"}</td>
                  <td>
                    {added ?? "Kullanılamıyor"} /{" "}
                    {percent(viewed && added !== null ? added / viewed : null)}
                  </td>
                  <td>{row.checkoutStarts}</td>
                  <td>{row.paidOrders}</td>
                  <td>{row.quantity}</td>
                  <td>{money(row.revenueMinor, row.currency)}</td>
                  <td>{row.abandonedAppearances}</td>
                  <td>{money(row.recoveredRevenueMinor, row.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav
        aria-label="Ürün performansı sayfaları"
        className={styles.pagination}
      >
        <Link
          aria-disabled={page.page <= 1}
          href={
            page.page <= 1
              ? href({ page: "1" })
              : href({ page: String(page.page - 1) })
          }
        >
          Önceki
        </Link>
        <span>
          Sayfa {page.page} / {Math.max(page.totalPages, 1)} ·{" "}
          {page.totalItems.toLocaleString("tr-TR")} ürün
        </span>
        <Link
          aria-disabled={page.page >= page.totalPages}
          href={
            page.page >= page.totalPages
              ? href({ page: String(page.page) })
              : href({ page: String(page.page + 1) })
          }
        >
          Sonraki
        </Link>
      </nav>
      <p className={styles.definition}>
        Global arama ve katalog filtreleri server-side uygulanır; tek set-based
        katalog/commerce sorgusu ve iki toplu Umami event-property sorgusu
        kullanılır.
      </p>
    </section>
  );
}
