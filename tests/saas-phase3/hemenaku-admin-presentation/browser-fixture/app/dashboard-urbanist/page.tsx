"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { PanelDashboardPresentation } from "@/components/dashboard/PanelDashboardHomeView";
import { readyAuthority, unavailableAuthority } from "@/lib/panel-ui/authority-slice";
import { DASHBOARD, MODEL } from "../full-parity-fixture";

const dashboard = {
  ...DASHBOARD,
  carts: readyAuthority({ abandoned: 0, recovered: 0, lostValueCents: 0, recoveredValueCents: 0, currency: "TRY", asOf: "2026-07-24T12:00:00.000Z" }, "2026-07-24T12:00:00.000Z"),
  customers: readyAuthority({ active: 42, archived: 0, consentedEmail: 18, totalSpentCents: 1250000, currency: "TRY", asOf: "2026-07-24T12:00:00.000Z" }, "2026-07-24T12:00:00.000Z"),
};

const recentOrders = ["Ada Yılmaz", "Deniz Kaya", "Ece Demir", "Mert Aydın", "Selin Uzun"].map((customerName, index) => ({
  id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, "0")}`,
  orderNumber: `SIP-${1042 - index}`,
  customerName,
  itemCount: index + 1,
  totalCents: 145000 + index * 25000,
  currency: "TRY",
  status: index === 0 ? "pending" as const : "delivered" as const,
  paymentStatus: index === 0 ? "pending" as const : "completed" as const,
  createdAt: "2026-07-24T12:00:00.000Z",
}));

export default function DashboardUrbanistFixture() {
  const query = useSearchParams();
  const [recovered, setRecovered] = useState(false);
  const state = recovered ? "loaded" : query.get("state") === "error" ? "error" : query.get("state") === "loading" ? "loading" : "loaded";
  return <PanelLayoutClient model={MODEL}><PanelDashboardPresentation
    dashboard={state === "loading" ? { ...dashboard, analytics: unavailableAuthority(false), orders: unavailableAuthority(false), catalog: unavailableAuthority(false) } : dashboard} state={state} ordersState={state} analyticsState={state} cartsState={state} customersState={state}
    recentOrdersState={state} recentOrdersResolved={state === "loaded"}
    recentOrders={query.get("state") === "empty" ? [] : recentOrders}
    activeVisitorsEnabled={false} onRefresh={() => setRecovered(true)}
  /></PanelLayoutClient>;
}
