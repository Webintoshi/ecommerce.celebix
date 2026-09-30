import {isMerchantActionAllowed} from '@celebix/saas-contracts';
import {SeoSettings} from '@/components/seo/SeoSettings';
import {requireServerPanelAccess} from '@/lib/server-access';
export default async function SeoSettingsPage(){const{tenantContext}=await requireServerPanelAccess();return <SeoSettings canManage={isMerchantActionAllowed(tenantContext.membership.role,'integrations.manage')}/>;}
