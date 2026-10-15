import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantMarketingOverview } from "@/components/merchant-admin/MerchantMarketingOverview";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { MARKETING_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function MarketingPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "marketing.manage");
  return (
    <PanelWorkspaceShell
      title="Pazarlama"
      description="İzinli kitlelere ait kampanya taslaklarını kanala göre yönetin."
      tabs={MARKETING_WORKSPACE_TABS}
    >
      <MerchantMarketingOverview canManage={canManage} embedded />
    </PanelWorkspaceShell>
  );
}
