import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { OrderDraftEditor } from "@/components/orders/OrderDraftEditor";
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function OrderDraftDetailPage({ params }: { params: Promise<{ draftId: string }> }) {
  const [{ draftId }, access] = await Promise.all([params, requireServerPanelAccess()]);
  const canManage = isMerchantActionAllowed(access.tenantContext.membership.role, "orders.manage");
  return (
    <PanelShell model={createPanelChromeModel(access.tenantContext)}>
      <OrderDraftEditor draftId={draftId} canManage={canManage} />
    </PanelShell>
  );
}
