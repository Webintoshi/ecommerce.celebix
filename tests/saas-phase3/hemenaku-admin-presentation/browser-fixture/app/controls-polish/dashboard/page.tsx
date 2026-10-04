"use client";

import { useMemo, useState } from "react";
import type { AnalyticsDashboard } from "@celebix/saas-contracts";
import { PanelDashboardPresentation } from "@/components/dashboard/PanelDashboardHomeView";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { readyAuthority } from "@/lib/panel-ui/authority-slice";
import { DASHBOARD, MODEL } from "../../full-parity-fixture";

// Isolated, local presentation fixture: native selection updates the actual view.
export default function DashboardControlsFixture() {
  const [period, setPeriod] = useState<AnalyticsDashboard["period"]>("month");
  const dashboard = useMemo(() => {
    if (DASHBOARD.analytics.state !== "ready") return DASHBOARD;
    const analytics = DASHBOARD.analytics.value;
    const starts = { today: "2026-07-24", week: "2026-07-20", month: "2026-07-01", year: "2026-01-01" };
    return { ...DASHBOARD, analytics: readyAuthority({ ...analytics, period, rangeStart: `${starts[period]}T00:00:00.000Z` }, analytics.generatedAt) };
  }, [period]);
  return <PanelLayoutClient model={{ ...MODEL, analyticsAvailable: true }}><PanelDashboardPresentation dashboard={dashboard} period={period} onPeriodChange={setPeriod} state="loaded" ordersState="loaded" analyticsState="loaded" recentOrdersState="loaded" activeVisitorsEnabled onRefresh={() => undefined} /></PanelLayoutClient>;
}
