import {isMerchantActionAllowed} from '@celebix/saas-contracts';
import {SeoOverview} from '@/components/seo/SeoOverview';
import {requireServerPanelAccess} from '@/lib/server-access';
export default async function SeoPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const{tenantContext}=await requireServerPanelAccess();const query=await searchParams;const initialTab=query.tab==='sitemap'||query.tab==='links'||query.tab==='notifications'?query.tab:'checks';return <SeoOverview canManage={isMerchantActionAllowed(tenantContext.membership.role,'integrations.manage')} initialTab={initialTab}/>;}
