"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelDashboardPresentation } from "@/components/dashboard/PanelDashboardHomeView";
import { readyAuthority, unavailableAuthority } from "@/lib/panel-ui/authority-slice";
import { DASHBOARD, MODEL } from "../full-parity-fixture";

export default function OverviewFixture() {
  const query = useSearchParams();
  const [recovered, setRecovered] = useState(false);
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("month");
  const scenario = query.get("state");
  const state = recovered ? "loaded" : scenario === "error" ? "error" : scenario === "loading" ? "loading" : "loaded";
  const empty = scenario === "empty";
  const now = "2026-07-24T12:00:00.000Z";
  const analytics = DASHBOARD.analytics.state === "ready" ? DASHBOARD.analytics.value : undefined;
  const dashboard = {
    ...DASHBOARD,
    carts: readyAuthority({ abandoned: 0, recovered: 0, lostValueCents: 0, recoveredValueCents: 0, currency: "TRY", asOf: now }, now),
    customers: readyAuthority({ active: 42, archived: 0, consentedEmail: 18, totalSpentCents: 1250000, currency: "TRY", asOf: now }, now),
    analytics: analytics && state !== "loading" ? readyAuthority({ ...analytics, period, ...(empty ? { revenueCents: 0, series: [], topProducts: [], orders: { total: 0, paid: 0, cancelled: 0, refunded: 0 }, customers: { ...analytics.customers, newInPeriod: 0 } } : {}) }, now) : unavailableAuthority(false),
    ...(empty ? {
      orders: readyAuthority({ totalOrders: 0, pendingOrders: 0, fulfilledOrders: 0, revenueCents: 0, currency: "TRY", asOf: now }, now),
      catalog: DASHBOARD.catalog.state === "ready" ? readyAuthority({ ...DASHBOARD.catalog.value, productsWithoutMedia: 0, metrics: DASHBOARD.catalog.value.metrics.map((metric) => ({ ...metric, value: 0 })) }, now) : DASHBOARD.catalog,
    } : {}),
  };
  return <PanelLayoutClient model={{ ...MODEL, storeDisplayName: "Örnek mağaza", analyticsAvailable: true }}>
    <p style={{ margin: "16px 20px 0", fontSize: 12 }}>Yerel tasarım testi · örnek veriler · canlı mağazaya bağlı değil</p>
    <PanelDashboardPresentation dashboard={dashboard} state={state} ordersState={state} analyticsState={state} cartsState={state} customersState={state} recentOrdersState={state} recentOrdersResolved={state === "loaded"} recentOrders={empty ? [] : [1, 2, 3, 4, 5].map((index) => ({ id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, orderNumber: `TEST-${index}`, customerName: "Örnek müşteri", itemCount: index, totalCents: index * 10000, currency: "TRY", status: "pending" as const, paymentStatus: "pending" as const, createdAt: now }))} activeVisitorsEnabled={false} period={period} onPeriodChange={setPeriod} onRefresh={() => setRecovered(true)} />
  </PanelLayoutClient>;
}
