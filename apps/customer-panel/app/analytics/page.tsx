import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { redirect } from "next/navigation";

import { AnalyticsDashboard } from "@/components/analytics/AnalyticsDashboard";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function AnalyticsPage() {
  const { tenantContext } = await requireServerPanelAccess();
  if (!isMerchantActionAllowed(tenantContext.membership.role, "analytics.read")) redirect("/unauthorized");
  return <AnalyticsDashboard />;
}
