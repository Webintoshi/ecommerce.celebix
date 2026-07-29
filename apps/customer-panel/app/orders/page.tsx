import { OrderListConsole } from "@/components/orders/OrderListConsole";
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const access = await requireServerPanelAccess();
  return <PanelShell model={createPanelChromeModel(access.tenantContext)}><OrderListConsole /></PanelShell>;
}
