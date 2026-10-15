import {ProfitabilityConsole} from '@/components/accounting/ProfitabilityConsole';
import {requireServerPanelAccess} from '@/lib/server-access';
export default async function ProfitabilityPage(){const{tenantContext}=await requireServerPanelAccess(),role=tenantContext.membership.role;return<ProfitabilityConsole canRead={role==='store_owner'||role==='admin'} scopeKey={`${tenantContext.store.id}:${tenantContext.membership.id}`}/>;}
