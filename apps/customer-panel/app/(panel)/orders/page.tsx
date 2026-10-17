import { hasCommercialCapability } from "@celebix/saas-contracts";
import { OrderListConsole } from "@/components/orders/OrderListConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const access = await requireServerPanelAccess();
  return <><OrderListConsole manualSalesAvailable={hasCommercialCapability(access.tenantContext.entitlements, "manual_orders")} /></>;
}
