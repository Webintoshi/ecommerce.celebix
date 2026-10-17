import {SupplierDebtsConsole} from '@/components/accounting/SupplierDebtsConsole';
import {requireServerPanelAccess} from '@/lib/server-access';
export default async function SupplierDebtsPage(){const{tenantContext,accountingAccess}=await requireServerPanelAccess(),role=tenantContext.membership.role;return<SupplierDebtsConsole canManage={role==='store_owner'||role==='admin'||role==='cashier'&&accountingAccess?.canManageAccounting===true} scopeKey={`${tenantContext.store.id}:${tenantContext.membership.id}`}/>;}
