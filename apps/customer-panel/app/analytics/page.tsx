import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { CommerceAnalyticsWorkspace } from "@/components/analytics/CommerceAnalyticsWorkspace";
import { PanelAnalyticsView } from "@/components/analytics/PanelAnalyticsView";
import { requireServerPanelAccess } from "@/lib/server-access";

const TABS = new Set(["overview", "funnel", "carts", "acquisition", "products"]);
const RANGES = new Set(["today", "7d", "30d", "90d"]);

export default async function AnalyticsPage({ searchParams }: Readonly<{ searchParams?: Promise<Record<string, string | string[] | undefined>> }>) {
  const [{ tenantContext }, query] = await Promise.all([requireServerPanelAccess(), searchParams]);
  if (!isMerchantActionAllowed(tenantContext.membership.role, "analytics.read")) redirect("/unauthorized");
  const rawTab = typeof query?.tab === "string" ? query.tab : "overview";
  const rawRange = typeof query?.range === "string" ? query.range : "30d";
  const tab = (TABS.has(rawTab) ? rawTab : "overview") as "overview" | "funnel" | "carts" | "acquisition" | "products";
  const customFrom = typeof query?.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? query.from : undefined;
  const customTo = typeof query?.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? query.to : undefined;
  const range = (customFrom && customTo ? "custom" : RANGES.has(rawRange) ? rawRange : "30d") as "today" | "7d" | "30d" | "90d" | "custom";
  return (
    <>
      <CommerceAnalyticsWorkspace tab={tab} range={range} compare={query?.compare === "1"} customFrom={customFrom} customTo={customTo} />
      {tab === "overview" || tab === "products" ? <AnalyticsDashboard /> : null}
      {tab === "overview" || tab === "acquisition" ? <PanelAnalyticsView /> : null}
    </>
  );
}
