import {ProfitabilityConsole} from '@/components/accounting/ProfitabilityConsole';
import {requireServerPanelAccess} from '@/lib/server-access';
export default async function ProfitabilityPage(){const{tenantContext,accountingAccess}=await requireServerPanelAccess(),role=tenantContext.membership.role;return<ProfitabilityConsole canRead={role==='store_owner'||role==='admin'||role==='cashier'&&accountingAccess?.canManageAccounting===true} scopeKey={`${tenantContext.store.id}:${tenantContext.membership.id}`}/>;}
