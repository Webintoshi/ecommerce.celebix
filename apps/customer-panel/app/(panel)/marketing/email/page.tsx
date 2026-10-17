import { createHash } from 'node:crypto';
import { getCommercialPackage, hasCommercialCapability, isMerchantActionAllowed } from '@celebix/saas-contracts';
import { CommercialRoleContact, CommercialUpgradeCard } from '@/components/commercial-packages/CommercialUpgradeCard';
import { NativeMarketingWorkspace } from '@/components/native-marketing/NativeMarketingWorkspace';
import { PanelWorkspaceShell } from '@/components/panel/PanelWorkspaceShell';
import { MARKETING_WORKSPACE_TABS } from '@/lib/panel-ui/workspace-navigation';
import { requireServerPanelAccess } from '@/lib/server-access';
import { nativeMarketingPublicConfiguration } from '@/lib/server-native-marketing/runtime';

export default async function MarketingEmailPage() {
  const { session, tenantContext, support } = await requireServerPanelAccess();
  const canRead = isMerchantActionAllowed(tenantContext.membership.role, 'integrations.read');
  const available = hasCommercialCapability(tenantContext.entitlements, 'email_marketing');
  const recoveryScope = createHash('sha256').update(JSON.stringify([session.id, tenantContext.principal.id, tenantContext.store.id])).digest('hex');
  return <PanelWorkspaceShell title="E-posta" tabs={MARKETING_WORKSPACE_TABS}>
    {!canRead ? <CommercialRoleContact /> : !available ? <CommercialUpgradeCard capability="email_marketing" currentPackage={getCommercialPackage(tenantContext.entitlements)} currentPlanName={tenantContext.entitlements.planCode} canRequest={tenantContext.membership.role === 'store_owner' && !support} /> : <NativeMarketingWorkspace key={recoveryScope} recoveryScope={recoveryScope} canManage={isMerchantActionAllowed(tenantContext.membership.role, 'integrations.manage')} nativeConfigured={nativeMarketingPublicConfiguration(process.env) !== null} connectionsConfigured={process.env.CELEBIX_EMAIL_MARKETING_CONNECTIONS_ENABLED === 'true'} />}
  </PanelWorkspaceShell>;
}
