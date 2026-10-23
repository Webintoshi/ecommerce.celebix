import {isMerchantActionAllowed} from '@celebix/saas-contracts';
import {TrendyolConsole} from '@/components/trendyol/TrendyolConsole';
import {PanelPageShell,PanelPageHeader} from '@/components/panel/PanelPageShell';
import {requireServerPanelAccess} from '@/lib/server-access';
export default async function TrendyolPage(){const {tenantContext}=await requireServerPanelAccess();const role=tenantContext.membership.role;return <PanelPageShell><PanelPageHeader title="Trendyol"/>{isMerchantActionAllowed(role,'integrations.read')?<TrendyolConsole canManage={isMerchantActionAllowed(role,'integrations.manage')}/>:<p>Bu bağlantıyı görüntüleme yetkiniz bulunmuyor.</p>}</PanelPageShell>;}
