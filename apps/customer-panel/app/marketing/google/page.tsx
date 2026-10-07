import { isMerchantActionAllowed } from "@celebix/saas-contracts";
import { GoogleMarketingConnections } from "@/components/google-marketing/GoogleMarketingConnections";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { MARKETING_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function GoogleMarketingPage() {
  const { tenantContext } = await requireServerPanelAccess();
  const canRead = isMerchantActionAllowed(tenantContext.membership.role, "integrations.read");
  const canManage = isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage");
  return <PanelWorkspaceShell title="Google Bağlantıları" tabs={MARKETING_WORKSPACE_TABS}>
    {canRead ? <GoogleMarketingConnections canManage={canManage} /> : <p>Bu bağlantıları görüntüleme yetkiniz bulunmuyor.</p>}
  </PanelWorkspaceShell>;
}
