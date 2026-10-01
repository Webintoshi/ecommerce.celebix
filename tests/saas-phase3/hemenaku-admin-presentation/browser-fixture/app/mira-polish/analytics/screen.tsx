"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { CommerceAnalyticsOverviewPresentation } from "@/components/analytics/CommerceAnalyticsWorkspace";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelPageShell } from "@/components/panel/PanelPageShell";
import { FUNNEL_STEPS } from "@/lib/analytics-ui/commerce-insights";
import analyticsStyles from "@/components/analytics/commerce-analytics-workspace.module.css";
import { analyticsFixturePayload } from "../../analytics/analytics-fixture-data";
import { MODEL } from "../../mira-catalog/catalog-fixture";
import styles from "./fixture.module.css";

export type AnalyticsPolishState = "loss" | "cart" | "missing" | "zero" | "loading" | "error";
type OverviewProps = ComponentProps<typeof CommerceAnalyticsOverviewPresentation>;

function fixtureProps(state: AnalyticsPolishState): OverviewProps {
  // Shape and calendar range reuse the existing isolated analytics fixture.
  const seed = analyticsFixturePayload("overview");
  const zero = state === "zero";
  const measured = !["missing", "loading", "error"].includes(state);
  const eventCounts = Object.fromEntries(FUNNEL_STEPS.map(([event], index) => [event,
    zero ? 0 : state === "loss" && index === 0 ? 261 : 9,
  ]));
  const daily = seed.commerce.series.map((point, index, rows) => ({
    ...point,
    paidOrders: !zero && index >= rows.length - 9 ? 1 : 0,
    grossRevenueMinor: !zero && index >= rows.length - 9 ? 199_900 : 0,
    abandonedCarts: state === "cart" && index >= rows.length - 9 ? 2 : 0,
    recoveredCarts: state === "cart" && index >= rows.length - 4 ? 1 : 0,
  }));
  const currency = {
    ...seed.commerce.currencies[0],
    activeCarts: zero ? 0 : 5,
    candidateCarts: zero ? 0 : 2,
    eligibleCarts: zero ? 0 : 24,
    checkoutStarts: zero ? 0 : 9,
    eligibleCheckoutStarts: zero ? 0 : 9,
    checkoutAbandoned: 0,
    paymentFailures: 0,
    paidOrders: zero ? 0 : 9,
    grossRevenueMinor: zero ? 0 : 1_799_100,
    refundedMinor: 0,
    abandonedCarts: state === "cart" ? 18 : 0,
    abandonedValueMinor: state === "cart" ? 3_598_200 : 0,
    recoveredCarts: state === "cart" ? 4 : 0,
    recoveredGrossMinor: state === "cart" ? 799_600 : 0,
    recoveredRefundedMinor: 0,
    recoveredNetMinor: state === "cart" ? 799_600 : 0,
  };
  const summary = {
    visitors: zero ? 0 : 261,
    pageviews: zero ? 0 : 520,
    visits: zero ? 0 : 261,
    bounceRateBasisPoints: zero ? 0 : 2400,
    averageVisitSeconds: zero ? 0 : 75,
    visitsSeries: daily.map((point, index) => ({ at: point.startsAt, value: zero || index === 0 ? 0 : 9 })),
  };
  const traffic = measured ? {
    summary,
    events: { items: Object.entries(eventCounts).map(([label, value]) => ({ label, value })) },
    sources: { items: zero ? [] : [{ label: "direct", value: 181 }, { label: "google", value: 80 }] },
    metrics: { path: { items: [] }, referrer: { items: [] }, device: { items: [] }, country: { items: [] } },
  } : null;
  const data: OverviewProps["data"] = {
    ...seed,
    status: measured ? "complete" : "degraded",
    message: null,
    traffic,
    comparisonTraffic: null,
    comparisonCommerce: null,
    commerce: {
      ...seed.commerce,
      currencies: [currency],
      series: daily,
      products: [],
      attribution: [],
      carts: [],
      productPage: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
      cartPage: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
    },
  };
  return {
    data,
    traffic: measured ? {
      ...summary,
      series: summary.visitsSeries,
    } : null,
    events: measured ? eventCounts : {},
    eventsAvailable: measured,
    previousTraffic: null,
    detailsData: {
      key: `isolated-polish:${state}`,
      funnel: state === "loading" ? undefined : data,
      products: data,
      funnelState: state === "loading" ? "loading" : state === "error" ? "error" : "ready",
      productsState: "ready",
    },
    compare: false,
    timezone: "Europe/Istanbul",
    selectedCurrency: currency,
    onCurrencyChange: () => undefined,
    funnelHref: "/analytics?tab=funnel&range=30d",
    sourcesHref: "/analytics?tab=acquisition&range=30d",
    productsHref: "/analytics?tab=products&range=30d",
    cartsHref: "/analytics?tab=carts&range=30d",
    wideRangeHref: "/analytics?range=90d",
    range: "30d",
  };
}

export function AnalyticsPolishFixtureScreen({ state }: Readonly<{ state: AnalyticsPolishState }>) {
  return <PanelLayoutClient model={{ ...MODEL, analyticsAvailable: true, storeSlug: "mira-polish-fixture", membershipLabel: "QA fixture · canlı değil" }}>
    <PanelPageShell>
      <div className={styles.evidence} data-evidence="isolated-analytics-polish-fixture">
        <p className={styles.notice} role="note">İzole görsel test · Örnek veriler, canlı mağaza değildir.</p>
        <nav className={styles.states} aria-label="Görsel test durumları">
          {(["loss", "cart", "missing", "zero", "loading", "error"] as const).map(value => <Link key={value} href={`/mira-polish/analytics?state=${value}`} aria-current={state === value ? "page" : undefined}>{value}</Link>)}
        </nav>
        <div className={analyticsStyles.root}>
          <h1 className="sr-only">Analitik görsel test</h1>
          <CommerceAnalyticsOverviewPresentation {...fixtureProps(state)} />
        </div>
      </div>
    </PanelPageShell>
  </PanelLayoutClient>;
}
