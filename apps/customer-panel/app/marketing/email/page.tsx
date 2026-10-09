import { isMerchantActionAllowed } from "@celebix/saas-contracts";

import { EmailMarketingConnections } from "@/components/email-marketing/EmailMarketingConnections";
import { PanelWorkspaceShell } from "@/components/panel/PanelWorkspaceShell";
import { MARKETING_WORKSPACE_TABS } from "@/lib/panel-ui/workspace-navigation";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function MarketingEmailPage() {
  const { tenantContext } = await requireServerPanelAccess();
  return (
    <PanelWorkspaceShell title="E-posta" tabs={MARKETING_WORKSPACE_TABS}>
      {isMerchantActionAllowed(tenantContext.membership.role, "integrations.read") ?
        <EmailMarketingConnections canManage={isMerchantActionAllowed(tenantContext.membership.role, "integrations.manage")} configured={process.env.CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED === 'true'} /> :
        <p>Bu bağlantıları görüntüleme yetkiniz bulunmuyor.</p>}
    </PanelWorkspaceShell>
  );
}
