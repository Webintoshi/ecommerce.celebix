import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { OrderDetailConsole, type OrderUiCapabilities } from "@/components/orders/OrderDetailConsole";
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const [{ orderId }, access] = await Promise.all([params, requireServerPanelAccess()]);
  const role = access.tenantContext.membership.role;
  const capabilities: OrderUiCapabilities = Object.freeze({
    fulfill: isMerchantActionAllowed(role, "orders.fulfill"),
    manage: isMerchantActionAllowed(role, "orders.manage"),
    payment: isMerchantActionAllowed(role, "orders.payment"),
    shipping: isMerchantActionAllowed(role, "orders.fulfill"),
    note: isMerchantActionAllowed(role, "orders.note"),
  });
  return (
    <PanelShell model={createPanelChromeModel(access.tenantContext)}>
      <OrderDetailConsole orderId={orderId} capabilities={capabilities} />
    </PanelShell>
  );
}
