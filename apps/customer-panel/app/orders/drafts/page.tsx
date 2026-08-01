import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { OrderDraftListConsole } from "@/components/orders/OrderDraftListConsole";
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrderDraftsPage() {
  const access = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(access.tenantContext.membership.role, "orders.manage");
  return (
    <PanelShell model={createPanelChromeModel(access.tenantContext)}>
      <OrderDraftListConsole canManage={canManage} />
    </PanelShell>
  );
}
