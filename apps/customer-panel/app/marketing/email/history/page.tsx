import {isMerchantActionAllowed} from '@celebix/saas-contracts';
import {MerchantModuleConsole} from '@/components/merchant-admin/MerchantModuleConsole';
import {PanelWorkspaceShell} from '@/components/panel/PanelWorkspaceShell';
import {MARKETING_WORKSPACE_TABS} from '@/lib/panel-ui/workspace-navigation';
import {requireServerPanelAccess} from '@/lib/server-access';

export default async function EmailCampaignHistoryPage() {
  const {tenantContext} = await requireServerPanelAccess();
  return <PanelWorkspaceShell title="E-posta kayıtları" tabs={MARKETING_WORKSPACE_TABS}>
    <MerchantModuleConsole kind="email_campaign" canManage={isMerchantActionAllowed(tenantContext.membership.role, 'marketing.manage')} embedded />
  </PanelWorkspaceShell>;
}
