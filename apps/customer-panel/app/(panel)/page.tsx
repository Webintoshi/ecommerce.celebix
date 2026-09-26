import { PanelDashboardHomeView } from "@/components/dashboard/PanelDashboardHomeView";

import { requireServerPanelAccess } from "@/lib/server-access";
import { redirect } from "next/navigation";

export default async function PanelHomePage() {
  const access=await requireServerPanelAccess();
  if(access.tenantContext.membership.role === "cashier") redirect("/orders/quick-links");
  return <PanelDashboardHomeView />;
}
