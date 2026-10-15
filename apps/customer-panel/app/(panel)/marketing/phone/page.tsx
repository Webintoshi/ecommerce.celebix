import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { MARKETING_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function MarketingPhonePage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <PanelWorkspaceShell title="Pazarlama" description="İzinli kitlelere ait kampanya taslaklarını kanala göre yönetin." tabs={MARKETING_WORKSPACE_TABS}>
      <MerchantModuleConsole kind="phone_campaign" canManage={isMerchantActionAllowed(tenantContext.membership.role, "marketing.manage")} embedded />
    </PanelWorkspaceShell>
  );
}
